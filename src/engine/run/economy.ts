import type { EncounterState } from '../core/state';
import type { Rarity } from '../rules/types';
import { actTuning } from '../../data/acts';

/**
 * Gold (B7): base by act + 2 per unused turn (+5 flat without a usable turn
 * limit), ×1.5 for elites and ×2 for bosses. No running score is displayed.
 */
export function encounterGold(state: EncounterState): number {
  const base = actTuning(state.config.act).goldBase;
  const T = state.config.turnLimit;
  const obj = state.config.objective.type;
  const timed = T !== null && obj !== 'SURVIVAL' && obj !== 'DEFENSE';
  const bonus = timed ? 2 * Math.max(0, T - (state.outcome?.turn ?? T)) : 5;
  const mult = state.config.kind === 'elite' ? 1.5 : state.config.kind === 'boss' ? 2 : 1;
  return Math.round((base + bonus) * mult);
}

export const UPGRADE_PRICE: Record<Rarity, number> = { common: 30, uncommon: 45, rare: 65, legendary: 95 };
export const PIECE_PRICE = { pawn: 12, knight: 35, bishop: 35, rook: 50, queen: 90, king: 999 } as const;
export const CROWN_PRICE = 55;
export const REMOVE_CURSE_PRICE = 60;
export const REROLL_PRICE = 15;
export const MAX_CROWNS = 3;
