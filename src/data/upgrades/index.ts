import type { UpgradeDef } from '../../engine/rules/types';
import { BISHOP_UPGRADES } from './bishop';
import { BOARD_UPGRADES } from './board';
import { PAWN_UPGRADES } from './pawn';
import { START_UPGRADES } from './start';
import { KNIGHT_UPGRADES } from './knight';
import { ROOK_UPGRADES } from './rook';
import { ROYAL_UPGRADES } from './royal';
import { DEBUFF_UPGRADES } from './debuffs';

/** Every acquirable upgrade (Part C). */
export const UPGRADES: UpgradeDef[] = [
  ...PAWN_UPGRADES,
  ...BISHOP_UPGRADES,
  ...KNIGHT_UPGRADES,
  ...ROOK_UPGRADES,
  ...ROYAL_UPGRADES,
  ...BOARD_UPGRADES,
  ...START_UPGRADES,
  ...DEBUFF_UPGRADES,
];
