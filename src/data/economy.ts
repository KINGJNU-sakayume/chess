import type { PieceType } from '../engine/core/pieces';
import type { Rarity } from '../engine/rules/types';

/**
 * Economy tuning (B7), exposed as data. Gold income per encounter lives in
 * `ACTS[].goldBase`; everything the Shop charges lives here.
 */
export const ECONOMY = {
  /** Crowns at the start of a run, and the cap. */
  maxCrowns: 3,
  /** Gold per unused turn on objectives that can finish early. */
  goldPerUnusedTurn: 2,
  /** Flat gold for holding out (Survival/Defense cannot finish early). */
  holdOutGold: 5,
  eliteGoldMultiplier: 1.5,
  bossGoldMultiplier: 2,
  upgradePrice: { common: 30, uncommon: 45, rare: 65, legendary: 95 } as Record<Rarity, number>,
  /** Upgrade prices grow by this fraction per act after the first. */
  upgradePriceGrowthPerAct: 0.1,
  piecePrice: { pawn: 12, knight: 35, bishop: 35, rook: 50, queen: 90, king: 999 } as Record<PieceType, number>,
  crownPrice: 55,
  removeCursePrice: 60,
  /** The first reroll in a Shop is free; later ones cost this much. */
  rerollPrice: 15,
};
