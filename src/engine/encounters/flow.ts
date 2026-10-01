import { sqName, type Sq } from '../core/coords';
import { expireAt, newId, placePiece } from '../core/draft';
import { PIECE_NAME } from '../core/pieces';
import type { ActionToken, EncounterState, Intent, Piece } from '../core/state';
import { hasMark, createGenContext, pickToken, pieceMoves, affordableMoves, type Move } from '../moves/generate';
import { planIntents } from '../enemy/planner';
import { Resolver, type ResolveOptions } from '../rules/resolver';
import { evaluateObjective } from './objectives';
import { resolveMove } from './resolve';
import { runBossHooks } from './bossHooks';

/**
 * Turn structure (B2). Player Turn: onTurnStart → Reserve deployment → actions
 * → End Turn → onTurnEnd. Enemy Phase: intents execute in order →
 * reinforcements → status tick → objective evaluation → plan next intents.
 */

export interface StepResult {
  state: EncounterState;
  /** Intermediate states for animation (only when requested). */
  frames: EncounterState[];
}

export const BASE_TOKEN: Omit<ActionToken, 'id'> = { source: 'base', label: 'Action' };

function finishStep(r: Resolver): StepResult {
  return { state: r.result(), frames: r.frames ?? [] };
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export type PlayerActionInput =
  | { type: 'move'; pieceId: string; to: Sq; promotion?: Move['promotion']; gate?: boolean; recall?: boolean; castleRook?: Sq }
  | { type: 'deploy'; reserveId: string; to: Sq };

export function findMove(state: EncounterState, a: Extract<PlayerActionInput, { type: 'move' }>): Move | null {
  const ctx = createGenContext(state);
  const moves = affordableMoves(ctx, a.pieceId);
  return (
    moves.find(
      (m) =>
        m.to === a.to &&
        (m.promotion ?? null) === (a.promotion ?? null) &&
        m.gate === !!a.gate &&
        m.recall === !!a.recall &&
        (a.castleRook === undefined || m.castle?.rookFrom === a.castleRook),
    ) ?? null
  );
}

export function deploySquares(state: EncounterState): Sq[] {
  if (state.phase !== 'player' || state.outcome || state.reserveDeploysLeft <= 0 || state.reserve.length === 0) return [];
  const out: Sq[] = [];
  for (let sq = 0; sq < 8; sq++) {
    if (!state.board[sq] && !state.terrain[sq]) out.push(sq);
  }
  return out;
}

export function applyPlayerAction(state: EncounterState, a: PlayerActionInput, opts: ResolveOptions = {}): StepResult {
  if (state.phase !== 'player' || state.outcome) throw new Error('Not the player turn');
  const r = new Resolver(state, opts);
  r.beginAction();
  if (a.type === 'deploy') {
    deploy(r, a.reserveId, a.to);
  } else {
    const m = findMove(state, a);
    if (!m) throw new Error(`Illegal move: ${a.pieceId} → ${sqName(a.to)}`);
    if (!m.free) {
      const token = pickToken(r.d.actions, m)!;
      r.d.actions = r.d.actions.filter((t) => t.id !== token.id);
    }
    resolveMove(r, m);
  }
  return finishStep(r);
}

/** Apply an already-generated move (used by bots; skips the lookup). */
export function applyGeneratedMove(state: EncounterState, m: Move, opts: ResolveOptions = {}): StepResult {
  const r = new Resolver(state, opts);
  r.beginAction();
  if (!m.free) {
    const token = pickToken(r.d.actions, m);
    if (!token) throw new Error('No action token can pay for this move');
    r.d.actions = r.d.actions.filter((t) => t.id !== token.id);
  }
  resolveMove(r, m);
  return finishStep(r);
}

function deploy(r: Resolver, reserveId: string, to: Sq) {
  const d = r.d;
  const entry = d.reserve.find((e) => e.id === reserveId);
  if (!entry) throw new Error('Unknown reserve piece');
  if (!deploySquares(d).includes(to)) throw new Error(`Cannot deploy to ${sqName(to)}`);
  d.reserve = d.reserve.filter((e) => e.id !== reserveId);
  d.reserveDeploysLeft -= 1;
  const piece: Piece = {
    id: entry.id,
    type: entry.type,
    side: 'player',
    sq: to,
    rosterId: entry.rosterId,
    moved: false,
    wards: 0,
    tempWards: [],
    statuses: [],
    captures: 0,
    tags: [],
    counters: {},
  };
  placePiece(d, piece);
  d.stats.deploys += 1;
  r.log('move', `Reserve: ${PIECE_NAME[piece.type]} deployed to ${sqName(to)}`, 0, [to]);
  r.emit({ type: 'onReserveDeploy', actorId: piece.id, actorType: piece.type, side: 'player', sq: to });
  r.emit({ type: 'onPieceAdded', actorId: piece.id, actorType: piece.type, side: 'player', sq: to });
  r.drain();
  r.frame();
  evaluateObjective(r, 'action');
}

/** True when the player has nothing left to do this turn (auto-end option). */
export function noActionsLeft(state: EncounterState): boolean {
  if (state.phase !== 'player' || state.outcome) return true;
  if (deploySquares(state).length > 0) return false;
  return affordableMoves(createGenContext(state)).length === 0;
}

// ---------------------------------------------------------------------------
// Turn cycle
// ---------------------------------------------------------------------------

export function beginPlayerTurn(r: Resolver, turn: number): void {
  const d = r.d;
  d.turn = turn;
  d.phase = 'player';
  expireAt(d, { at: 'turnStart', turn });
  d.movedLastTurn = d.movedThisTurn;
  d.movedThisTurn = [];
  d.turnFlags = {};
  d.actions = [{ ...BASE_TOKEN, id: newId(d, 'act') }];
  d.reserveDeploysLeft = d.reserve.length > 0 ? r.rules.reserveDeploysPerTurn : 0;
  const T = d.config.turnLimit;
  r.log('turn', `— Turn ${turn}${T ? ` / ${T}` : ''} —`, 0);
  r.beginAction();
  r.emit({ type: 'onTurnStart', side: 'player' });
  r.drain();
  runBossHooks(r, 'turnStart');
  evaluateObjective(r, 'turnStart');
  r.frame();
}

export function endTurn(state: EncounterState, opts: ResolveOptions = {}): StepResult {
  if (state.phase !== 'player' || state.outcome) throw new Error('Not the player turn');
  const r = new Resolver(state, opts);
  const d = r.d;
  const n = d.turn;

  // onTurnEnd triggers.
  r.beginAction();
  r.emit({ type: 'onTurnEnd', side: 'player' });
  r.drain();
  expireAt(d, { at: 'turnEnd', turn: n });
  d.actions = [];
  d.reserveDeploysLeft = 0;
  d.enPassant = null;
  evaluateObjective(r, 'turnEnd');
  if (d.outcome) return finishStep(r);
  r.frame();

  runEnemyPhase(r, n);
  if (!d.outcome) beginPlayerTurn(r, n + 1);
  return finishStep(r);
}

function intentFizzleReason(state: EncounterState, intent: Intent): string | null {
  const p = state.pieces[intent.pieceId];
  if (!p) return 'piece captured';
  if (p.statuses.some((s) => s.type === 'IMMOBILIZED')) return 'piece immobilized';
  const ctx = createGenContext(state);
  if (hasMark(ctx, intent.to, 'CONSECRATED', 'player')) return 'destination consecrated';
  return null;
}

export function runEnemyPhase(r: Resolver, n: number): void {
  const d = r.d;
  d.phase = 'enemy';
  r.log('turn', `— Enemy phase ${n} —`, 0);
  r.beginAction();
  expireAt(d, { at: 'phaseStart', turn: n });
  r.emit({ type: 'onEnemyPhaseStart', side: 'enemy' });
  r.drain();
  runBossHooks(r, 'phaseStart');

  // 1. Intents execute one by one, in displayed order.
  const intents = d.intents.slice();
  d.intents = [];
  for (const intent of intents) {
    if (d.outcome) break;
    r.beginAction();
    executeIntent(r, intent);
    r.frame();
  }
  if (d.outcome) return;

  // 2. Reinforcements scheduled for this phase arrive.
  arrivals(r, n);
  runBossHooks(r, 'reinforcements');
  if (d.outcome) return;

  // 3. Status durations tick down.
  const freed = expireAt(d, { at: 'phaseEnd', turn: n });
  for (const id of freed.statuses) {
    const p = d.pieces[id];
    if (p) r.log('system', `${PIECE_NAME[p.type]} ${sqName(p.sq)} is no longer Immobilized`, 1, [p.sq]);
  }

  // 4. Objective evaluation.
  if (d.objective.countdown !== null) {
    d.objective.countdown -= 1;
    r.log('system', `Enemy countdown: ${d.objective.countdown}`, 1);
  }
  evaluateObjective(r, 'phaseEnd');
  if (d.outcome) return;
  r.beginAction();
  r.emit({ type: 'onEnemyPhaseEnd', side: 'enemy' });
  r.drain();
  runBossHooks(r, 'phaseEnd');
  if (d.outcome) return;

  // 5. Plan and display intents for the next phase.
  planNextIntents(r, n + 1);
  r.frame();
}

export function executeIntent(r: Resolver, intent: Intent): void {
  const d = r.d;
  const reason = intentFizzleReason(d, intent);
  const label = `${PIECE_NAME[intent.pieceType]} ${sqName(intent.from)} → ${sqName(intent.to)}`;
  if (reason) {
    fizzle(r, intent, label, reason);
    return;
  }
  const ctx = createGenContext(d);
  const m = pieceMoves(ctx, intent.pieceId).find((mv) => mv.to === intent.to);
  if (!m) {
    const occ = d.board[intent.to];
    const why = occ && d.pieces[occ].side === 'enemy' ? 'destination occupied' : 'path blocked';
    fizzle(r, intent, label, why);
    return;
  }
  resolveMove(r, m);
}

function fizzle(r: Resolver, intent: Intent, label: string, reason: string) {
  r.d.stats.fizzles += 1;
  r.log('fizzle', `Intent fizzled: ${label} — ${reason}`, 0, [intent.from, intent.to]);
  r.emit({ type: 'onIntentFizzled', actorId: intent.pieceId, actorType: intent.pieceType, side: 'enemy', from: intent.from, to: intent.to, meta: { reason } });
  r.drain();
}

function arrivals(r: Resolver, n: number) {
  const d = r.d;
  const due = d.arrivals.filter((a) => a.phase <= n);
  if (due.length === 0) return;
  const later: typeof d.arrivals = d.arrivals.filter((a) => a.phase > n);
  for (const a of due) {
    if (d.board[a.spec.sq] || d.terrain[a.spec.sq]) {
      // Blocked arrival squares delay the reinforcement by one phase.
      later.push({ ...a, phase: n + 1 });
      r.log('system', `Reinforcement ${PIECE_NAME[a.spec.type]} blocked at ${sqName(a.spec.sq)} — delayed`, 1, [a.spec.sq]);
      continue;
    }
    const piece: Piece = {
      id: a.id,
      type: a.spec.type,
      side: 'enemy',
      sq: a.spec.sq,
      moved: false,
      wards: a.spec.wards ?? 0,
      tempWards: [],
      statuses: [],
      captures: 0,
      tags: a.spec.tags ?? [],
      counters: {},
    };
    placePiece(d, piece);
    r.log('enemy', `Reinforcement: ${PIECE_NAME[piece.type]} arrives on ${sqName(piece.sq)}`, 0, [piece.sq]);
    r.emit({ type: 'onPieceAdded', actorId: piece.id, actorType: piece.type, side: 'enemy', sq: piece.sq });
  }
  d.arrivals = later;
  r.drain();
  r.frame();
  refreshArrivalTelegraphs(r);
}

export function refreshArrivalTelegraphs(r: Resolver): void {
  const d = r.d;
  const upcoming = d.phase === 'player' ? d.turn : d.turn + 1;
  const others = d.telegraphs.filter((t) => t.kind !== 'reinforcements');
  const byPhase = new Map<number, Sq[]>();
  for (const a of d.arrivals) byPhase.set(a.phase, [...(byPhase.get(a.phase) ?? []), a.spec.sq]);
  const tele = [...byPhase.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([phase, squares]) => {
      const inPhases = Math.max(0, phase - upcoming);
      return {
        id: `reinf-${phase}`,
        kind: 'reinforcements' as const,
        label: inPhases === 0 ? 'Reinforcements arrive after this turn' : `Reinforcements arrive in ${inPhases + 1} turns`,
        inPhases,
        squares,
      };
    });
  d.telegraphs = [...others, ...tele];
}

export function intentCountFor(r: Resolver, phase: number): number {
  const d = r.d;
  let n = d.config.enemyActions;
  if (phase === 1 && r.rules.slowCommand) n = Math.max(0, n - 1);
  return n;
}

export function planNextIntents(r: Resolver, phase: number): void {
  const d = r.d;
  const count = intentCountFor(r, phase);
  const planned = planIntents(d, count, { profile: d.config.profile, royalCurse: r.rules.royalCurse, objectiveType: d.config.objective.type }, d.rng);
  d.intents = planned.intents;
  d.rng = planned.rng;
  for (const intent of d.intents) {
    r.emit({ type: 'onIntentPlanned', actorId: intent.pieceId, actorType: intent.pieceType, side: 'enemy', from: intent.from, to: intent.to });
  }
  r.drain();
  refreshArrivalTelegraphs(r);
}
