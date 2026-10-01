import { fileOf, rankOf, sqName, sqOf, type Sq } from '../core/coords';
import { PIECE_NAME } from '../core/pieces';
import type { SquareType } from '../core/state';
import type { PlacedMutation } from '../encounters/setup';
import { stackedName } from '../rules/num';
import { upgradeDef } from '../rules/registry';
import { applyRosterEffect, deploymentZone } from './rosterOps';
import type { RosterPiece } from './roster';
import type { PlaceStep, RunAction, RunState } from './types';

/**
 * Acquiring upgrades (B9 stacking: never capped) and resolving the choices
 * some of them require (mutation placement, starting-position changes).
 */

export function stacksOf(run: RunState, id: string): number {
  return run.upgrades.find((u) => u.id === id)?.stacks ?? 0;
}

export function zoneOf(run: Pick<RunState, 'upgrades' | 'rank4'>): Sq[] {
  const fd = run.upgrades.find((u) => u.id === 'start_forward_deployment')?.stacks ?? 0;
  return deploymentZone(fd >= 1, run.rank4);
}

/** Highest rank index the player may deploy to. */
export function deploymentTop(run: Pick<RunState, 'upgrades' | 'rank4'>): number {
  return Math.max(...zoneOf(run).map(rankOf));
}

export const MUTATION_REGION_TOP = 5; // ranks 1–6

function log(run: RunState, text: string): RunState {
  return { ...run, history: [...run.history, { act: run.act, text }] };
}

/** Add one stack of an upgrade and queue its acquisition choice, if any. */
export function grantUpgrade(run: RunState, id: string): RunState {
  const def = upgradeDef(id);
  const existing = run.upgrades.find((u) => u.id === id);
  let next: RunState = {
    ...run,
    upgrades: existing
      ? run.upgrades.map((u) => (u.id === id ? { ...u, stacks: u.stacks + 1 } : u))
      : [...run.upgrades, { id, stacks: 1, order: run.acquisitions }],
    acquisitions: existing ? run.acquisitions : run.acquisitions + 1,
  };
  const stacks = stacksOf(next, id);
  for (const eff of def.roster ?? []) next = { ...next, roster: applyRosterEffect(next.roster, eff, zoneOf(next)) };
  next = log(next, `Acquired ${stackedName(def.name, stacks)}`);
  const step = placementStep(id, stacks, next);
  if (step) next = { ...next, pending: { kind: 'place', upgradeId: id, step } };
  return next;
}

