import {
  ALL_DIRECTIONS,
  DIAGONAL,
  fileOf,
  neighbours,
  onBoard,
  ORTHOGONAL,
  rankOf,
  sqOf,
  type Sq,
  type Vec,
} from '../core/coords';
import { isImmobilized } from '../core/draft';
import { forwardOf, isSlider, PROMOTION_TYPES, type PieceType, type Side } from '../core/pieces';
import type { ActionToken, EncounterState, Piece, SquareMark } from '../core/state';
import { BASE_PATTERNS } from '../chess/patterns';
import { compileRules, type CompiledRules } from '../rules/compile';
import { evalNum } from '../rules/num';
import type { MoveMode, PieceCondition, VectorSet } from '../rules/types';

/**
 * Layer B — move generation. Pure functions: no events, no side effects.
 * Called thousands of times by the enemy planner and the encounter validator.
 *
 *   1. base piece moves (orthodox patterns)
 *   2. piece modifiers from upgrades (MOVE_PATTERN, PIERCE…), in acquisition order
 *   3. square modifiers (Rook Rails, Cursed range limits)
 *   4. enemy restrictions (RESTRICT_ENEMY debuffs, statuses)
 *   5. occupancy and terrain filtering
 */

export type MoveKind = 'step' | 'slide' | 'leap' | 'push' | 'pawnCapture' | 'enPassant' | 'castle';

export interface Move {
  pieceId: string;
  pieceType: PieceType;
  side: Side;
  from: Sq;
  to: Sq;
  /** Squares crossed strictly between origin and destination, in order. */
  path: Sq[];
  captureId: string | null;
  /** Where the captured piece stands (differs from `to` for en passant). */
  captureSq: Sq;
  /** Moving into RUBBLE clears it (capture-like action). */
  rubble: boolean;
  /** Pieces passed through via PIERCE (never captured). */
  pierced: string[];
  distance: number;
  kind: MoveKind;
  promotion: PieceType | null;
  castle: { rookId: string; rookFrom: Sq; rookTo: Sq } | null;
  /** Upgrade/square ids that made this move possible ([] = orthodox). */
  sources: string[];
  /** Costs no action (e.g. Castle Doctrine). */
  free: boolean;
  /** After landing on a Knight Gate, REPOSITION to the linked gate. */
  gate: boolean;
  /** After capturing, the Bishop returns to its origin (Bishop Recall). */
  recall: boolean;
  /** Standard two-square advance from the home rank (enables en passant). */
  doubleStep: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface GenContext {
  state: EncounterState;
  rules: CompiledRules;
  /** Active (unsuppressed) marks per square. */
  marksAt: (SquareMark[] | undefined)[];
  /** Player Rook Rails. */
  rails: { axis: 'rank' | 'file'; index: number }[];
  enemyPhalanx: boolean;
  recallOwned: boolean;
  /** Files that contain at least one Pawn (for Open File). */
  pawnFiles: boolean[];
  /** Some movement modifier depends on pawn files (hypothetical boards must recompute them). */
  needsPawnFiles: boolean;
}

export function createGenContext(state: EncounterState): GenContext {
  const marksAt: (SquareMark[] | undefined)[] = new Array(64);
  // Rail marks cover every square of their line and share the placing mutation's `source`.
  const railKeys = new Map<string, { axis: 'rank' | 'file'; index: number }>();
  for (const m of state.marks) {
    if (m.type === 'ROOK_RAIL' && m.rail && m.side === 'player') railKeys.set(`${m.source}|${m.rail.axis}${m.rail.index}`, m.rail);
    if (m.suppressed) continue;
    (marksAt[m.sq] ??= []).push(m);
  }
  const rules = compileRules(state.rules);
  const pawnFiles = new Array<boolean>(8).fill(false);
  for (const id in state.pieces) {
    const p = state.pieces[id];
    if (p.type === 'pawn') pawnFiles[fileOf(p.sq)] = true;
  }
  return {
    state,
    rules,
    marksAt,
    rails: [...railKeys.values()],
    enemyPhalanx: rules.affixes.some((a) => a.phalanx),
    recallOwned: rules.owned.has('bishop_recall'),
    pawnFiles,
    needsPawnFiles: rules.playerMoveMods.some((m) => m.def.when?.onPawnlessFile),
  };
}

export const hasMark = (ctx: GenContext, sq: Sq, type: SquareMark['type'], side?: Side): boolean =>
  !!ctx.marksAt[sq]?.some((m) => m.type === type && (side === undefined || m.side === side));

// ---------------------------------------------------------------------------
// Movement profile (steps 1–4)
// ---------------------------------------------------------------------------

interface RaySpec {
  dir: Vec;
  range: number;
  /** Range granted by the orthodox pattern; squares beyond it are "extra movement". */
  baseRange: number;
  mode: MoveMode;
  source: string | null;
  extSource: string | null;
  pierceEnemy: number;
  pierceAlly: number;
  pierceAny: number;
  pierceSources: string[];
}

interface LeapSpec {
  off: Vec;
  mode: MoveMode;
  source: string | null;
}

interface PawnSpec {
  fwd: 1 | -1;
  maxPush: number;
  basePush: number;
  pushSource: string | null;
  diagonalAdvance: string | null;
}

export interface Profile {
  rays: RaySpec[];
  leaps: LeapSpec[];
  pawn: PawnSpec | null;
  freeCastle: string | null;
}

const VECTORS: Record<VectorSet, readonly Vec[]> = {
  orthogonal: ORTHOGONAL,
  diagonal: DIAGONAL,
  all: ALL_DIRECTIONS,
};

const isDiagonal = (v: Vec) => v[0] !== 0 && v[1] !== 0;
const sameVec = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1];

