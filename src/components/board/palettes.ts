import type { Side } from '../../engine/core/pieces';

export interface PiecePalette {
  fill: string;
  stroke: string;
  detail: string;
}

export const PALETTES: Record<Side, PiecePalette> = {
  player: { fill: '#f4ecdc', stroke: '#2a2018', detail: '#2a2018' },
  enemy: { fill: '#2a2230', stroke: '#e9dcc8', detail: '#e9dcc8' },
};