export function placementStep(id: string, stacks: number, run: RunState): PlaceStep | null {
  const def = upgradeDef(id);
  const c = def.choice;
  if (!c) return null;
  switch (c.kind) {
    case 'placeSquare':
      if (c.shape === 'line') return { kind: 'line' };
      return { kind: 'squares', square: c.square, count: c.shape === 'pair' ? 2 : 1, shape: c.shape === 'pair' ? 'pair' : 'single' };
    case 'choosePiece':
      return run.roster.some((r) => r.type === c.pieceType && !r.locked) ? { kind: 'piece', pieceType: c.pieceType, then: c.then } : null;
    case 'castledSide':
      return { kind: 'castledSide' };
    case 'chooseRank4Squares': {
      if (stacks < c.fromStack) return null;
      const free = 8 - run.rank4.length;
      return free > 0 ? { kind: 'rank4', count: Math.min(c.count, free) } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Placement validation helpers (used by the UI to highlight legal choices)
// ---------------------------------------------------------------------------

export function legalPlacementSquares(run: RunState): Sq[] {
  const p = run.pending;
  if (!p || p.kind !== 'place') return [];
  const step = p.step;
  const taken = new Set(run.roster.filter((r) => r.sq !== null).map((r) => r.sq as Sq));
  const out: Sq[] = [];
  if (step.kind === 'squares') {
    for (let sq = 0; sq < 64; sq++) {
      if (rankOf(sq) > MUTATION_REGION_TOP) continue;
      if (run.mutations.some((m) => m.sq === sq && m.type === (step.square as SquareType))) continue;
      out.push(sq);
    }
  } else if (step.kind === 'pieceSquare') {
    for (let sq = 0; sq < 64; sq++) if ((rankOf(sq) === 2 || rankOf(sq) === 3) && !taken.has(sq)) out.push(sq);
  } else if (step.kind === 'rank4') {
    for (let f = 0; f < 8; f++) {
      const sq = sqOf(f, 3);
      if (!run.rank4.includes(sq)) out.push(sq);
    }
  }
  return out;
}

export function legalPieces(run: RunState): RosterPiece[] {
  const p = run.pending;
  if (!p || p.kind !== 'place' || p.step.kind !== 'piece') return [];
  const t = p.step.pieceType;
  return run.roster.filter((r) => r.type === t && !r.locked);
}

// ---------------------------------------------------------------------------
// Applying placements
// ---------------------------------------------------------------------------

function nextMutationId(run: RunState): string {
  return `mut${run.mutations.length + 1}-${run.acquisitions}`;
}

/** Move roster piece `id` to `sq`, swapping out an unlocked occupant (or sending it to Reserve). */
function moveInFormation(roster: RosterPiece[], id: string, sq: Sq, lock: boolean): RosterPiece[] {
  const piece = roster.find((r) => r.id === id)!;
  const occupant = roster.find((r) => r.sq === sq && r.id !== id);
  return roster.map((r) => {
    if (r.id === id) return { ...r, sq, locked: lock || r.locked };
    if (occupant && r.id === occupant.id) return { ...r, sq: occupant.locked ? r.sq : piece.sq };
    return r;
  });
}

export function applyPlacement(run: RunState, action: RunAction): RunState {
  const p = run.pending;
  if (!p || p.kind !== 'place') throw new Error('No placement pending');
  const def = upgradeDef(p.upgradeId);
  const step = p.step;
  const done = (r: RunState, text: string): RunState => log({ ...r, pending: p.resume ?? null }, `${def.name}: ${text}`);

  if (step.kind === 'squares' && action.type === 'placeSquares') {
    const legal = legalPlacementSquares(run);
    const squares = action.squares;
    if (squares.length !== step.count || new Set(squares).size !== squares.length || !squares.every((s) => legal.includes(s))) {
      throw new Error('Illegal placement');
    }
    const type = step.square as SquareType;
    const id = nextMutationId(run);
    const muts: PlacedMutation[] =
      step.count === 2
        ? [
            { id, upgradeId: p.upgradeId, type, sq: squares[0], linkSq: squares[1] },
            { id: `${id}b`, upgradeId: p.upgradeId, type, sq: squares[1], linkSq: squares[0] },
          ]
        : [{ id, upgradeId: p.upgradeId, type, sq: squares[0] }];
    return done({ ...run, mutations: [...run.mutations, ...muts] }, `placed on ${squares.map(sqName).join(' ↔ ')}`);
  }
  if (step.kind === 'line' && action.type === 'placeLine') {
    if (action.index < 0 || action.index > 7 || (action.axis === 'rank' && action.index > MUTATION_REGION_TOP)) throw new Error('Illegal rail');
    const id = nextMutationId(run);
    const sq = action.axis === 'rank' ? sqOf(0, action.index) : sqOf(action.index, 0);
    const label = action.axis === 'rank' ? `rank ${action.index + 1}` : `${'abcdefgh'[action.index]}-file`;
    return done({ ...run, mutations: [...run.mutations, { id, upgradeId: p.upgradeId, type: 'ROOK_RAIL', sq, rail: { axis: action.axis, index: action.index } }] }, `rail on the ${label}`);
  }
  if (step.kind === 'piece' && action.type === 'pickPiece') {
    const piece = legalPieces(run).find((r) => r.id === action.rosterId);
    if (!piece) throw new Error('Illegal piece');
    if (step.then === 'chooseSquareRank34') {
      return { ...run, pending: { ...p, step: { kind: 'pieceSquare', rosterId: piece.id } } };
    }
    // Advance to rank 3 on the same file (nearest free rank-3 square if that one is locked).
    const file = piece.sq !== null ? fileOf(piece.sq) : 2;
    const lockedSquares = new Set(run.roster.filter((r) => r.locked && r.sq !== null).map((r) => r.sq as Sq));
    const candidates = [0, 1, -1, 2, -2, 3, -3, 4, -4]
      .map((d) => file + d)
      .filter((f) => f >= 0 && f < 8)
      .map((f) => sqOf(f, 2))
      .filter((sq) => !lockedSquares.has(sq));
    if (!candidates.length) throw new Error('No free rank-3 square');
    const roster = moveInFormation(run.roster, piece.id, candidates[0], true);
    return done({ ...run, roster }, `${PIECE_NAME[piece.type]} now starts on ${sqName(candidates[0])}`);
  }
  if (step.kind === 'pieceSquare' && action.type === 'placeSquares') {
    const sq = action.squares[0];
    if (action.squares.length !== 1 || !legalPlacementSquares(run).includes(sq)) throw new Error('Illegal square');
    const roster = moveInFormation(run.roster, step.rosterId, sq, true);
    return done({ ...run, roster }, `Knight now starts on ${sqName(sq)}`);
  }
  if (step.kind === 'castledSide' && action.type === 'pickSide') {
    const king = run.roster.find((r) => r.type === 'king')!;
    const rooks = run.roster.filter((r) => r.type === 'rook');
    const rook =
      action.side === 'king'
        ? rooks.slice().sort((a, b) => fileOf(b.sq ?? 0) - fileOf(a.sq ?? 0))[0]
        : rooks.slice().sort((a, b) => fileOf(a.sq ?? 63) - fileOf(b.sq ?? 63))[0];
    if (!rook) throw new Error('No Rook');
    const kingTo = sqOf(action.side === 'king' ? 6 : 2, 0);
    const rookTo = sqOf(action.side === 'king' ? 5 : 3, 0);
    let roster = moveInFormation(run.roster, king.id, kingTo, true);
    roster = moveInFormation(roster, rook.id, rookTo, true);
    return done({ ...run, roster }, `King ${sqName(kingTo)}, Rook ${sqName(rookTo)} (${action.side === 'king' ? 'kingside' : 'queenside'})`);
  }
  if (step.kind === 'rank4' && action.type === 'placeSquares') {
    const legal = legalPlacementSquares(run);
    if (action.squares.length !== step.count || !action.squares.every((s) => legal.includes(s)) || new Set(action.squares).size !== action.squares.length) {
      throw new Error('Illegal rank-4 squares');
    }
    return done({ ...run, rank4: [...run.rank4, ...action.squares] }, `deployment zone adds ${action.squares.map(sqName).join(', ')}`);
  }
  throw new Error(`Action ${action.type} does not match placement step ${step.kind}`);
}

/** Validate a player-edited formation (formation editor). */
export function validateFormation(run: RunState, roster: RosterPiece[]): string | null {
  if (roster.length !== run.roster.length) return 'Roster size changed';
  const zone = new Set(zoneOf(run));
  const seen = new Set<Sq>();
  for (const r of roster) {
    const before = run.roster.find((x) => x.id === r.id);
    if (!before || before.type !== r.type) return 'Unknown piece';
    if (before.locked && before.sq !== r.sq) return `${PIECE_NAME[r.type]} is locked by a starting-position upgrade`;
    if (r.sq === null) {
      if (r.type === 'king') return 'The King must start on the board';
      continue;
    }
    if (!before.locked && !zone.has(r.sq)) return `${sqName(r.sq)} is outside the deployment zone`;
    if (seen.has(r.sq)) return `Two pieces on ${sqName(r.sq)}`;
    seen.add(r.sq);
  }
  return null;
}

export { deploymentZone };
