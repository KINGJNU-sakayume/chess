import {
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  CENTER_SQUARES,
  F_FROZEN,
  F_SHIELD,
  KING,
  KIND_LETTER,
  KNIGHT,
  LETTER_KIND,
  M_CAPTURE,
  M_CASTLE,
  M_DOUBLE,
  M_EP,
  M_WALL,
  PAWN,
  PROMOTION_KINDS,
  ROOK,
  T_NONE,
  T_TRAP_B,
  T_TRAP_W,
  T_WALL,
  WHITE,
  WIN_BREAKTHROUGH,
  WIN_HILL,
  WIN_KING_CAPTURE,
  WIN_THREE_CHECK,
  type Color,
} from './types';
import { BASE_RULES, buildProfile, type Profile, type SideRules } from './rules';
import { LEAPS, LEAP_SET_COUNT, OPP_DIR, RAYS } from './tables';
import {
  Z_CASTLE_HI,
  Z_CASTLE_LO,
  Z_CHECKS_HI,
  Z_CHECKS_LO,
  Z_EP_HI,
  Z_EP_LO,
  Z_FLAG_HI,
  Z_FLAG_LO,
  Z_PIECE_HI,
  Z_PIECE_LO,
  Z_SIDE_HI,
  Z_SIDE_LO,
  Z_TERRAIN_HI,
  Z_TERRAIN_LO,
} from './zobrist';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Plain, structured-clone-friendly copy of a position (saves, worker messages). */
export interface PositionData {
  board: number[];
  flags: number[];
  terrain: number[];
  side: Color;
  castling: number;
  ep: number;
  halfmove: number;
  ply: number;
  winner: number;
  winReason: number;
  checks: [number, number];
  lost: number[];
  rules: [SideRules, SideRules];
}

const J_BOARD = 0;
const J_FLAGS = 1;
const J_TERRAIN = 2;
const J_LOST = 3;
const J_CHECKS = 4;

