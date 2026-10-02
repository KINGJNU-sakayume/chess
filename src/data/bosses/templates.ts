import type { EncounterTemplate } from '../../engine/encounters/templates';
import { FORTRESS_KING_TEMPLATE } from './fortressKing';
import { PAWN_EMPEROR_TEMPLATE } from './pawnEmperor';
import { TYRANT_QUEEN_TEMPLATE } from './tyrantQueen';

/** Boss encounter layouts, keyed by boss id (Part E). */
export const BOSS_TEMPLATES: Record<string, EncounterTemplate> = {
  fortress_king: FORTRESS_KING_TEMPLATE,
  tyrant_queen: TYRANT_QUEEN_TEMPLATE,
  pawn_emperor: PAWN_EMPEROR_TEMPLATE,
};
