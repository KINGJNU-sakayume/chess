import type { EncounterState } from '../core/state';
import type { Rarity } from '../rules/types';
import { actTuning } from '../../data/acts';
import { ECONOMY } from '../../data/economy';

/**
 * Gold (B7): base by act + gold per unused turn (a flat amount without a
 * usable turn limit), multiplied for elites and bosses. No running score is
 * displayed. All numbers are data (`src/data/economy.ts`, `ACTS[].goldBase`).
 */
export function encounterGold(state: EncounterState): number {
  const base = actTuning(state.config.act).goldBase;
  const T = state.config.turnLimit;
  const obj = state.config.objective.type;
  const timed = T !== null && obj !== 'SURVIVAL' && obj !== 'DEFENSE';
  const bonus = timed ? ECONOMY.goldPerUnusedTurn * Math.max(0, T - (state.outcome?.turn ?? T)) : ECONOMY.holdOutGold;
  const mult = state.config.kind === 'elite' ? ECONOMY.eliteGoldMultiplier : state.config.kind === 'boss' ? ECONOMY.bossGoldMultiplier : 1;
  return Math.round((base + bonus) * mult);
}

export const UPGRADE_PRICE: Record<Rarity, number> = ECONOMY.upgradePrice;
export const PIECE_PRICE = ECONOMY.piecePrice;
export const CROWN_PRICE = ECONOMY.crownPrice;
export const REMOVE_CURSE_PRICE = ECONOMY.removeCursePrice;
export const REROLL_PRICE = ECONOMY.rerollPrice;
export const MAX_CROWNS = ECONOMY.maxCrowns;

/** Shop price of an upgrade in a given act. */
export const upgradePrice = (rarity: Rarity, act: number): number => Math.round(UPGRADE_PRICE[rarity] * (1 + ECONOMY.upgradePriceGrowthPerAct * (act - 1)));
