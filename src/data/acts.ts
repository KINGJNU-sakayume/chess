import type { Rarity } from '../engine/rules/types';

/** Per-act tuning (B8). Starting values exposed as data. */
export interface ActTuning {
  act: number;
  feel: string;
  /** enemyActionsPerPhase range for normal combats. */
  enemyActions: [number, number];
  turnLimit: [number, number];
  terrainChance: number;
  rarityWeights: Record<Rarity, number>;
  goldBase: number;
  /** Elite escalation: Act I rolls "+1 action or 1 affix"; later acts add affixes. */
  eliteAffixes: number;
  eliteExtraActionChance: number;
  /** Node rows before the boss row. */
  rows: number;
  boss: string;
}

export const ACTS: ActTuning[] = [
  {
    act: 1,
    feel: 'near-normal chess',
    enemyActions: [1, 1],
    turnLimit: [6, 7],
    terrainChance: 0.15,
    rarityWeights: { common: 70, uncommon: 25, rare: 5, legendary: 0 },
    goldBase: 10,
    eliteAffixes: 1,
    eliteExtraActionChance: 0.5,
    rows: 9,
    boss: 'fortress_king',
  },
  {
    act: 2,
    feel: 'clear specialization',
    enemyActions: [1, 2],
    turnLimit: [6, 7],
    terrainChance: 0.45,
    rarityWeights: { common: 55, uncommon: 32, rare: 11, legendary: 2 },
    goldBase: 15,
    eliteAffixes: 1,
    eliteExtraActionChance: 0,
    rows: 9,
    boss: 'tyrant_queen',
  },
  {
    act: 3,
    feel: 'heavily distorted rules',
    enemyActions: [2, 2],
    turnLimit: [7, 8],
    terrainChance: 0.6,
    rarityWeights: { common: 40, uncommon: 37, rare: 18, legendary: 5 },
    goldBase: 20,
    eliteAffixes: 2,
    eliteExtraActionChance: 0,
    rows: 9,
    boss: 'pawn_emperor',
  },
];

export const actTuning = (act: number): ActTuning => ACTS[Math.min(ACTS.length, Math.max(1, act)) - 1];