function axisMatches(dir: Vec, axis: 'file' | 'rank' | 'diagonal' | 'any' | undefined): boolean {
  switch (axis) {
    case 'file':
      return dir[0] === 0;
    case 'rank':
      return dir[1] === 0;
    case 'diagonal':
      return isDiagonal(dir);
    default:
      return true;
  }
}

function pieceConditionHolds(ctx: GenContext, p: Piece, when: PieceCondition | undefined, stacks: number): boolean {
  if (!when) return true;
  const counters = ctx.state.counters;
  if (when.counterAtLeast) {
    const [counter, n] = when.counterAtLeast;
    if ((counters[counter] ?? 0) < evalNum(n, stacks, counters, p)) return false;
  }
  if (when.pieceCapturesAtLeast !== undefined && p.captures < evalNum(when.pieceCapturesAtLeast, stacks, counters, p)) {
    return false;
  }
  if (when.pieceCounterAtLeast) {
    const [counter, n] = when.pieceCounterAtLeast;
    if ((p.counters[counter] ?? 0) < evalNum(n, stacks, counters, p)) return false;
  }
  if (when.onPawnlessFile && ctx.pawnFiles[fileOf(p.sq)]) return false;
  return true;
}

const homeRank = (side: Side) => (side === 'player' ? 1 : 6);

