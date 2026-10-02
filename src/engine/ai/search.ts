import type { Position } from '../game/position';
import { KING, M_CAPTURE, M_EP, PAWN, type Color } from '../game/types';
import { ORDER_VALUE, evaluate, hasPieces } from './eval';

/**
 * Alpha-beta search (negamax, principal variation search) with iterative
 * deepening, a transposition table, quiescence search, null-move pruning,
 * late-move reductions, killer and history move ordering.
 *
 * Royalty is "capture the King": nothing filters moves that leave the King
 * attacked; such moves are refuted one ply later by the capture itself. A
 * side with no moves at all loses.
 */
export const WIN = 30000;
const WIN_BOUND = WIN - 1000;
const MAX_PLY = 96;
const MOVE_STRIDE = 512;

const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

export interface SearchLimits {
  /** Maximum iterative-deepening depth. */
  depth: number;
  /** Time budget in ms (0 = unlimited, depth only). */
  timeMs?: number;
  /** Node budget (0 = unlimited). */
  nodes?: number;
}

export interface SearchResult {
  move: number;
  score: number;
  depth: number;
  nodes: number;
  pv: number[];
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Searcher {
  pos: Position;
  nodes = 0;
  private stopped = false;
  /** Depth of the current iteration; check extensions stop beyond twice this many plies. */
  private rootDepth = 1;
  private deadline = 0;
  private nodeLimit = 0;

  // Transposition table.
  private readonly ttMask: number;
  private readonly ttLo: Int32Array;
  private readonly ttHi: Int32Array;
  private readonly ttMove: Int32Array;
  private readonly ttScore: Int16Array;
  private readonly ttDepth: Int8Array;
  private readonly ttFlag: Uint8Array;

  private readonly moves = new Int32Array(MAX_PLY * MOVE_STRIDE);
  private readonly scores = new Int32Array(MAX_PLY * MOVE_STRIDE);
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(64 * 64);
  private readonly pvTable = new Int32Array(MAX_PLY * MAX_PLY);
  private readonly pvLength = new Int32Array(MAX_PLY);

  // Hash history for repetition detection: game positions, then the search path.
  private readonly repLo = new Int32Array(1024 + MAX_PLY);
  private readonly repHi = new Int32Array(1024 + MAX_PLY);
  private repBase = 0;
  private repTop = 0;

  constructor(pos: Position, ttBits = 19) {
    this.pos = pos;
    const size = 1 << ttBits;
    this.ttMask = size - 1;
    this.ttLo = new Int32Array(size);
    this.ttHi = new Int32Array(size);
    this.ttMove = new Int32Array(size);
    this.ttScore = new Int16Array(size);
    this.ttDepth = new Int8Array(size);
    this.ttFlag = new Uint8Array(size);
  }

  /** Earlier positions of the game (hash pairs), for repetition detection. */
  setHistory(hashes: readonly (readonly [number, number])[]): void {
    const keep = hashes.slice(-1024);
    keep.forEach(([lo, hi], i) => {
      this.repLo[i] = lo;
      this.repHi[i] = hi;
    });
    this.repBase = keep.length;
  }

  clearTables(): void {
    this.ttFlag.fill(0);
    this.history.fill(0);
    this.killers.fill(0);
  }

  // ---------------------------------------------------------------------
  // Entry points
  // ---------------------------------------------------------------------

  search(limits: SearchLimits): SearchResult {
    this.nodes = 0;
    this.stopped = false;
    this.deadline = limits.timeMs ? now() + limits.timeMs : 0;
    this.nodeLimit = limits.nodes ?? 0;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    this.repTop = this.repBase;

    let best: SearchResult = { move: 0, score: 0, depth: 0, nodes: 0, pv: [] };
    const maxDepth = Math.max(1, Math.min(limits.depth, MAX_PLY - 8));
    let prevScore = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.rootDepth = depth;
      let score: number;
      if (depth >= 5 && Math.abs(prevScore) < WIN_BOUND) {
        // Aspiration window around the previous score.
        let delta = 40;
        let lo = prevScore - delta;
        let hi = prevScore + delta;
        for (;;) {
          score = this.negamax(depth, lo, hi, 0, true);
          if (this.stopped) break;
          if (score <= lo) lo = Math.max(-WIN, lo - delta);
          else if (score >= hi) hi = Math.min(WIN, hi + delta);
          else break;
          delta *= 2;
        }
      } else {
        score = this.negamax(depth, -WIN, WIN, 0, true);
      }
      if (this.stopped && depth > 1) {
        // Keep a partially searched iteration only if it found a better first move.
        if (this.pvLength[0] > 0 && this.pvTable[0] !== best.move && score > best.score && Math.abs(score) < WIN) {
          best = { ...best, move: this.pvTable[0], score };
        }
        break;
      }
      prevScore = score;
      const pv = Array.from(this.pvTable.subarray(0, this.pvLength[0]));
      best = { move: pv[0] ?? best.move, score, depth, nodes: this.nodes, pv };
      if (Math.abs(score) >= WIN_BOUND) break;
      // Stop once half the budget is gone: the next iteration would most likely not finish.
      if (this.deadline && this.deadline - now() < (limits.timeMs ?? 0) * 0.5) break;
    }
    if (!best.move) {
      // Fallback: any move (e.g. stopped before the first iteration finished).
      const n = this.pos.generateMoves(this.moves, 0, false);
      if (n > 0) best.move = this.moves[0];
    }
    best.nodes = this.nodes;
    return best;
  }

