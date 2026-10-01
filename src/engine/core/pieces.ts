/** Piece vocabulary shared by the strict chess module and the gameplay engine. */
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Side = 'player' | 'enemy';

export const PIECE_TYPES: readonly PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
export const PROMOTION_TYPES: readonly PieceType[] = ['queen', 'rook', 'bishop', 'knight'];

/** Conventional material values, used only by AI heuristics (never shown as stats). */
export const PIECE_VALUE: Readonly<Record<PieceType, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 100,
};

export const PIECE_NAME: Readonly<Record<PieceType, string>> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
};

/** FEN letter (uppercase). */
export const PIECE_LETTER: Readonly<Record<PieceType, string>> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
};

export const LETTER_TO_TYPE: Readonly<Record<string, PieceType>> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const otherSide = (s: Side): Side => (s === 'player' ? 'enemy' : 'player');

/** Forward rank direction for a side: the player moves up (+1), the enemy down (−1). */
export const forwardOf = (s: Side): 1 | -1 => (s === 'player' ? 1 : -1);

export const isSlider = (t: PieceType): boolean => t === 'bishop' || t === 'rook' || t === 'queen';
