import { chebyshev, fileOf, rankOf, sqName, type Sq } from '../core/coords';
import { isImmobilized } from '../core/draft';
import { PIECE_NAME, PIECE_VALUE, type Side } from '../core/pieces';
import type { BehaviorProfile, EncounterState, Intent, Piece } from '../core/state';
import { createGenContext, pieceAttacks, pieceMoves, type GenContext, type Move } from '../moves/generate';
import { makeHypo, mutableCopy, retarget, unmakeHypo } from '../moves/hypo';
import { Rng } from '../rng/rng';

/**
 * Enemy intent planner (B4). Deterministic heuristics, no deep search:
 * candidate intents are scored by capture value, threat to the player's King,
 * profile goal progress, protection of the enemy King, and 1-ply safety.
 * Intents are chosen greedily and sequentially on a hypothetical board (each
 * chosen intent is applied before choosing the next), each using a different
 * piece. Ties are broken with the encounter's seeded enemyAI stream.
 */

interface Weights {
  capture: number;
  check: number;
  safety: number;
  goal: number;
  protect: number;
}

export const PROFILE_WEIGHTS: Record<BehaviorProfile['kind'], Weights> = {
  aggressive: { capture: 1.0, check: 1.0, safety: 0.45, goal: 0.7, protect: 0.15 },
  guard_king: { capture: 0.75, check: 0.45, safety: 0.9, goal: 0.35, protect: 1.0 },
  hold_line: { capture: 0.85, check: 0.45, safety: 0.9, goal: 0.8, protect: 0.4 },
  race_promotion: { capture: 0.6, check: 0.3, safety: 0.55, goal: 1.3, protect: 0.25 },
  hunter: { capture: 0.7, check: 0.6, safety: 0.5, goal: 1.1, protect: 0.2 },
};

const V = (p: Pick<Piece, 'type'>) => PIECE_VALUE[p.type];

export interface PlanContext {
  profile: BehaviorProfile;
  /** Enemy King may not enter squares the player attacks at planning time (Royal Curse). */
  royalCurse: boolean;
  objectiveType: EncounterState['config']['objective']['type'];
}

/** Per-square attacker lists for both sides on one hypothetical board. */
interface AttackIndex {
  player: string[][];
  enemy: string[][];
}

function buildAttackIndex(ctx: GenContext): AttackIndex {
  const player: string[][] = Array.from({ length: 64 }, () => []);
  const enemy: string[][] = Array.from({ length: 64 }, () => []);
  for (const id in ctx.state.pieces) {
    const list = ctx.state.pieces[id].side === 'player' ? player : enemy;
    pieceAttacks(ctx, id, (sq) => {
      const l = list[sq];
      if (l[l.length - 1] !== id) l.push(id);
    });
  }
  return { player, enemy };
}

function attacks(ctx: GenContext, pieceId: string, target: Sq): boolean {
  let hit = false;
  pieceAttacks(ctx, pieceId, (s) => {
    if (s === target) hit = true;
  });
  return hit;
}

function findKing(s: EncounterState, side: Side): Piece | undefined {
  for (const id in s.pieces) {
    const p = s.pieces[id];
    if (p.side === side && p.type === 'king') return p;
  }
  return undefined;
}

function goalTarget(s: EncounterState, profile: BehaviorProfile): Piece | undefined {
  if (profile.kind !== 'hunter') return findKing(s, 'player');
  const pieces = Object.values(s.pieces).filter((p) => p.side === 'player');
  switch (profile.target) {
    case 'escapee':
      return pieces.find((p) => p.tags.includes('escapee')) ?? findKing(s, 'player');
    case 'protectee':
      return pieces.find((p) => p.tags.includes('protectee')) ?? findKing(s, 'player');
    case 'queen':
      return pieces.find((p) => p.type === 'queen') ?? findKing(s, 'player');
    default:
      return findKing(s, 'player');
  }
}

/** Squares the player could attack after one move (coarse 2-ply threat map). */
function playerThreatMap(h: EncounterState, ctx: GenContext): Uint8Array {
  const threat = new Uint8Array(64);
  const ids = Object.keys(h.pieces).filter((id) => h.pieces[id].side === 'player');
  for (const id of ids) {
    pieceAttacks(ctx, id, (sq) => {
      threat[sq] = 2;
    });
  }
  for (const id of ids) {
    for (const m of pieceMoves(ctx, id)) {
      if (m.captureId && h.pieces[m.captureId]?.type === 'king') continue;
      const u = makeHypo(h, m);
      pieceAttacks(retarget(ctx, h), id, (sq) => {
        if (threat[sq] < 1) threat[sq] = 1;
      });
      unmakeHypo(h, u);
    }
  }
  return threat;
}