  /**
   * Exact scores for every root move at `depth` (full-window search per move).
   * Used by the weaker levels, which pick among good moves with noise.
   */
  scoreRootMoves(depth: number): { move: number; score: number }[] {
    this.nodes = 0;
    this.stopped = false;
    this.deadline = 0;
    this.nodeLimit = 0;
    this.repTop = this.repBase;
    this.rootDepth = depth;
    const pos = this.pos;
    const out: { move: number; score: number }[] = [];
    const n = pos.generateMoves(this.moves, 0, false);
    const list = Array.from(this.moves.subarray(0, n));
    for (const m of list) {
      pos.makeMove(m);
      this.pushRep();
      const score = pos.winner >= 0 ? WIN - 1 : -this.negamax(depth - 1, -WIN, WIN, 1, true);
      this.repTop--;
      pos.unmakeMove();
      out.push({ move: m, score });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------

  private pushRep(): void {
    this.repLo[this.repTop] = this.pos.hashLo;
    this.repHi[this.repTop] = this.pos.hashHi;
    this.repTop++;
  }

  private isRepetition(): boolean {
    const lo = this.pos.hashLo;
    const hi = this.pos.hashHi;
    const limit = Math.max(0, this.repTop - 1 - this.pos.halfmove);
    for (let i = this.repTop - 3; i >= limit; i -= 2) {
      if (this.repLo[i] === lo && this.repHi[i] === hi) return true;
    }
    return false;
  }

  private checkTime(): void {
    if ((this.nodes & 1023) !== 0) return;
    if (this.deadline && now() > this.deadline) this.stopped = true;
    if (this.nodeLimit && this.nodes > this.nodeLimit) this.stopped = true;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const pos = this.pos;
    this.pvLength[ply] = 0;
    if (pos.winner >= 0) return -(WIN - ply);
    if (ply > 0) {
      if (pos.halfmove >= 100 || this.isRepetition()) return 0;
      // Mate distance pruning.
      if (WIN - ply <= alpha) return alpha;
    }
    if (ply >= MAX_PLY - 4) return evaluate(pos);

    const us = pos.side as Color;
    const inCheck = pos.inCheck(us);
    // Check extension, bounded: when both Kings are exposed, chains of checks would never shrink the depth.
    if (inCheck && ply < this.rootDepth * 2) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 0);

    this.nodes++;
    this.checkTime();
    if (this.stopped) return 0;

    const pvNode = beta - alpha > 1;
    // Transposition table probe.
    const ti = pos.hashLo & this.ttMask;
    let ttMove = 0;
    if (this.ttFlag[ti] && this.ttLo[ti] === pos.hashLo && this.ttHi[ti] === pos.hashHi) {
      ttMove = this.ttMove[ti];
      if (!pvNode && ply > 0 && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s > WIN_BOUND) s -= ply;
        else if (s < -WIN_BOUND) s += ply;
        const f = this.ttFlag[ti];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    // Null-move pruning.
    if (allowNull && !pvNode && !inCheck && depth >= 3 && ply > 0 && Math.abs(beta) < WIN_BOUND && hasPieces(pos, us)) {
      const staticEval = evaluate(pos);
      if (staticEval >= beta) {
        const R = depth >= 6 ? 3 : 2;
        pos.makeNullMove();
        this.pushRep();
        const s = -this.negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        this.repTop--;
        pos.pop();
        if (this.stopped) return 0;
        if (s >= beta) return s >= WIN_BOUND ? beta : s;
      }
    }

    const base = ply * MOVE_STRIDE;
    const n = pos.generateMoves(this.moves, base, false) - base;
    if (n === 0) return -(WIN - ply);
    this.scoreMoves(base, n, ttMove, ply);

    let bestScore = -WIN - 1;
    let bestMove = 0;
    const origAlpha = alpha;
    let searched = 0;
    for (let i = 0; i < n; i++) {
      const m = this.pickNext(base, i, n);
      const quiet = !(m & (M_CAPTURE | M_EP)) && !((m >> 12) & 15);
      pos.makeMove(m);
      this.pushRep();
      let score: number;
      if (searched === 0) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // Late-move reduction for quiet moves searched late.
        let r = 0;
        if (depth >= 3 && searched >= 3 && quiet && !inCheck && m !== this.killers[ply * 2] && m !== this.killers[ply * 2 + 1]) {
          r = searched >= 8 && depth >= 5 ? 2 : 1;
        }
        score = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && r > 0) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      this.repTop--;
      pos.unmakeMove();
      if (this.stopped) return 0;
      searched++;
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          // Update the principal variation.
          const row = ply * MAX_PLY;
          const child = (ply + 1) * MAX_PLY;
          this.pvTable[row] = m;
          const len = this.pvLength[ply + 1];
          for (let j = 0; j < len; j++) this.pvTable[row + 1 + j] = this.pvTable[child + j];
          this.pvLength[ply] = len + 1;
          if (score >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = m;
              }
              this.history[(m & 63) * 64 + ((m >> 6) & 63)] += depth * depth;
            }
            break;
          }
        }
      }
    }

    // Store.
    let stored = bestScore;
    if (stored > WIN_BOUND) stored += ply;
    else if (stored < -WIN_BOUND) stored -= ply;
    this.ttLo[ti] = pos.hashLo;
    this.ttHi[ti] = pos.hashHi;
    this.ttMove[ti] = bestMove;
    this.ttScore[ti] = stored;
    this.ttDepth[ti] = depth;
    this.ttFlag[ti] = bestScore >= beta ? TT_LOWER : bestScore > origAlpha ? TT_EXACT : TT_UPPER;
    return bestScore;
  }

  private quiesce(alpha: number, beta: number, ply: number, qdepth: number): number {
    const pos = this.pos;
    this.pvLength[ply] = 0;
    if (pos.winner >= 0) return -(WIN - ply);
    this.nodes++;
    this.checkTime();
    if (this.stopped) return 0;
    if (ply >= MAX_PLY - 2) return evaluate(pos);

    const us = pos.side as Color;
    // When the King is attacked, standing pat is not an option for the first plies: look at every move.
    const evasion = qdepth < 2 && pos.inCheck(us);
    let best = -WIN - 1;
    if (!evasion) {
      const stand = evaluate(pos);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
    }
    const base = ply * MOVE_STRIDE;
    const n = pos.generateMoves(this.moves, base, !evasion) - base;
    if (n === 0) return evasion ? -(WIN - ply) : best;
    this.scoreMoves(base, n, 0, ply);
    for (let i = 0; i < n; i++) {
      const m = this.pickNext(base, i, n);
      pos.makeMove(m);
      const score = -this.quiesce(-beta, -alpha, ply + 1, qdepth + 1);
      pos.unmakeMove();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) break;
        }
      }
    }
    return best;
  }

  private scoreMoves(base: number, n: number, ttMove: number, ply: number): void {
    const board = this.pos.board;
    const k1 = this.killers[ply * 2];
    const k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = this.moves[base + i];
      let s: number;
      if (m === ttMove) s = 1 << 30;
      else {
        const from = m & 63;
        const to = (m >> 6) & 63;
        const promo = (m >> 12) & 15;
        const victim = board[to];
        if (victim !== 0 || m & M_EP) {
          const vk = victim !== 0 ? victim & 15 : PAWN;
          s = 1 << 24;
          s += ORDER_VALUE[vk] * 16 - ORDER_VALUE[board[from] & 15] / 16;
          if (vk === KING) s += 1 << 26;
        } else if (promo) {
          s = (1 << 24) - 1000 + ORDER_VALUE[promo];
        } else if (m === k1) {
          s = 1 << 22;
        } else if (m === k2) {
          s = (1 << 22) - 1;
        } else {
          s = this.history[from * 64 + to];
        }
      }
      this.scores[base + i] = s;
    }
  }

  /** Selection sort step: bring the best remaining move to index i. */
  private pickNext(base: number, i: number, n: number): number {
    let bi = i;
    let bs = this.scores[base + i];
    for (let j = i + 1; j < n; j++) {
      const s = this.scores[base + j];
      if (s > bs) {
        bs = s;
        bi = j;
      }
    }
    if (bi !== i) {
      const a = base + i;
      const b = base + bi;
      const tm = this.moves[a];
      this.moves[a] = this.moves[b];
      this.moves[b] = tm;
      const ts = this.scores[a];
      this.scores[a] = this.scores[b];
      this.scores[b] = ts;
    }
    return this.moves[base + i];
  }
}

export const isWinScore = (s: number): boolean => Math.abs(s) >= WIN_BOUND;
