import { FILES, fileOf, rankOf, sqOf, sqName, type Sq } from '../core/coords';
import { newId, placePiece } from '../core/draft';
import { PIECE_NAME, type PieceType } from '../core/pieces';
import type {
  EncounterConfig,
  EncounterRules,
  EncounterState,
  EnemyPieceSpec,
  Piece,
  ReinforcementWave,
  SquareMark,
  SquareType,
  Terrain,
} from '../core/state';
import { compileRules } from '../rules/compile';
import { Resolver, type ResolveOptions } from '../rules/resolver';
import { deriveStream, Rng } from '../rng/rng';
import { runBossHooks } from './bossHooks';
import { beginPlayerTurn, planNextIntents, refreshArrivalTelegraphs } from './flow';

/**
 * Layer A — the setup pipeline, run once per encounter, in this order:
 *
 *   1. run-level roster modifiers (added/removed pieces are already in the roster)
 *   2. starting-position modifiers (formation squares, locked pieces)
 *   3. encounter template placement (enemies, terrain, objective markers)
 *   4. enemy debuffs (Cracked Formation, Delayed Reinforcement)
 *   5. board mutations (persistent squares; suppressed under terrain)
 *   6. onEncounterStart triggers (and affix effects)
 *   7. initial enemy intent planning
 */

export interface RosterPlacement {
  rosterId: string;
  type: PieceType;
  /** Formation square, or null for Reserve. */
  sq: Sq | null;
  locked?: boolean;
  /** Extra tags assigned by the template (e.g. ESCAPE's designated piece). */
  tags?: Piece['tags'];
}

/** A placed board mutation from the run (B10). */
export interface PlacedMutation {
  id: string;
  upgradeId: string;
  type: SquareType;
  sq: Sq;
  linkSq?: Sq;
  rail?: { axis: 'rank' | 'file'; index: number };
}

export interface EncounterSetup {
  config: EncounterConfig;
  rules: EncounterRules;
  roster: RosterPlacement[];
  enemies: EnemyPieceSpec[];
  terrain: { sq: Sq; type: Terrain }[];
  mutations: PlacedMutation[];
  waves: ReinforcementWave[];
  /** Extra marks owned by the encounter (boss squares etc.). */
  marks?: Omit<SquareMark, 'id'>[];
}

export const emptyStats = (): EncounterState['stats'] => ({
  playerMoves: 0,
  movesByType: {},
  captures: 0,
  capturesByType: {},
  promotions: 0,
  longestBishopMove: 0,
  bishopLongMoves: 0,
  extraActionsGranted: 0,
  wardsBlocked: 0,
  fizzles: 0,
  piecesLost: 0,
  deploys: 0,
  triggers: 0,
});

export function blankState(setup: Pick<EncounterSetup, 'config' | 'rules'>): EncounterState {
  return {
    config: setup.config,
    rules: setup.rules,
    board: new Array(64).fill(null),
    pieces: {},
    terrain: new Array(64).fill(null),
    marks: [],
    reserve: [],
    arrivals: [],
    captured: [],
    turn: 0,
    phase: 'player',
    actions: [],
    reserveDeploysLeft: 0,
    intents: [],
    telegraphs: [],
    counters: {},
    turnFlags: {},
    movedThisTurn: [],
    movedLastTurn: [],
    enPassant: null,
    objective: {
      promotions: 0,
      countdown: setup.config.objective.type === 'PROMOTION_RACE' ? (setup.config.objective.countdown ?? 8) : null,
      enemyPromoted: false,
    },
    outcome: null,
    log: [],
    logSeq: 0,
    nextId: 1,
    rng: deriveStream(setup.config.seed, 'enemyAI'),
    stats: emptyStats(),
  };
}

function newPiece(id: string, type: PieceType, side: Piece['side'], sq: Sq, extra: Partial<Piece> = {}): Piece {
  return { id, type, side, sq, moved: false, wards: 0, tempWards: [], statuses: [], captures: 0, tags: [], counters: {}, ...extra };
}