interface SlotData {
  ctx: GenContext;
  idx: AttackIndex;
  threat: Uint8Array | null;
  enemyKing: Piece | undefined;
  playerKing: Piece | undefined;
  goal: Piece | undefined;
  playerPawns: Piece[];
}

function scoreMove(h: EncounterState, slot: SlotData, m: Move, pc: PlanContext): number {
  const w = PROFILE_WEIGHTS[pc.profile.kind];
  const mover = h.pieces[m.pieceId];
  const target = m.captureId ? h.pieces[m.captureId] : undefined;
  let s = 0;

  if (target) {
    if (target.type === 'king') return 100000;
    const wards = target.wards + target.tempWards.length;
    let v = V(target) * 10 * (wards > 0 ? 0.35 : 1);
    if (target.tags.includes('escapee') || target.tags.includes('protectee')) v += 60;
    s += w.capture * v;
  }
  if (m.promotion) s += 60;

  const { idx } = slot;
  const evacuating = idx.player[m.from].length > 0;

  // --- make the move on the hypothetical board ---
  const u = makeHypo(h, m);
  const hctx = retarget(slot.ctx, h);

  // Player attackers of the destination after the move (incl. discovered lines through `from`).
  const attackers: string[] = idx.player[m.to].filter((id) => id !== m.captureId && h.pieces[id]);
  for (const id of idx.player[m.from]) {
    if (!attackers.includes(id) && h.pieces[id] && attacks(hctx, id, m.to)) attackers.push(id);
  }
  // Mover's attacks from the destination.
  let checks = false;
  let attacksGoal = false;
  const goal = slot.goal;
  const pk = slot.playerKing && h.pieces[slot.playerKing.id] ? slot.playerKing : undefined;
  pieceAttacks(hctx, m.pieceId, (sq) => {
    if (pk && sq === pk.sq) checks = true;
    if (goal && sq === goal.sq) attacksGoal = true;
  });
  let defenders = 0;
  if (attackers.length > 0 && mover.type !== 'king') {
    defenders = idx.enemy[m.to].filter((id) => id !== m.pieceId).length;
    if (defenders === 0) {
      for (const id of idx.enemy[m.from]) {
        if (id !== m.pieceId && h.pieces[id] && attacks(hctx, id, m.to)) {
          defenders = 1;
          break;
        }
      }
    }
  }
  const kingAfter = mover.type === 'king' ? h.pieces[mover.id] : slot.enemyKing;
  unmakeHypo(h, u);
  // --- unmade ---

  if (checks) s += w.check * 35;

  // 1-ply safety: can the player trivially capture the moving piece on arrival?
  if (attackers.length > 0) {
    let loss = mover.type === 'king' ? 600 : V(mover) * 10;
    if (defenders > 0 && mover.type !== 'king') {
      const cheapest = Math.min(...attackers.map((id) => V(h.pieces[id])));
      loss = Math.max(0, loss - cheapest * 10);
    }
    s -= w.safety * loss;
  } else if (evacuating && mover.type !== 'king') {
    // A piece currently en prise moving to safety.
    s += w.safety * V(mover) * 4;
  }

  s += w.goal * goalScore(slot, m, mover, pc, attacksGoal);
  s += w.protect * protectScore(slot, m, mover, kingAfter);

  // Mild centralization so quiet positions still produce purposeful moves.
  if (mover.type !== 'king') {
    const centre = (sq: Sq) => 3.5 - Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5));
    s += (centre(m.to) - centre(m.from)) * 0.6;
  }
  return s;
}