/** Castling rights kept when a move touches a square (from or to). */
const CASTLE_KEEP = new Int8Array(64).fill(15);
CASTLE_KEEP[0] = 15 & ~CASTLE_WQ;
CASTLE_KEEP[7] = 15 & ~CASTLE_WK;
CASTLE_KEEP[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_KEEP[56] = 15 & ~CASTLE_BQ;
CASTLE_KEEP[63] = 15 & ~CASTLE_BK;
CASTLE_KEEP[60] = 15 & ~(CASTLE_BK | CASTLE_BQ);

/**
 * Mutable position with journaled make/unmake.
 *
 * Every mutation goes through a setter that records the old value, so
 * `push()`/`pop()` can undo any combination of effects (captures, shields,
 * traps, martyrs, card effects) exactly. The search makes and unmakes moves
 * on one instance; the UI clones.
 *
 * Royalty follows augment-chess rules: there is no checkmate, a move may leave
 * the own King attacked, and capturing the King wins. A side with no moves
 * loses.
 */
export class Position {
  board = new Int8Array(64);
  flags = new Uint8Array(64);
  terrain = new Uint8Array(64);
  side: Color = WHITE;
  castling = 0;
  ep = -1;
  halfmove = 0;
  /** Half-moves played since the start of the game. */
  ply = 0;
  kingSq = new Int8Array([-1, -1]);
  /** -1 while the game goes on, else the winning colour. */
  winner = -1;
  winReason = 0;
  /** Checks delivered by each side (three-check). */
  checks = new Int8Array(2);
  /** Pieces each side has lost, by kind: lost[color * 16 + kind]. */
  lost = new Int8Array(32);
  frozenCount = new Int8Array(2);
  hashLo = 0;
  hashHi = 0;
  rules: [SideRules, SideRules] = [{ ...BASE_RULES }, { ...BASE_RULES }];
  profiles: [Profile, Profile] = [buildProfile(BASE_RULES), buildProfile(BASE_RULES)];

  // Journal of (kind, index, old value).
  private jKind = new Uint8Array(512);
  private jIdx = new Uint8Array(512);
  private jOld = new Int16Array(512);
  private jTop = 0;
  // Saved scalars, one frame per push().
  private frames: Int32Array = new Int32Array(16 * 64);
  private fTop = 0;

  static readonly FRAME = 16;

  // ---------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------

  static fromFen(fen: string, rules?: [SideRules, SideRules]): Position {
    const p = new Position();
    const parts = fen.trim().split(/\s+/);
    const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = parts;
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`Invalid FEN: ${fen}`);
    rows.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
          continue;
        }
        const kind = LETTER_KIND[ch.toLowerCase()];
        if (!kind) throw new Error(`Invalid FEN piece: ${ch}`);
        p.board[rank * 8 + file] = kind | ((ch === ch.toUpperCase() ? WHITE : BLACK) << 4);
        file++;
      }
      if (file !== 8) throw new Error(`Invalid FEN row: ${row}`);
    });
    p.side = turn === 'b' ? BLACK : WHITE;
    p.castling =
      (castling.includes('K') ? CASTLE_WK : 0) |
      (castling.includes('Q') ? CASTLE_WQ : 0) |
      (castling.includes('k') ? CASTLE_BK : 0) |
      (castling.includes('q') ? CASTLE_BQ : 0);
    p.ep = ep === '-' ? -1 : 'abcdefgh'.indexOf(ep[0]) + (Number(ep[1]) - 1) * 8;
    p.halfmove = Number(half);
    p.ply = (Number(full) - 1) * 2 + (p.side === BLACK ? 1 : 0);
    if (rules) p.rules = [{ ...rules[0] }, { ...rules[1] }];
    p.refresh();
    return p;
  }

  static fromData(d: PositionData): Position {
    const p = new Position();
    p.board.set(d.board);
    p.flags.set(d.flags);
    p.terrain.set(d.terrain);
    p.side = d.side;
    p.castling = d.castling;
    p.ep = d.ep;
    p.halfmove = d.halfmove;
    p.ply = d.ply;
    p.winner = d.winner;
    p.winReason = d.winReason;
    p.checks[0] = d.checks[0];
    p.checks[1] = d.checks[1];
    p.lost.set(d.lost);
    p.rules = [{ ...d.rules[0] }, { ...d.rules[1] }];
    p.refresh();
    return p;
  }

  toData(): PositionData {
    return {
      board: Array.from(this.board),
      flags: Array.from(this.flags),
      terrain: Array.from(this.terrain),
      side: this.side,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      ply: this.ply,
      winner: this.winner,
      winReason: this.winReason,
      checks: [this.checks[0], this.checks[1]],
      lost: Array.from(this.lost),
      rules: [{ ...this.rules[0] }, { ...this.rules[1] }],
    };
  }

  clone(): Position {
    return Position.fromData(this.toData());
  }

  /** Recompute derived data (kings, frozen counts, profiles, hash) after direct edits. */
  refresh(): void {
    this.kingSq[0] = -1;
    this.kingSq[1] = -1;
    this.frozenCount[0] = 0;
    this.frozenCount[1] = 0;
    for (let sq = 0; sq < 64; sq++) {
      const c = this.board[sq];
      if (c === 0) {
        this.flags[sq] = 0;
        continue;
      }
      if ((c & 15) === KING) this.kingSq[c >> 4] = sq;
      if (this.flags[sq] & F_FROZEN) this.frozenCount[c >> 4]++;
    }
    this.profiles = [buildProfile(this.rules[0]), buildProfile(this.rules[1])];
    const [lo, hi] = this.computeHash();
    this.hashLo = lo;
    this.hashHi = hi;
  }

  /** Replace one side's rules (passive augments) and rebuild its geometry. */
  setRules(color: Color, rules: SideRules): void {
    this.rules[color] = { ...rules };
    this.profiles[color] = buildProfile(this.rules[color]);
  }

  computeHash(): [number, number] {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 64; sq++) {
      const c = this.board[sq];
      if (c) {
        lo ^= Z_PIECE_LO[c * 64 + sq];
        hi ^= Z_PIECE_HI[c * 64 + sq];
      }
      const f = this.flags[sq];
      if (f & F_SHIELD) {
        lo ^= Z_FLAG_LO[sq];
        hi ^= Z_FLAG_HI[sq];
      }
      if (f & F_FROZEN) {
        lo ^= Z_FLAG_LO[64 + sq];
        hi ^= Z_FLAG_HI[64 + sq];
      }
      const t = this.terrain[sq];
      if (t) {
        lo ^= Z_TERRAIN_LO[t * 64 + sq];
        hi ^= Z_TERRAIN_HI[t * 64 + sq];
      }
    }
    lo ^= Z_CASTLE_LO[this.castling];
    hi ^= Z_CASTLE_HI[this.castling];
    if (this.ep >= 0) {
      lo ^= Z_EP_LO[this.ep];
      hi ^= Z_EP_HI[this.ep];
    }
    for (let c = 0; c < 2; c++) {
      const n = Math.min(3, this.checks[c]);
      if (n) {
        lo ^= Z_CHECKS_LO[c * 4 + n];
        hi ^= Z_CHECKS_HI[c * 4 + n];
      }
    }
    if (this.side === BLACK) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    return [lo, hi];
  }

  /** A short string key of the hash (repetition tables in the UI). */
  hashKey(): string {
    return `${(this.hashHi >>> 0).toString(36)}.${(this.hashLo >>> 0).toString(36)}`;
  }

  get fullmove(): number {
    return (this.ply >> 1) + 1;
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const c = this.board[rank * 8 + file];
        if (!c) {
          empty++;
          continue;
        }
        if (empty) row += String(empty);
        empty = 0;
        const letter = KIND_LETTER[c & 15];
        row += c >> 4 === WHITE ? letter : letter.toLowerCase();
      }
      if (empty) row += String(empty);
      rows.push(row);
    }
    const c = this.castling;
    const castling =
      (c & CASTLE_WK ? 'K' : '') + (c & CASTLE_WQ ? 'Q' : '') + (c & CASTLE_BK ? 'k' : '') + (c & CASTLE_BQ ? 'q' : '') || '-';
    const ep = this.ep < 0 ? '-' : 'abcdefgh'[this.ep & 7] + String((this.ep >> 3) + 1);
    return [rows.join('/'), this.side === WHITE ? 'w' : 'b', castling, ep, this.halfmove, this.fullmove].join(' ');
  }

  // ---------------------------------------------------------------------
  // Journaled setters
  // ---------------------------------------------------------------------

  private journal(kind: number, idx: number, old: number): void {
    if (this.jTop === this.jKind.length) {
      const n = this.jKind.length * 2;
      const k = new Uint8Array(n);
      const i = new Uint8Array(n);
      const o = new Int16Array(n);
      k.set(this.jKind);
      i.set(this.jIdx);
      o.set(this.jOld);
      this.jKind = k;
      this.jIdx = i;
      this.jOld = o;
    }
    this.jKind[this.jTop] = kind;
    this.jIdx[this.jTop] = idx;
    this.jOld[this.jTop] = old;
    this.jTop++;
  }

  setPiece(sq: number, code: number): void {
    const old = this.board[sq];
    if (old === code) return;
    this.journal(J_BOARD, sq, old);
    if (old) {
      this.hashLo ^= Z_PIECE_LO[old * 64 + sq];
      this.hashHi ^= Z_PIECE_HI[old * 64 + sq];
      if ((old & 15) === KING && this.kingSq[old >> 4] === sq) this.kingSq[old >> 4] = -1;
    }
    this.board[sq] = code;
    if (code) {
      this.hashLo ^= Z_PIECE_LO[code * 64 + sq];
      this.hashHi ^= Z_PIECE_HI[code * 64 + sq];
      if ((code & 15) === KING) this.kingSq[code >> 4] = sq;
    }
  }

  /** Flags belong to the piece on the square; set them while the piece is there. */
  setFlags(sq: number, f: number): void {
    const old = this.flags[sq];
    if (old === f) return;
    this.journal(J_FLAGS, sq, old);
    const diff = old ^ f;
    if (diff & F_SHIELD) {
      this.hashLo ^= Z_FLAG_LO[sq];
      this.hashHi ^= Z_FLAG_HI[sq];
    }
    if (diff & F_FROZEN) {
      this.hashLo ^= Z_FLAG_LO[64 + sq];
      this.hashHi ^= Z_FLAG_HI[64 + sq];
      const owner = this.board[sq] >> 4;
      this.frozenCount[owner] += f & F_FROZEN ? 1 : -1;
    }
    this.flags[sq] = f;
  }

  setTerrain(sq: number, t: number): void {
    const old = this.terrain[sq];
    if (old === t) return;
    this.journal(J_TERRAIN, sq, old);
    if (old) {
      this.hashLo ^= Z_TERRAIN_LO[old * 64 + sq];
      this.hashHi ^= Z_TERRAIN_HI[old * 64 + sq];
    }
    if (t) {
      this.hashLo ^= Z_TERRAIN_LO[t * 64 + sq];
      this.hashHi ^= Z_TERRAIN_HI[t * 64 + sq];
    }
    this.terrain[sq] = t;
  }

  addLost(color: Color, kind: number, delta = 1): void {
    const i = color * 16 + kind;
    this.journal(J_LOST, i, this.lost[i]);
    this.lost[i] += delta;
  }

  setChecks(color: Color, n: number): void {
    const old = this.checks[color];
    if (old === n) return;
    this.journal(J_CHECKS, color, old);
    const a = Math.min(3, old);
    const b = Math.min(3, n);
    if (a) {
      this.hashLo ^= Z_CHECKS_LO[color * 4 + a];
      this.hashHi ^= Z_CHECKS_HI[color * 4 + a];
    }
    if (b) {
      this.hashLo ^= Z_CHECKS_LO[color * 4 + b];
      this.hashHi ^= Z_CHECKS_HI[color * 4 + b];
    }
    this.checks[color] = n;
  }

  private setCastling(c: number): void {
    if (c === this.castling) return;
    this.hashLo ^= Z_CASTLE_LO[this.castling] ^ Z_CASTLE_LO[c];
    this.hashHi ^= Z_CASTLE_HI[this.castling] ^ Z_CASTLE_HI[c];
    this.castling = c;
  }

  private setEp(sq: number): void {
    if (sq === this.ep) return;
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP_LO[this.ep];
      this.hashHi ^= Z_EP_HI[this.ep];
    }
    if (sq >= 0) {
      this.hashLo ^= Z_EP_LO[sq];
      this.hashHi ^= Z_EP_HI[sq];
    }
    this.ep = sq;
  }

  /** Remove the piece on `sq`, unless a shield absorbs it. Returns true if it was removed. */
  destroy(sq: number): boolean {
    const code = this.board[sq];
    if (!code) return false;
    const f = this.flags[sq];
    if (f & F_SHIELD) {
      this.setFlags(sq, f & ~F_SHIELD);
      return false;
    }
    this.setFlags(sq, 0);
    this.setPiece(sq, 0);
    this.addLost((code >> 4) as Color, code & 15);
    return true;
  }

  // ---------------------------------------------------------------------
  // State frames
  // ---------------------------------------------------------------------

  /** Save the scalar state and journal position; `pop()` undoes everything since. */
  push(): void {
    const F = Position.FRAME;
    if ((this.fTop + 1) * F > this.frames.length) {
      const n = new Int32Array(this.frames.length * 2);
      n.set(this.frames);
      this.frames = n;
    }
    const b = this.fTop * F;
    const fr = this.frames;
    fr[b] = this.jTop;
    fr[b + 1] = this.castling;
    fr[b + 2] = this.ep;
    fr[b + 3] = this.halfmove;
    fr[b + 4] = this.side;
    fr[b + 5] = this.winner;
    fr[b + 6] = this.winReason;
    fr[b + 7] = this.hashLo;
    fr[b + 8] = this.hashHi;
    fr[b + 9] = this.kingSq[0];
    fr[b + 10] = this.kingSq[1];
    fr[b + 11] = this.frozenCount[0];
    fr[b + 12] = this.frozenCount[1];
    fr[b + 13] = this.ply;
    this.fTop++;
  }

  pop(): void {
    this.fTop--;
    const b = this.fTop * Position.FRAME;
    const fr = this.frames;
    const top = fr[b];
    while (this.jTop > top) {
      this.jTop--;
      const i = this.jIdx[this.jTop];
      const old = this.jOld[this.jTop];
      switch (this.jKind[this.jTop]) {
        case J_BOARD:
          this.board[i] = old;
          break;
        case J_FLAGS:
          this.flags[i] = old;
          break;
        case J_TERRAIN:
          this.terrain[i] = old;
          break;
        case J_LOST:
          this.lost[i] = old;
          break;
        case J_CHECKS:
          this.checks[i] = old;
          break;
      }
    }
    this.castling = fr[b + 1];
    this.ep = fr[b + 2];
    this.halfmove = fr[b + 3];
    this.side = fr[b + 4] as Color;
    this.winner = fr[b + 5];
    this.winReason = fr[b + 6];
    this.hashLo = fr[b + 7];
    this.hashHi = fr[b + 8];
    this.kingSq[0] = fr[b + 9];
    this.kingSq[1] = fr[b + 10];
    this.frozenCount[0] = fr[b + 11];
    this.frozenCount[1] = fr[b + 12];
    this.ply = fr[b + 13];
  }

  /** Forget undo history (the UI calls this after committing an action). */
  commit(): void {
    this.jTop = 0;
    this.fTop = 0;
  }

  // ---------------------------------------------------------------------
  // Attacks
  // ---------------------------------------------------------------------

  /** True if a piece of `by` could capture on `sq` with its next move (frozen pieces cannot). */
  isAttacked(sq: number, by: Color): boolean {
    const board = this.board;
    const flags = this.flags;
    const prof = this.profiles[by];
    // Pawns: an attacking pawn stands one step "behind" sq from its own point of view.
    const pawn = PAWN | (by << 4);
    const behind = sq - (by === WHITE ? 8 : -8);
    if (behind >= 0 && behind < 64) {
      const f = sq & 7;
      if (f > 0 && board[behind - 1] === pawn && !(flags[behind - 1] & F_FROZEN)) return true;
      if (f < 7 && board[behind + 1] === pawn && !(flags[behind + 1] & F_FROZEN)) return true;
      if (this.rules[by].pawnPike && board[behind] === pawn && !(flags[behind] & F_FROZEN)) return true;
    }
    const pr = this.rules[by];
    if (pr.pawnSidestep || pr.pawnRetreat) {
      const f = sq & 7;
      // Sidestep: a pawn right beside sq captures sideways.
      if (pr.pawnSidestep) {
        if (f > 0 && board[sq - 1] === pawn && !(flags[sq - 1] & F_FROZEN)) return true;
        if (f < 7 && board[sq + 1] === pawn && !(flags[sq + 1] & F_FROZEN)) return true;
      }
      // Retreat: a pawn one step "ahead" of sq captures diagonally backwards (never onto its back rank).
      const ahead = sq + (by === WHITE ? 8 : -8);
      const rel = by === WHITE ? sq >> 3 : 7 - (sq >> 3);
      if (pr.pawnRetreat && rel >= 1 && ahead >= 0 && ahead < 64) {
        if (f > 0 && board[ahead - 1] === pawn && !(flags[ahead - 1] & F_FROZEN)) return true;
        if (f < 7 && board[ahead + 1] === pawn && !(flags[ahead + 1] & F_FROZEN)) return true;
      }
    }
    // Leapers (every leap set is symmetric).
    for (let s = 0; s < LEAP_SET_COUNT; s++) {
      const mask = prof.leapMask[s];
      if (!mask) continue;
      const targets = LEAPS[s][sq];
      for (let j = 0; j < targets.length; j++) {
        const t = targets[j];
        const c = board[t];
        if (c !== 0 && c >> 4 === by && mask & (1 << (c & 15)) && !(flags[t] & F_FROZEN)) return true;
      }
    }
    // Sliders and steppers along rays.
    const terrain = this.terrain;
    const range = prof.rayRange;
    for (let d = 0; d < 8; d++) {
      const ray = RAYS[d * 64 + sq];
      const od = OPP_DIR[d];
      for (let k = 0; k < ray.length; k++) {
        const s2 = ray[k];
        const c = board[s2];
        if (c === 0) {
          if (terrain[s2] === T_WALL) break;
          continue;
        }
        if (c >> 4 === by && range[(c & 15) * 8 + od] > k && !(flags[s2] & F_FROZEN)) return true;
        break;
      }
    }
    return false;
  }

  /** Is `color`'s King attacked (would be captured if nothing changes)? */
  inCheck(color: Color): boolean {
    const k = this.kingSq[color];
    return k >= 0 && this.isAttacked(k, (color ^ 1) as Color);
  }

  // ---------------------------------------------------------------------
  // Move generation
  // ---------------------------------------------------------------------

  /**
   * Write the side to move's moves into `out` from index `start`; returns the
   * end index. `noisy` keeps only captures and queen promotions (quiescence).
   */
  generateMoves(out: Int32Array, start: number, noisy = false): number {
    let n = start;
    const us = this.side;
    const board = this.board;
    const flags = this.flags;
    const terrain = this.terrain;
    const prof = this.profiles[us];
    const range = prof.rayRange;
    for (let sq = 0; sq < 64; sq++) {
      const code = board[sq];
      if (code === 0 || code >> 4 !== us) continue;
      if (flags[sq] & F_FROZEN) continue;
      const kind = code & 15;
      if (kind === PAWN) {
        n = this.genPawn(sq, out, n, noisy);
        continue;
      }
      const sets = prof.leapSets[kind];
      for (let i = 0; i < sets.length; i++) {
        const targets = LEAPS[sets[i]][sq];
        for (let j = 0; j < targets.length; j++) {
          const to = targets[j];
          const t = board[to];
          if (t !== 0) {
            if (t >> 4 !== us) out[n++] = sq | (to << 6) | M_CAPTURE;
          } else if (!noisy) {
            out[n++] = terrain[to] === T_WALL ? sq | (to << 6) | M_WALL : sq | (to << 6);
          }
        }
      }
      const base = kind * 8;
      for (let d = 0; d < 8; d++) {
        const r = range[base + d];
        if (r === 0) continue;
        const ray = RAYS[d * 64 + sq];
        const lim = r < ray.length ? r : ray.length;
        for (let k = 0; k < lim; k++) {
          const to = ray[k];
          const t = board[to];
          if (t !== 0) {
            if (t >> 4 !== us) out[n++] = sq | (to << 6) | M_CAPTURE;
            break;
          }
          if (terrain[to] === T_WALL) {
            if (!noisy) out[n++] = sq | (to << 6) | M_WALL;
            break;
          }
          if (!noisy) out[n++] = sq | (to << 6);
        }
      }
      if (kind === KING && !noisy) n = this.genCastles(sq, out, n);
    }
    return n;
  }

  private pushPawnMove(out: Int32Array, n: number, from: number, to: number, flags: number, noisy: boolean): number {
    const us = this.side;
    const rel = us === WHITE ? to >> 3 : 7 - (to >> 3);
    if (rel >= this.rules[us].promoRank) {
      if (noisy) {
        out[n++] = from | (to << 6) | (PROMOTION_KINDS[0] << 12) | flags;
        return n;
      }
      for (let i = 0; i < PROMOTION_KINDS.length; i++) out[n++] = from | (to << 6) | (PROMOTION_KINDS[i] << 12) | flags;
      return n;
    }
    if (noisy && !(flags & (M_CAPTURE | M_EP))) return n;
    out[n++] = from | (to << 6) | flags;
    return n;
  }

  private genPawn(sq: number, out: Int32Array, n: number, noisy: boolean): number {
    const us = this.side;
    const rules = this.rules[us];
    const board = this.board;
    const terrain = this.terrain;
    const fwd = us === WHITE ? 8 : -8;
    const file = sq & 7;
    const rel = us === WHITE ? sq >> 3 : 7 - (sq >> 3);
    if (rel < 7) {
      const one = sq + fwd;
      const c1 = board[one];
      if (c1 === 0 && terrain[one] !== T_WALL) {
        n = this.pushPawnMove(out, n, sq, one, 0, noisy);
        if ((rel === 1 || rules.pawnCharge) && rel <= 5) {
          const two = one + fwd;
          if (board[two] === 0 && terrain[two] !== T_WALL) n = this.pushPawnMove(out, n, sq, two, M_DOUBLE, noisy);
        }
      } else if (rules.pawnPike) {
        if (c1 !== 0 && c1 >> 4 !== us) n = this.pushPawnMove(out, n, sq, one, M_CAPTURE, noisy);
        else if (c1 === 0 && !noisy) n = this.pushPawnMove(out, n, sq, one, M_WALL, noisy);
      }
      for (let df = -1; df <= 1; df += 2) {
        const f = file + df;
        if (f < 0 || f > 7) continue;
        const to = one + df;
        const t = board[to];
        if (t !== 0) {
          if (t >> 4 !== us) n = this.pushPawnMove(out, n, sq, to, M_CAPTURE, noisy);
        } else if (to === this.ep && terrain[to] !== T_WALL && board[sq + df] === (PAWN | ((us ^ 1) << 4))) {
          n = this.pushPawnMove(out, n, sq, to, M_EP | M_CAPTURE, noisy);
        } else if (terrain[to] === T_WALL && !noisy) {
          n = this.pushPawnMove(out, n, sq, to, M_WALL, noisy);
        }
      }
    }
    if (rules.pawnSidestep) {
      for (let df = -1; df <= 1; df += 2) {
        const f = file + df;
        if (f < 0 || f > 7) continue;
        const to = sq + df;
        const t = board[to];
        if (t !== 0) {
          if (t >> 4 !== us) n = this.pushPawnMove(out, n, sq, to, M_CAPTURE, noisy);
        } else if (!noisy && terrain[to] !== T_WALL) n = this.pushPawnMove(out, n, sq, to, 0, false);
      }
    }
    if (rules.pawnRetreat && rel >= 2) {
      const back = sq - fwd;
      if (!noisy && board[back] === 0 && terrain[back] !== T_WALL) n = this.pushPawnMove(out, n, sq, back, 0, false);
      for (let df = -1; df <= 1; df += 2) {
        const f = file + df;
        if (f < 0 || f > 7) continue;
        const t = board[back + df];
        if (t !== 0 && t >> 4 !== us) n = this.pushPawnMove(out, n, sq, back + df, M_CAPTURE, noisy);
      }
    }
    return n;
  }

  private genCastles(kingSq: number, out: Int32Array, n: number): number {
    const us = this.side;
    const home = us === WHITE ? 4 : 60;
    if (kingSq !== home) return n;
    const rights = this.castling & (us === WHITE ? CASTLE_WK | CASTLE_WQ : CASTLE_BK | CASTLE_BQ);
    if (!rights) return n;
    const board = this.board;
    const them = (us ^ 1) as Color;
    const rook = ROOK | (us << 4);
    let homeSafe = -1;
    const safe = (sq: number) => !this.isAttacked(sq, them);
    if (rights & (CASTLE_WK | CASTLE_BK)) {
      const r = home + 3;
      if (
        board[r] === rook &&
        !(this.flags[r] & F_FROZEN) &&
        board[home + 1] === 0 &&
        board[home + 2] === 0 &&
        this.terrain[home + 1] !== T_WALL &&
        this.terrain[home + 2] !== T_WALL
      ) {
        if (homeSafe < 0) homeSafe = safe(home) ? 1 : 0;
        if (homeSafe && safe(home + 1) && safe(home + 2)) out[n++] = home | ((home + 2) << 6) | M_CASTLE;
      }
    }
    if (rights & (CASTLE_WQ | CASTLE_BQ)) {
      const r = home - 4;
      if (
        board[r] === rook &&
        !(this.flags[r] & F_FROZEN) &&
        board[home - 1] === 0 &&
        board[home - 2] === 0 &&
        board[home - 3] === 0 &&
        this.terrain[home - 1] !== T_WALL &&
        this.terrain[home - 2] !== T_WALL &&
        this.terrain[home - 3] !== T_WALL
      ) {
        if (homeSafe < 0) homeSafe = safe(home) ? 1 : 0;
        if (homeSafe && safe(home - 1) && safe(home - 2)) out[n++] = home | ((home - 2) << 6) | M_CASTLE;
      }
    }
    return n;
  }

  /** Allocating convenience wrapper (UI, tests). */
  moves(): number[] {
    const buf = new Int32Array(512);
    const n = this.generateMoves(buf, 0, false);
    return Array.from(buf.subarray(0, n));
  }

  // ---------------------------------------------------------------------
  // Make / unmake
  // ---------------------------------------------------------------------

  makeMove(m: number): void {
    this.push();
    const us = this.side;
    const them = (us ^ 1) as Color;
    const from = m & 63;
    const to = (m >> 6) & 63;
    const promo = (m >> 12) & 15;
    const board = this.board;
    const mover = board[from];
    const moverKind = mover & 15;
    let half = this.halfmove + 1;
    this.setEp(-1);

    let capSq = m & M_EP ? to - (us === WHITE ? 8 : -8) : board[to] !== 0 ? to : -1;
    if (capSq >= 0 && board[capSq] === 0) capSq = -1;
    let victimKind = 0;
    if (capSq >= 0) {
      const victim = board[capSq];
      const vf = this.flags[capSq];
      if (vf & F_SHIELD) {
        // The shield breaks and the attacker bounces back to its square.
        this.setFlags(capSq, vf & ~F_SHIELD);
        this.halfmove = 0;
        this.finishTurn(us, them);
        // Thorns: the attacker freezes through its owner's next turn (set after finishTurn thawed this one).
        if (this.rules[them].thornShield && moverKind !== KING) this.setFlags(from, this.flags[from] | F_FROZEN);
        return;
      }
      victimKind = victim & 15;
      this.setFlags(capSq, 0);
      this.setPiece(capSq, 0);
      this.addLost(them, victimKind);
      half = 0;
      if (victimKind === KING && this.winner < 0) {
        this.winner = us;
        this.winReason = WIN_KING_CAPTURE;
      }
    } else if (this.terrain[to] === T_WALL) {
      this.setTerrain(to, T_NONE);
      half = 0;
    }

    this.setCastling(this.castling & CASTLE_KEEP[from] & CASTLE_KEEP[to]);
    const moverFlags = this.flags[from];
    if (moverFlags) this.setFlags(from, 0);
    this.setPiece(from, 0);
    const landed = promo ? promo | (us << 4) : mover;
    this.setPiece(to, landed);
    if (moverFlags & F_SHIELD) this.setFlags(to, F_SHIELD);
    if (moverKind === PAWN) half = 0;

    if (m & M_CASTLE) {
      const rFrom = to > from ? from + 3 : from - 4;
      const rTo = to > from ? from + 1 : from - 1;
      const rook = board[rFrom];
      const rf = this.flags[rFrom];
      if (rf) this.setFlags(rFrom, 0);
      this.setPiece(rFrom, 0);
      this.setPiece(rTo, rook);
      if (rf & F_SHIELD) this.setFlags(rTo, F_SHIELD);
    }

    let alive = true;
    const enemyTrap = them === WHITE ? T_TRAP_W : T_TRAP_B;
    if (this.terrain[to] === enemyTrap) {
      this.setTerrain(to, T_NONE);
      if ((landed & 15) !== KING) alive = !this.destroy(to);
    }
    if (alive && victimKind === PAWN && this.rules[them].martyrPawns && (landed & 15) !== KING) {
      alive = !this.destroy(to);
    }
    if (
      alive &&
      victimKind &&
      (((landed & 15) === KNIGHT && this.rules[us].knightOath) || (moverKind === PAWN && this.rules[us].pawnOath))
    ) {
      this.setFlags(to, this.flags[to] | F_SHIELD);
    }
    if (promo && this.rules[us].breakthrough && this.winner < 0) {
      this.winner = us;
      this.winReason = WIN_BREAKTHROUGH;
    }
    if (m & M_DOUBLE && alive && !promo) this.setEp((from + to) >> 1);
    this.halfmove = half;
    this.finishTurn(us, them);
  }

  unmakeMove(): void {
    this.pop();
  }

  private finishTurn(us: Color, them: Color): void {
    // Our pieces were frozen for this turn only.
    if (this.frozenCount[us] > 0) {
      for (let sq = 0; sq < 64; sq++) {
        const c = this.board[sq];
        if (c !== 0 && c >> 4 === us && this.flags[sq] & F_FROZEN) this.setFlags(sq, this.flags[sq] & ~F_FROZEN);
      }
    }
    const r = this.rules[us];
    if (this.winner < 0 && r.threeCheck) {
      const k = this.kingSq[them];
      if (k >= 0 && this.isAttacked(k, us)) {
        this.setChecks(us, this.checks[us] + 1);
        if (this.checks[us] >= 3) {
          this.winner = us;
          this.winReason = WIN_THREE_CHECK;
        }
      }
    }
    this.checkHill(them);
    this.side = them;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
    this.ply++;
  }

  /** Does `color` hold the hill (King of the Hill and its King on a centre square)? */
  onHill(color: Color): boolean {
    if (!this.rules[color].kingOfTheHill) return false;
    const k = this.kingSq[color];
    return k === CENTER_SQUARES[0] || k === CENTER_SQUARES[1] || k === CENTER_SQUARES[2] || k === CENTER_SQUARES[3];
  }

  /** King of the Hill: a King still on the hill when the opponent's turn ends wins. */
  private checkHill(color: Color): void {
    if (this.winner < 0 && this.onHill(color)) {
      this.winner = color;
      this.winReason = WIN_HILL;
    }
  }

  /** Pass the turn without moving (null-move pruning only). */
  makeNullMove(): void {
    this.push();
    this.setEp(-1);
    this.checkHill((this.side ^ 1) as Color);
    this.side = (this.side ^ 1) as Color;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
    this.ply++;
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  countPieces(color: Color, kind: number): number {
    const code = kind | (color << 4);
    let n = 0;
    for (let sq = 0; sq < 64; sq++) if (this.board[sq] === code) n++;
    return n;
  }

  /** True if the side has anything besides its King. */
  hasMaterial(color: Color): boolean {
    for (let sq = 0; sq < 64; sq++) {
      const c = this.board[sq];
      if (c !== 0 && c >> 4 === color && (c & 15) !== KING) return true;
    }
    return false;
  }

  /** Does the move capture something (piece or en passant)? */
  isCapture(m: number): boolean {
    return (m & (M_CAPTURE | M_EP)) !== 0;
  }
}
