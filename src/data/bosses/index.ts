import type { BossDef } from '../../engine/encounters/bossTypes';
import { FORTRESS_KING } from './fortressKing';
import { PAWN_EMPEROR } from './pawnEmperor';
import { TYRANT_QUEEN } from './tyrantQueen';

/** Boss definitions (Part E), keyed by id. */
export const BOSSES: Record<string, BossDef> = {
  fortress_king: FORTRESS_KING,
  tyrant_queen: TYRANT_QUEEN,
  pawn_emperor: PAWN_EMPEROR,
};