function goalScore(slot: SlotData, m: Move, mover: Piece, pc: PlanContext, attacksGoal: boolean): number {
  const profile = pc.profile;
  let s = 0;
  if (profile.kind === 'race_promotion' || pc.objectiveType === 'PROMOTION_RACE') {
    if (mover.type === 'pawn') {
      s += (rankOf(m.from) - rankOf(m.to)) * 6 + (rankOf(m.to) <= 2 ? 10 : 0);
    } else {
      for (const p of slot.playerPawns) {
        if (fileOf(p.sq) === fileOf(m.to) && rankOf(m.to) > rankOf(p.sq)) s += 2 + rankOf(p.sq);
      }
    }
  }
  if (profile.kind === 'hold_line') {
    const line = profile.rank ?? 4;
    if (rankOf(m.to) < line && mover.type !== 'pawn') s -= 6;
  }
  if ((profile.kind === 'aggressive' || profile.kind === 'hunter') && slot.goal && mover.type !== 'king') {
    const g = slot.goal.sq;
    s += (chebyshev(m.from, g) - chebyshev(m.to, g)) * (profile.kind === 'hunter' ? 4 : 2.5);
    if (profile.kind === 'hunter' && attacksGoal) s += 18;
  }
  if (profile.kind === 'guard_king' && mover.type !== 'king' && slot.enemyKing && chebyshev(m.to, slot.enemyKing.sq) > 4) s -= 3;
  return s;
}

function protectScore(slot: SlotData, m: Move, mover: Piece, kingAfter: Piece | undefined): number {
  const king = slot.enemyKing;
  const threat = slot.threat;
  if (!king || !threat) return 0;
  let s = 0;
  if (mover.type === 'king') {
    const dangerNow = threat[king.sq];
    const dangerAfter = threat[m.to];
    s += (dangerNow - dangerAfter) * 25;
    if (dangerNow === 0 && dangerAfter === 0) s -= 4; // don't shuffle the King without reason
  } else if (kingAfter) {
    const dist0 = chebyshev(m.from, king.sq);
    const dist1 = chebyshev(m.to, kingAfter.sq);
    if (threat[king.sq] > 0) s += (dist0 - dist1) * 3;
    if (dist1 <= 1) s += 2;
    if (dist0 <= 1 && dist1 > 1 && threat[king.sq] > 0) s -= 6;
  }
  return s;
}

/**
 * Plan up to `count` intents (each with a different piece). Returns the
 * intents and the advanced RNG state.
 */
export function planIntents(
  state: EncounterState,
  count: number,
  pc: PlanContext,
  rngState: EncounterState['rng'],
): { intents: Intent[]; rng: EncounterState['rng'] } {
  const rng = new Rng(rngState);
  const intents: Intent[] = [];
  const used = new Set<string>();
  const h = mutableCopy(state);
  const needsThreat = PROFILE_WEIGHTS[pc.profile.kind].protect > 0 && !!findKing(state, 'enemy');
  for (let i = 0; i < count; i++) {
    const ctx = createGenContext(h);
    const idx = buildAttackIndex(ctx);
    const slot: SlotData = {
      ctx,
      idx,
      threat: needsThreat ? playerThreatMap(h, ctx) : null,
      enemyKing: findKing(h, 'enemy'),
      playerKing: findKing(h, 'player'),
      goal: goalTarget(h, pc.profile),
      playerPawns: Object.values(h.pieces).filter((p) => p.side === 'player' && p.type === 'pawn'),
    };
    let best: { move: Move; score: number } | null = null;
    for (const id of Object.keys(h.pieces).sort()) {
      const p = h.pieces[id];
      if (p.side !== 'enemy' || used.has(id) || isImmobilized(p)) continue;
      for (const m of pieceMoves(ctx, id)) {
        if (pc.royalCurse && p.type === 'king' && idx.player[m.to].length > 0) continue;
        const score = scoreMove(h, slot, m, pc) + rng.float() * 0.5;
        if (!best || score > best.score) best = { move: m, score };
      }
    }
    if (!best) break;
    const m = best.move;
    const target = m.captureId ? h.pieces[m.captureId] : undefined;
    intents.push({
      id: `I${state.turn}-${i}`,
      kind: 'move',
      pieceId: m.pieceId,
      pieceType: h.pieces[m.pieceId].type,
      from: m.from,
      to: m.to,
      expectedTargetId: target?.id,
      expectedTargetType: target?.type,
    });
    used.add(m.pieceId);
    makeHypo(h, m);
  }
  return { intents, rng: rng.state() };
}

export function describeIntent(state: EncounterState, intent: Intent): string {
  const base = `${PIECE_NAME[intent.pieceType]} ${sqName(intent.from)} → ${sqName(intent.to)}`;
  if (intent.expectedTargetType) return `${base} · captures ${PIECE_NAME[intent.expectedTargetType]}`;
  const occupant = state.board[intent.to];
  if (occupant && state.pieces[occupant]?.side === 'player') return `${base} · captures ${PIECE_NAME[state.pieces[occupant].type]}`;
  return base;
}
