export interface PiecePalette {
  fill: string;
  stroke: string;
  detail: string;
}

export const PALETTES: Record<'white' | 'black', PiecePalette> = {
  white: { fill: '#f4ecdc', stroke: '#2a2018', detail: '#2a2018' },
  black: { fill: '#2a2230', stroke: '#e9dcc8', detail: '#e9dcc8' },
};