export function createEncounter(setup: EncounterSetup, opts: ResolveOptions = {}): EncounterState {
  const r = new Resolver(blankState(setup), opts);
  const d = r.d;
  const rules = compileRules(setup.rules);
  const encRng = new Rng(deriveStream(setup.config.seed, 'setup'));
  r.log('system', `${setup.config.name}`, 0);

  // Steps 1–2: roster and formation (starting-position upgrades are baked into formation squares).
  const enemySquares = new Set(setup.enemies.map((e) => e.sq));
  const terrainSquares = new Set(setup.terrain.map((t) => t.sq));
  for (const entry of setup.roster) {
    const id = `P-${entry.rosterId}`;
    const sq = entry.sq;
    const blocked = sq === null || d.board[sq] !== null || enemySquares.has(sq) || terrainSquares.has(sq);
    const tags: Piece['tags'] = [...(entry.tags ?? []), ...(entry.locked ? (['locked'] as const) : [])];
    if (blocked) {
      if (entry.type === 'king') throw new Error('The King must start on the board');
      d.reserve.push({ id, rosterId: entry.rosterId, type: entry.type });
      continue;
    }
    placePiece(d, newPiece(id, entry.type, 'player', sq, { rosterId: entry.rosterId, tags }));
  }

  // Step 3: template placement.
  for (const t of setup.terrain) {
    if (!d.board[t.sq]) d.terrain[t.sq] = t.type;
  }
  const affixes = rules.affixes;
  const vanguard = affixes.some((a) => a.vanguard);
  for (const spec of setup.enemies) {
    let sq = spec.sq;
    if (vanguard && spec.type !== 'king') {
      const forward = sqOf(fileOf(sq), Math.max(0, rankOf(sq) - 1));
      if (!d.board[forward] && !d.terrain[forward] && rankOf(forward) >= 4) sq = forward;
    }
    if (d.board[sq] || d.terrain[sq]) continue;
    placePiece(d, newPiece(newId(d, 'E'), spec.type, 'enemy', sq, { tags: spec.tags ?? [], wards: spec.wards ?? 0 }));
  }
  for (const affix of affixes) {
    if (affix.extraPawns) {
      const free = candidateEnemySquares(d, [5, 6]);
      for (let i = 0; i < affix.extraPawns && free.length; i++) {
        const sq = free.splice(encRng.int(free.length), 1)[0];
        placePiece(d, newPiece(newId(d, 'E'), 'pawn', 'enemy', sq));
      }
    }
  }
  for (const wave of setup.waves) {
    for (const spec of wave.pieces) {
      d.arrivals.push({ id: newId(d, 'E'), spec, phase: wave.phase, source: 'wave' });
    }
  }
  if (affixes.some((a) => a.extraWave)) {
    const free = candidateEnemySquares(d, [7]);
    const lastPhase = Math.max(2, ...setup.waves.map((w) => w.phase));
    const types: PieceType[] = ['knight', 'bishop'];
    for (const type of types) {
      if (!free.length) break;
      const sq = free.splice(encRng.int(free.length), 1)[0];
      d.arrivals.push({ id: newId(d, 'E'), spec: { type, sq }, phase: lastPhase + 1, source: 'affix:reinforced' });
    }
  }

  // Step 4: enemy debuffs.
  if (rules.crackedFormation > 0) {
    for (let i = 0; i < rules.crackedFormation; i++) {
      const pawns = Object.values(d.pieces).filter((p) => p.side === 'enemy' && p.type === 'pawn' && !p.tags.includes('target'));
      if (!pawns.length) break;
      pawns.sort((a, b) => a.sq - b.sq);
      const victim = pawns[encRng.int(pawns.length)];
      d.board[victim.sq] = null;
      delete d.pieces[victim.id];
      r.log('trigger', `Cracked Formation: enemy Pawn ${sqName(victim.sq)} removed`, 1, [victim.sq]);
    }
  }
  if (rules.delayedReinforcement > 0) {
    const candidates = Object.values(d.pieces)
      .filter((p) => p.side === 'enemy' && p.type !== 'king' && p.type !== 'pawn' && !p.tags.includes('target') && !p.tags.includes('boss'))
      .sort((a, b) => a.sq - b.sq);
    for (let i = 0; i < rules.delayedReinforcement && candidates.length; i++) {
      const p = candidates.splice(encRng.int(candidates.length), 1)[0];
      d.board[p.sq] = null;
      delete d.pieces[p.id];
      d.arrivals.push({ id: p.id, spec: { type: p.type, sq: p.sq, tags: p.tags, wards: p.wards }, phase: 2, source: 'delayed_reinforcement' });
      r.log('trigger', `Delayed Reinforcement: enemy ${PIECE_NAME[p.type]} ${sqName(p.sq)} arrives on turn 3`, 1, [p.sq]);
    }
  }

  // Step 5: board mutations (suppressed under terrain).
  for (const m of setup.mutations) {
    const base = { type: m.type, side: 'player' as const, source: `mutation:${m.id}` };
    if (m.type === 'ROOK_RAIL' && m.rail) {
      for (let i = 0; i < 8; i++) {
        const sq = m.rail.axis === 'rank' ? sqOf(i, m.rail.index) : sqOf(m.rail.index, i);
        d.marks.push({ ...base, id: newId(d, 'mk'), sq, rail: m.rail, suppressed: !!d.terrain[sq] });
      }
      continue;
    }
    d.marks.push({ ...base, id: newId(d, 'mk'), sq: m.sq, linkSq: m.linkSq, suppressed: !!d.terrain[m.sq] });
  }
  for (const mk of setup.marks ?? []) d.marks.push({ ...mk, id: newId(d, 'mk') });

  // Affix wards on enemy pieces.
  for (const affix of affixes) {
    if (!affix.enemyWards) continue;
    for (const p of Object.values(d.pieces)) {
      if (p.side !== 'enemy') continue;
      const w = affix.enemyWards;
      const match = w.pieceType === 'all' || (w.pieceType === 'targets' ? p.tags.includes('target') : p.type === w.pieceType);
      if (match) d.pieces[p.id] = { ...p, wards: p.wards + w.count };
    }
  }

  // Step 6: onEncounterStart triggers.
  d.turn = 1;
  r.beginAction();
  r.emit({ type: 'onEncounterStart' });
  r.drain();
  runBossHooks(r, 'setup');

  // Step 7: initial enemy intent planning, then the first Player Turn.
  d.phase = 'player';
  refreshArrivalTelegraphs(r);
  planNextIntents(r, 1);
  beginPlayerTurn(r, 1);
  return r.result();
}

/** Empty, terrain-free squares on the given rank indices. */
export function candidateEnemySquares(d: EncounterState, ranks: number[]): Sq[] {
  const out: Sq[] = [];
  for (const rank of ranks) {
    for (let f = 0; f < 8; f++) {
      const sq = sqOf(f, rank);
      if (!d.board[sq] && !d.terrain[sq]) out.push(sq);
    }
  }
  return out;
}

export const describeSquare = (sq: Sq): string => `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
