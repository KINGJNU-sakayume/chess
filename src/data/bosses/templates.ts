import type { EncounterTemplate } from '../../engine/encounters/templates';
import { FORTRESS_KING_TEMPLATE } from './fortressKing';

/** Boss encounter layouts, keyed by boss id (Part E). */
export const BOSS_TEMPLATES: Record<string, EncounterTemplate> = {
  fortress_king: FORTRESS_KING_TEMPLATE,
};