export function buildProfile(ctx: GenContext, p: Piece): Profile {
  const profile: Profile = { rays: [], leaps: [], pawn: null, freeCastle: null };
  // Step 1 — base patterns.
  if (p.type === 'pawn') {
    const basePush = rankOf(p.sq) === homeRank(p.side) ? 2 : 1;
    profile.pawn = { fwd: forwardOf(p.side), maxPush: basePush, basePush, pushSource: null, diagonalAdvance: null };
  } else {
    const base = BASE_PATTERNS[p.type];
    for (const r of base.rays) {
      profile.rays.push({
        dir: r.dir,
        range: r.range,
        baseRange: r.range,
        mode: 'both',
        source: null,
        extSource: null,
        pierceEnemy: 0,
        pierceAlly: 0,
        pierceAny: 0,
        pierceSources: [],
      });
    }
    for (const off of base.leaps) profile.leaps.push({ off, mode: 'both', source: null });
  }

  // Step 2 — piece modifiers from upgrades, in acquisition order.
  if (p.side === 'player') {
    for (const mod of ctx.rules.playerMoveMods) {
      if (!mod.types.includes(p.type)) continue;
      if (!pieceConditionHolds(ctx, p, mod.def.when, mod.stacks)) continue;
      const add = mod.def.add;
      switch (add.type) {
        case 'MOVE_PATTERN': {
          const range = evalNum(add.range, mod.stacks, ctx.state.counters, p);
          for (const dir of VECTORS[add.vectors]) {
            profile.rays.push({
              dir,
              range,
              baseRange: 0,
              mode: add.mode ?? 'both',
              source: mod.upgradeId,
              extSource: null,
              pierceEnemy: 0,
              pierceAlly: 0,
              pierceAny: 0,
              pierceSources: [],
            });
          }
          break;
        }
        case 'RANGE': {
          const range = evalNum(add.range, mod.stacks, ctx.state.counters, p);
          for (const ray of profile.rays) {
            if (!VECTORS[add.vectors].some((v) => sameVec(v, ray.dir))) continue;
            if (range > ray.range) {
              ray.range = range;
              ray.extSource = mod.upgradeId;
            }
          }
          break;
        }
        case 'PIERCE': {
          const count = add.count === 'unlimited' ? 64 : evalNum(add.count, mod.stacks, ctx.state.counters, p);
          if (count <= 0) break;
          for (const ray of profile.rays) {
            if (ray.range <= 1 || !axisMatches(ray.dir, add.axis)) continue;
            if (add.owner === 'enemy') ray.pierceEnemy += count;
            else if (add.owner === 'ally') ray.pierceAlly += count;
            else ray.pierceAny += count;
            ray.pierceSources.push(mod.upgradeId);
          }
          break;
        }
        case 'PAWN_ADVANCE': {
          if (!profile.pawn) break;
          const max = evalNum(add.max, mod.stacks, ctx.state.counters, p);
          if (max > profile.pawn.maxPush) {
            profile.pawn.maxPush = max;
            profile.pawn.pushSource = mod.upgradeId;
          }
          break;
        }
        case 'PAWN_DIAGONAL_ADVANCE':
          if (profile.pawn) profile.pawn.diagonalAdvance = mod.upgradeId;
          break;
        case 'FREE_CASTLE':
          profile.freeCastle = mod.upgradeId;
          break;
      }
    }
  }

  // Step 3 — square modifiers.
  if (p.side === 'player' && p.type === 'rook') {
    for (const rail of ctx.rails) {
      const onRail = rail.axis === 'rank' ? rankOf(p.sq) === rail.index : fileOf(p.sq) === rail.index;
      if (!onRail) continue;
      for (const ray of profile.rays) {
        if (ray.range <= 1) continue;
        if (rail.axis === 'rank' ? ray.dir[1] === 0 : ray.dir[0] === 0) {
          ray.pierceAlly += 1;
          ray.pierceSources.push('square:ROOK_RAIL');
        }
      }
    }
  }
  if (p.side === 'enemy' && isSlider(p.type) && hasMark(ctx, p.sq, 'CURSED', 'player')) {
    for (const ray of profile.rays) ray.range = Math.min(ray.range, 2);
  }

  // Step 4 — enemy restrictions.
  if (p.side === 'enemy' && p.type === 'queen' && ctx.rules.heavyQueenRange !== null) {
    for (const ray of profile.rays) ray.range = Math.min(ray.range, ctx.rules.heavyQueenRange);
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Step 5 — occupancy & terrain
// ---------------------------------------------------------------------------

function blankMove(p: Piece, to: Sq, kind: MoveKind): Move {
  return {
    pieceId: p.id,
    pieceType: p.type,
    side: p.side,
    from: p.sq,
    to,
    path: [],
    captureId: null,
    captureSq: to,
    rubble: false,
    pierced: [],
    distance: Math.max(Math.abs(fileOf(to) - fileOf(p.sq)), Math.abs(rankOf(to) - rankOf(p.sq))),
    kind,
    promotion: null,
    castle: null,
    sources: [],
    free: false,
    gate: false,
    recall: false,
    doubleStep: false,
  };
}

/** Rank index at or beyond which a piece of `side` promotes. */
function promotes(ctx: GenContext, side: Side, to: Sq): boolean {
  if (side === 'player') {
    return rankOf(to) >= ctx.rules.promotionRankPlayer || hasMark(ctx, to, 'PROMOTION', 'player');
  }
  return rankOf(to) <= ctx.rules.promotionRankEnemy;
}

function pushPawnVariants(ctx: GenContext, out: Move[], m: Move) {
  if (!promotes(ctx, m.side, m.to)) {
    out.push(m);
    return;
  }
  if (m.side === 'enemy') {
    out.push({ ...m, promotion: 'queen' });
    return;
  }
  for (const t of PROMOTION_TYPES) out.push({ ...m, promotion: t });
}

function phalanxProtected(ctx: GenContext, target: Piece): boolean {
  if (!ctx.enemyPhalanx || target.side !== 'enemy' || target.type !== 'pawn') return false;
  const { board, pieces } = ctx.state;
  return neighbours(target.sq).some((sq) => {
    const id = board[sq];
    const q = id ? pieces[id] : undefined;
    return !!q && q.side === 'enemy' && q.type === 'pawn';
  });
}

function canCaptureTarget(ctx: GenContext, mover: Piece, target: Piece): boolean {
  if (mover.type === 'pawn' && mover.side === 'player' && phalanxProtected(ctx, target)) return false;
  return true;
}

/**
 * All moves of one piece under the current rules, ignoring action-token
 * affordability (see `affordableMoves`). Includes promotion / gate / recall
 * variants as separate moves.
 */
export function pieceMoves(ctx: GenContext, pieceId: string): Move[] {
  const p = ctx.state.pieces[pieceId];
  if (!p || isImmobilized(p)) return [];
  const { board, pieces, terrain } = ctx.state;
  const profile = buildProfile(ctx, p);
  const raw: Move[] = [];

  // Rays (steps and slides), with PIERCE.
  for (const ray of profile.rays) {
    let enemyBudget = ray.pierceEnemy;
    let allyBudget = ray.pierceAlly;
    let anyBudget = ray.pierceAny;
    const path: Sq[] = [];
    const pierced: string[] = [];
    let f = fileOf(p.sq);
    let r = rankOf(p.sq);
    for (let dist = 1; dist <= ray.range; dist++) {
      f += ray.dir[0];
      r += ray.dir[1];
      if (!onBoard(f, r)) break;
      const sq = sqOf(f, r);
      const t = terrain[sq];
      if (t === 'WALL') break;
      const sources = (): string[] => {
        const s: string[] = [];
        if (ray.source) s.push(ray.source);
        if (ray.extSource && dist > ray.baseRange) s.push(ray.extSource);
        if (pierced.length > 0) s.push(...ray.pierceSources);
        return s;
      };
      if (t === 'RUBBLE') {
        if (ray.mode !== 'quiet') {
          const m = blankMove(p, sq, ray.range > 1 ? 'slide' : 'step');
          m.path = path.slice();
          m.pierced = pierced.slice();
          m.rubble = true;
          m.sources = sources();
          raw.push(m);
        }
        break;
      }
      const occId = board[sq];
      if (!occId) {
        if (ray.mode !== 'capture') {
          const m = blankMove(p, sq, ray.range > 1 ? 'slide' : 'step');
          m.path = path.slice();
          m.pierced = pierced.slice();
          m.sources = sources();
          raw.push(m);
        }
        path.push(sq);
        continue;
      }
      const occ = pieces[occId];
      if (occ.side !== p.side) {
        if (ray.mode !== 'quiet' && canCaptureTarget(ctx, p, occ)) {
          const m = blankMove(p, sq, ray.range > 1 ? 'slide' : 'step');
          m.path = path.slice();
          m.pierced = pierced.slice();
          m.captureId = occId;
          m.sources = sources();
          raw.push(m);
        }
        if (enemyBudget > 0) enemyBudget--;
        else if (anyBudget > 0) anyBudget--;
        else break;
      } else {
        if (allyBudget > 0) allyBudget--;
        else if (anyBudget > 0) anyBudget--;
        else break;
      }
      pierced.push(occId);
      path.push(sq);
    }
  }

  // Leaps.
  for (const leap of profile.leaps) {
    const f = fileOf(p.sq) + leap.off[0];
    const r = rankOf(p.sq) + leap.off[1];
    if (!onBoard(f, r)) continue;
    const sq = sqOf(f, r);
    const t = terrain[sq];
    if (t === 'WALL') continue;
    const m = blankMove(p, sq, 'leap');
    if (leap.source) m.sources = [leap.source];
    if (t === 'RUBBLE') {
      if (leap.mode !== 'quiet') raw.push({ ...m, rubble: true });
      continue;
    }
    const occId = board[sq];
    if (!occId) {
      if (leap.mode !== 'capture') raw.push(m);
    } else if (pieces[occId].side !== p.side && leap.mode !== 'quiet' && canCaptureTarget(ctx, p, pieces[occId])) {
      raw.push({ ...m, captureId: occId });
    }
  }

  // Pawns.
  if (profile.pawn) genPawn(ctx, p, profile.pawn, raw);

  // Castling (player only — the enemy never castles).
  if (p.type === 'king' && p.side === 'player' && !p.moved) genCastles(ctx, p, profile, raw);

  // Enemy restrictions on destinations: enemy Kings cannot enter Cursed squares.
  const filtered =
    p.side === 'enemy' && p.type === 'king' ? raw.filter((m) => !hasMark(ctx, m.to, 'CURSED', 'player')) : raw;

  return expandVariants(ctx, p, dedupe(filtered));
}

function genPawn(ctx: GenContext, p: Piece, spec: PawnSpec, out: Move[]) {
  const { board, pieces, terrain } = ctx.state;
  const f = fileOf(p.sq);
  const r = rankOf(p.sq);
  // Pushes (quiet only).
  const path: Sq[] = [];
  for (let k = 1; k <= spec.maxPush; k++) {
    const rr = r + spec.fwd * k;
    if (!onBoard(f, rr)) break;
    const sq = sqOf(f, rr);
    if (terrain[sq] || board[sq]) break;
    const m = blankMove(p, sq, 'push');
    m.path = path.slice();
    if (k > spec.basePush && spec.pushSource) m.sources = [spec.pushSource];
    if (k === 2 && rankOf(p.sq) === homeRank(p.side)) m.doubleStep = true;
    pushPawnVariants(ctx, out, m);
    path.push(sq);
  }
  // Diagonal captures (and rubble clearing).
  for (const df of [-1, 1]) {
    const ff = f + df;
    const rr = r + spec.fwd;
    if (!onBoard(ff, rr)) continue;
    const sq = sqOf(ff, rr);
    const t = terrain[sq];
    if (t === 'WALL') continue;
    if (t === 'RUBBLE') {
      pushPawnVariants(ctx, out, { ...blankMove(p, sq, 'pawnCapture'), rubble: true });
      continue;
    }
    const occId = board[sq];
    if (occId) {
      const occ = pieces[occId];
      if (occ.side !== p.side && canCaptureTarget(ctx, p, occ)) {
        pushPawnVariants(ctx, out, { ...blankMove(p, sq, 'pawnCapture'), captureId: occId });
      }
      continue;
    }
    // En passant (player only, see DESIGN_DECISIONS).
    const ep = ctx.state.enPassant;
    if (ep && p.side === 'player' && ep.sq === sq) {
      const victim = pieces[ep.pawnId];
      if (victim && victim.side !== p.side && canCaptureTarget(ctx, p, victim)) {
        const m = { ...blankMove(p, sq, 'enPassant'), captureId: victim.id, captureSq: victim.sq };
        pushPawnVariants(ctx, out, m);
        continue;
      }
    }
    // Diagonal Advance: diagonal-forward into an empty square beside an allied Pawn.
    if (spec.diagonalAdvance && hasOrthAdjacentAllyPawn(ctx, p)) {
      pushPawnVariants(ctx, out, { ...blankMove(p, sq, 'step'), sources: [spec.diagonalAdvance] });
    }
  }
}

function hasOrthAdjacentAllyPawn(ctx: GenContext, p: Piece): boolean {
  const { board, pieces } = ctx.state;
  for (const [df, dr] of ORTHOGONAL) {
    const f = fileOf(p.sq) + df;
    const r = rankOf(p.sq) + dr;
    if (!onBoard(f, r)) continue;
    const id = board[sqOf(f, r)];
    const q = id ? pieces[id] : undefined;
    if (q && q.id !== p.id && q.side === p.side && q.type === 'pawn') return true;
  }
  return false;
}

function genCastles(ctx: GenContext, king: Piece, profile: Profile, out: Move[]) {
  const { board, pieces, terrain } = ctx.state;
  const rank = rankOf(king.sq);
  for (let file = 0; file < 8; file++) {
    const sq = sqOf(file, rank);
    const id = board[sq];
    if (!id) continue;
    const rook = pieces[id];
    if (rook.type !== 'rook' || rook.side !== king.side || rook.moved || isImmobilized(rook)) continue;
    const dir = Math.sign(file - fileOf(king.sq));
    if (Math.abs(file - fileOf(king.sq)) < 3) continue;
    let clear = true;
    for (let ff = fileOf(king.sq) + dir; ff !== file; ff += dir) {
      const s = sqOf(ff, rank);
      if (board[s] || terrain[s]) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const kingTo = sqOf(fileOf(king.sq) + 2 * dir, rank);
    const rookTo = sqOf(fileOf(king.sq) + dir, rank);
    const m = blankMove(king, kingTo, 'castle');
    m.path = [rookTo];
    m.castle = { rookId: rook.id, rookFrom: rook.sq, rookTo };
    if (profile.freeCastle) {
      m.free = true;
      m.sources = [profile.freeCastle];
    }
    out.push(m);
  }
}

function dedupe(moves: Move[]): Move[] {
  if (moves.length < 2) return moves;
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const key = `${m.to}|${m.promotion ?? ''}|${m.castle ? 'c' + m.castle.rookFrom : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Knight Gate and Bishop Recall are player choices encoded as move variants. */
function expandVariants(ctx: GenContext, p: Piece, moves: Move[]): Move[] {
  if (p.side !== 'player') return moves;
  const gateable = p.type === 'knight';
  const recallable = p.type === 'bishop' && ctx.recallOwned && !ctx.state.turnFlags[`recall:${p.id}`];
  if (!gateable && !recallable) return moves;
  const out: Move[] = [];
  for (const m of moves) {
    out.push(m);
    if (gateable) {
      const gate = ctx.marksAt[m.to]?.find((mk) => mk.type === 'KNIGHT_GATE' && mk.side === 'player');
      if (gate && gate.linkSq !== undefined) {
        const linked = gate.linkSq;
        const free = (!ctx.state.board[linked] || linked === p.sq) && !ctx.state.terrain[linked];
        if (free && linked !== m.to) out.push({ ...m, gate: true });
      }
    }
    if (recallable && m.captureId && !m.rubble) out.push({ ...m, recall: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

/**
 * Squares `pieceId` attacks: squares it could capture on if an opposing piece
 * stood there. Includes squares occupied by allies (defended squares).
 */
export function pieceAttacks(ctx: GenContext, pieceId: string, visit: (sq: Sq) => void): void {
  const p = ctx.state.pieces[pieceId];
  if (!p || isImmobilized(p)) return;
  const { board, pieces, terrain } = ctx.state;
  const profile = buildProfile(ctx, p);
  for (const ray of profile.rays) {
    if (ray.mode === 'quiet') continue;
    let enemyBudget = ray.pierceEnemy;
    let allyBudget = ray.pierceAlly;
    let anyBudget = ray.pierceAny;
    let f = fileOf(p.sq);
    let r = rankOf(p.sq);
    for (let dist = 1; dist <= ray.range; dist++) {
      f += ray.dir[0];
      r += ray.dir[1];
      if (!onBoard(f, r)) break;
      const sq = sqOf(f, r);
      const t = terrain[sq];
      if (t === 'WALL') break;
      visit(sq);
      if (t === 'RUBBLE') break;
      const occId = board[sq];
      if (!occId) continue;
      const occ = pieces[occId];
      if (occ.side !== p.side) {
        if (enemyBudget > 0) enemyBudget--;
        else if (anyBudget > 0) anyBudget--;
        else break;
      } else if (allyBudget > 0) allyBudget--;
      else if (anyBudget > 0) anyBudget--;
      else break;
    }
  }
  for (const leap of profile.leaps) {
    if (leap.mode === 'quiet') continue;
    const f = fileOf(p.sq) + leap.off[0];
    const r = rankOf(p.sq) + leap.off[1];
    if (!onBoard(f, r)) continue;
    const sq = sqOf(f, r);
    if (terrain[sq] === 'WALL') continue;
    visit(sq);
  }
  if (profile.pawn) {
    const rr = rankOf(p.sq) + profile.pawn.fwd;
    for (const df of [-1, 1]) {
      const ff = fileOf(p.sq) + df;
      if (!onBoard(ff, rr)) continue;
      const sq = sqOf(ff, rr);
      if (terrain[sq] === 'WALL') continue;
      visit(sq);
    }
  }
}

/** Number of `side` pieces attacking each square. */
export function attackCounts(ctx: GenContext, side: Side): Int8Array {
  const counts = new Int8Array(64);
  for (const id in ctx.state.pieces) {
    if (ctx.state.pieces[id].side !== side) continue;
    pieceAttacks(ctx, id, (sq) => {
      counts[sq]++;
    });
  }
  return counts;
}

export function attackersOf(ctx: GenContext, sq: Sq, side: Side): string[] {
  const out: string[] = [];
  for (const id in ctx.state.pieces) {
    if (ctx.state.pieces[id].side !== side) continue;
    let hit = false;
    pieceAttacks(ctx, id, (s) => {
      if (s === sq) hit = true;
    });
    if (hit) out.push(id);
  }
  return out;
}

export function isAttackedBy(ctx: GenContext, sq: Sq, side: Side): boolean {
  for (const id in ctx.state.pieces) {
    if (ctx.state.pieces[id].side !== side) continue;
    let hit = false;
    pieceAttacks(ctx, id, (s) => {
      if (s === sq) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

/** Enemy (opposing) pieces attacked by `pieceId` from its current square. */
export function attackedOpponents(ctx: GenContext, pieceId: string): string[] {
  const p = ctx.state.pieces[pieceId];
  if (!p) return [];
  const out: string[] = [];
  pieceAttacks(ctx, pieceId, (sq) => {
    const id = ctx.state.board[sq];
    if (id && ctx.state.pieces[id].side !== p.side && !out.includes(id)) out.push(id);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Action tokens
// ---------------------------------------------------------------------------

export function tokenAllows(token: ActionToken, m: Move): boolean {
  if (token.pieceId && token.pieceId !== m.pieceId) return false;
  if (token.excludePieceId && token.excludePieceId === m.pieceId) return false;
  if (token.pieceTypes && !token.pieceTypes.includes(m.pieceType)) return false;
  if (token.excludeTypes && token.excludeTypes.includes(m.pieceType)) return false;
  if (token.nonCapturing && (m.captureId || m.rubble)) return false;
  return true;
}

function restrictiveness(t: ActionToken): number {
  let score = 0;
  if (t.pieceId) score += 8;
  if (t.pieceTypes) score += 4 + (6 - t.pieceTypes.length) * 0.1;
  if (t.excludePieceId) score += 1;
  if (t.excludeTypes) score += 1;
  if (t.nonCapturing) score += 2;
  return score;
}

/** The token that pays for `m`: the most restrictive one that allows it (saves flexible tokens). */
export function pickToken(tokens: readonly ActionToken[], m: Move): ActionToken | null {
  let best: ActionToken | null = null;
  let bestScore = -1;
  for (const t of tokens) {
    if (!tokenAllows(t, m)) continue;
    const s = restrictiveness(t);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return best;
}

/** Player moves that can be made right now (free or payable by a remaining token). */
export function affordableMoves(ctx: GenContext, pieceId?: string): Move[] {
  const s = ctx.state;
  if (s.phase !== 'player' || s.outcome) return [];
  const ids = pieceId ? [pieceId] : Object.keys(s.pieces);
  const out: Move[] = [];
  for (const id of ids) {
    const p = s.pieces[id];
    if (!p || p.side !== 'player') continue;
    for (const m of pieceMoves(ctx, id)) {
      if (m.free || pickToken(s.actions, m)) out.push(m);
    }
  }
  return out;
}

/** All moves for a side ignoring tokens (used by the planner and validators). */
export function sideMoves(ctx: GenContext, side: Side): Move[] {
  const out: Move[] = [];
  for (const id in ctx.state.pieces) {
    if (ctx.state.pieces[id].side === side) out.push(...pieceMoves(ctx, id));
  }
  return out;
}
