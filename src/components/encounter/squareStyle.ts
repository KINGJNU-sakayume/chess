import type { SquareType } from '../../engine/core/state';

/** Square tints and icon colours for board mutations and boss squares. */
export const SQUARE_STYLE: Record<SquareType, { tint: string; color: string }> = {
  CRIMSON: { tint: 'rgba(170, 20, 40, 0.42)', color: '#ff7a86' },
  BISHOP_ALTAR: { tint: 'rgba(232, 196, 106, 0.38)', color: '#fff1c2' },
  KNIGHT_GATE: { tint: 'rgba(60, 190, 210, 0.30)', color: '#b8f4ff' },
  ROOK_RAIL: { tint: 'rgba(150, 170, 190, 0.22)', color: '#e6eef7' },
  PROMOTION: { tint: 'rgba(255, 210, 90, 0.34)', color: '#fff3c4' },
  ROYAL: { tint: 'rgba(150, 90, 230, 0.36)', color: '#f0dcff' },
  CURSED: { tint: 'rgba(60, 20, 80, 0.50)', color: '#d9a8ff' },
  SANCTUARY: { tint: 'rgba(120, 220, 170, 0.30)', color: '#e2fff0' },
  CONSECRATED: { tint: 'rgba(255, 240, 180, 0.42)', color: '#fffbe6' },
  ENEMY_SANCTUARY: { tint: 'rgba(190, 60, 60, 0.32)', color: '#ffd6d6' },
  PROFANE: { tint: 'rgba(110, 40, 120, 0.42)', color: '#f0b8ff' },
};
