import { parseSq, type Sq } from '../src/engine/core/coords';
import type { PieceType } from '../src/engine/core/pieces';
import type { EncounterConfig, EncounterState, EnemyPieceSpec, OwnedUpgrade } from '../src/engine/core/state';
import { createEncounter, type EncounterSetup, type PlacedMutation, type RosterPlacement } from '../src/engine/encounters/setup';
import { standardRoster } from '../src/engine/run/roster';

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

export const sq = (s: string): Sq => parseSq(s);

export function config(partial: Partial<EncounterConfig> = {}): EncounterConfig {
  return {
    id: 'test',
    templateId: 'test',
    name: 'Test',
    act: 1,
    kind: 'combat',
    objective: { type: 'ASSASSINATION' },
    turnLimit: 10,
    enemyActions: 1,
    profile: { kind: 'guard_king' },
    affixes: [],
    seed: 'test-seed',
    ...partial,
  };
}

export function roster(pieces: [PieceType, string | null][]): RosterPlacement[] {
  return pieces.map(([type, s], i) => ({ rosterId: `t${i}`, type, sq: s === null ? null : parseSq(s) }));
}

export function standardPlacements(): RosterPlacement[] {
  return standardRoster().map((r) => ({ rosterId: r.id, type: r.type, sq: r.sq }));
}

export function enemies(pieces: [PieceType, string, EnemyPieceSpec['tags']?][]): EnemyPieceSpec[] {
  return pieces.map(([type, s, tags]) => ({ type, sq: parseSq(s), tags }));
}

export interface BoardSpec {
  player: [PieceType, string | null][];
  enemy: [PieceType, string, EnemyPieceSpec['tags']?][];
  upgrades?: (string | [string, number])[];
  config?: Partial<EncounterConfig>;
  mutations?: PlacedMutation[];
  terrain?: [string, 'WALL' | 'RUBBLE'][];
  affixes?: string[];
}

export function upgradesList(list: (string | [string, number])[] = []): OwnedUpgrade[] {
  return list.map((u, i) => (typeof u === 'string' ? { id: u, stacks: 1, order: i } : { id: u[0], stacks: u[1], order: i }));
}

export function setupOf(spec: BoardSpec): EncounterSetup {
  return {
    config: config(spec.config),
    rules: { upgrades: upgradesList(spec.upgrades), affixes: spec.affixes ?? [] },
    roster: roster(spec.player),
    enemies: enemies(spec.enemy),
    terrain: (spec.terrain ?? []).map(([s, type]) => ({ sq: parseSq(s), type })),
    mutations: spec.mutations ?? [],
    waves: [],
  };
}

export function encounter(spec: BoardSpec): EncounterState {
  return createEncounter(setupOf(spec));
}

/** Piece standing on a square (throws if empty). */
export function at(s: EncounterState, square: string) {
  const id = s.board[parseSq(square)];
  if (!id) throw new Error(`No piece on ${square}`);
  return s.pieces[id];
}

import { applyPlayerAction, endTurn as engineEndTurn } from '../src/engine/encounters/flow';
import { affordableMoves, createGenContext } from '../src/engine/moves/generate';

/** Make a player move by squares (throws if illegal). */
export function play(s: EncounterState, from: string, to: string, extra: { promotion?: PieceType; gate?: boolean; recall?: boolean } = {}): EncounterState {
  const id = s.board[parseSq(from)];
  if (!id) throw new Error(`No piece on ${from}`);
  return applyPlayerAction(s, { type: 'move', pieceId: id, to: parseSq(to), ...extra }).state;
}

export function endTurn(s: EncounterState): EncounterState {
  return engineEndTurn(s).state;
}

/** Destination squares (names) the piece on `from` can move to right now. */
export function targets(s: EncounterState, from: string): string[] {
  const id = s.board[parseSq(from)]!;
  const names = affordableMoves(createGenContext(s), id).map((m) => 'abcdefgh'[m.to & 7] + String((m.to >> 3) + 1));
  return [...new Set(names)].sort();
}

export function logText(s: EncounterState): string[] {
  return s.log.map((l) => l.text);
}

/** Replace a piece's fields directly (test setup only). */
export function patch(s: EncounterState, square: string, fields: Partial<EncounterState['pieces'][string]>): EncounterState {
  const id = s.board[parseSq(square)]!;
  return { ...s, pieces: { ...s.pieces, [id]: { ...s.pieces[id], ...fields } } };
}

export function withIntents(s: EncounterState, list: [string, string][]): EncounterState {
  return {
    ...s,
    intents: list.map(([from, to], i) => {
      const id = s.board[parseSq(from)]!;
      const victim = s.board[parseSq(to)];
      return {
        id: `t${i}`,
        kind: 'move' as const,
        pieceId: id,
        pieceType: s.pieces[id].type,
        from: parseSq(from),
        to: parseSq(to),
        expectedTargetId: victim ?? undefined,
        expectedTargetType: victim ? s.pieces[victim].type : undefined,
      };
    }),
  };
}

export function mutation(id: string, type: PlacedMutation['type'], square: string, extra: Partial<PlacedMutation> = {}): PlacedMutation {
  return { id, upgradeId: `mut_${type.toLowerCase()}`, type, sq: parseSq(square), ...extra };
}
