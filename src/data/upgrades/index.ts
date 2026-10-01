import type { UpgradeDef } from '../../engine/rules/types';
import { BISHOP_UPGRADES } from './bishop';
import { BOARD_UPGRADES } from './board';
import { PAWN_UPGRADES } from './pawn';
import { START_UPGRADES } from './start';

/** Every acquirable upgrade (Part C). */
export const UPGRADES: UpgradeDef[] = [...PAWN_UPGRADES, ...BISHOP_UPGRADES, ...BOARD_UPGRADES, ...START_UPGRADES];
