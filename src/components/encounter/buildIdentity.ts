import type { PieceType } from '../../engine/core/pieces';
import type { EncounterState } from '../../engine/core/state';
import { compileRules } from '../../engine/rules/compile';
import type { Primitive } from '../../engine/rules/types';

/**
 * Visual build identity (F4), data side: pieces are never replaced, only
 * layered — glows, base rings and sigils whose intensity follows the upgrades
 * that touch each piece type.
 */
export const TYPE_AURA: Record<PieceType, string> = {
  pawn: '120, 220, 160',
  knight: '94, 200, 214',
  bishop: '232, 196, 106',
  rook: '170, 185, 210',
  queen: '200, 140, 255',
  king: '255, 150, 110',
};

const stackCache = new WeakMap<object, Record<string, number>>();

/** Stacks of owned upgrades affecting each piece type. */
export function buildDepth(state: EncounterState): Record<string, number> {
  const cached = stackCache.get(state.rules);
  if (cached) return cached;
  const rules = compileRules(state.rules);
  const depth: Record<string, number> = {};
  for (const [id, owned] of rules.owned) {
    const def = rules.defs.get(id)!;
    for (const t of def.affects) depth[t] = (depth[t] ?? 0) + owned.stacks;
  }
  stackCache.set(state.rules, depth);
  return depth;
}

/** Primitive sigils: small marks on a piece for each kind of power its upgrades grant. */
export const SIGIL_ORDER: Primitive[] = ['MOVE_PATTERN', 'PIERCE', 'EXTRA_ACTION', 'WARD', 'STATUS', 'PROMOTION_RULE', 'REPOSITION', 'SPAWN'];

export const SIGIL_LABEL: Partial<Record<Primitive, string>> = {
  MOVE_PATTERN: 'new movement',
  PIERCE: 'pierces',
  EXTRA_ACTION: 'extra actions',
  WARD: 'Wards',
  STATUS: 'immobilizes',
  PROMOTION_RULE: 'promotion rules',
  REPOSITION: 'repositions',
  SPAWN: 'spawns',
};

const sigilCache = new WeakMap<object, Partial<Record<PieceType, Primitive[]>>>();

export function pieceSigils(state: EncounterState, type: PieceType): Primitive[] {
  let byType = sigilCache.get(state.rules);
  if (!byType) {
    byType = {};
    const rules = compileRules(state.rules);
    for (const [id] of rules.owned) {
      const def = rules.defs.get(id)!;
      for (const t of def.affects) {
        const set = new Set(byType[t] ?? []);
        for (const prim of def.primitives) if (SIGIL_ORDER.includes(prim)) set.add(prim);
        byType[t] = SIGIL_ORDER.filter((x) => set.has(x));
      }
    }
    sigilCache.set(state.rules, byType);
  }
  return byType[type] ?? [];
}

/**
 * Board aura: the board glows in the colour of the run's dominant archetype
 * (violet for board-control runs heavy on mutations).
 */
export function boardAura(state: EncounterState): string | null {
  const depth = buildDepth(state);
  let best: PieceType | null = null;
  let bestN = 0;
  for (const t of Object.keys(depth) as PieceType[]) {
    if ((depth[t] ?? 0) > bestN) {
      best = t;
      bestN = depth[t] ?? 0;
    }
  }
  const mutations = state.marks.filter((m) => m.side === 'player' && m.source.startsWith('mutation')).length;
  if (mutations >= 4 && mutations >= bestN) return '180, 140, 255';
  return best && bestN >= 3 ? TYPE_AURA[best] : null;
}
