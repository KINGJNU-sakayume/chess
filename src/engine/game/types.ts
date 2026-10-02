/**
 * Numeric vocabulary of the augment-chess engine. Everything the search
 * touches is a small integer so move generation and make/unmake stay
 * allocation-free.
 *
 * Squares are 0..63 (`rank * 8 + file`, a1 = 0, h8 = 63). White moves up the
 * board, Black moves down.
 */
export type Color = 0 | 1;
export const WHITE: Color = 0;
export const BLACK: Color = 1;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
/** Bishop + Knight. */
export const ARCHBISHOP = 7;
/** Rook + Knight. */
export const CHANCELLOR = 8;

export type PieceKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const PIECE_KINDS: readonly PieceKind[] = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, ARCHBISHOP, CHANCELLOR];
export const PROMOTION_KINDS: readonly PieceKind[] = [QUEEN, KNIGHT, ROOK, BISHOP];

/** Piece code: kind in the low 4 bits, colour in bit 4. 0 = empty. */
export const pieceCode = (color: Color, kind: number): number => kind | (color << 4);
export const kindOf = (code: number): number => code & 15;
export const colorOf = (code: number): Color => (code >> 4) as Color;

// Per-square piece flags.
/** The piece absorbs the next capture (the attacker bounces back). */
export const F_SHIELD = 1;
/** The piece cannot move during its owner's next turn. */
export const F_FROZEN = 2;

// Terrain.
export const T_NONE = 0;
/** Blocks movement; any piece may break it by moving onto it as if capturing. */
export const T_WALL = 1;
/** A trap owned by White (hurts Black pieces). */
export const T_TRAP_W = 2;
/** A trap owned by Black (hurts White pieces). */
export const T_TRAP_B = 3;
export const trapOf = (owner: Color): number => (owner === WHITE ? T_TRAP_W : T_TRAP_B);

// Castling rights.
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

// Move encoding: from (6 bits) | to (6 bits) | promotion kind (4 bits) | flags.
export const M_CAPTURE = 1 << 16;
export const M_EP = 1 << 17;
export const M_CASTLE = 1 << 18;
export const M_DOUBLE = 1 << 19;
/** Moving onto a wall (breaking it). */
export const M_WALL = 1 << 20;

export const moveFrom = (m: number): number => m & 63;
export const moveTo = (m: number): number => (m >> 6) & 63;
export const movePromo = (m: number): number => (m >> 12) & 15;
export const encodeMove = (from: number, to: number, promo = 0, flags = 0): number => from | (to << 6) | (promo << 12) | flags;

// Win reasons.
export const WIN_NONE = 0;
export const WIN_KING_CAPTURE = 1;
export const WIN_HILL = 2;
export const WIN_THREE_CHECK = 3;
export const WIN_BREAKTHROUGH = 4;

/** Squares d4, e4, d5, e5. */
export const CENTER_SQUARES: readonly number[] = [27, 28, 35, 36];

export const fileOf = (sq: number): number => sq & 7;
export const rankOf = (sq: number): number => sq >> 3;
/** Rank counted from the colour's own back rank (0..7). */
export const relRank = (sq: number, color: Color): number => (color === WHITE ? sq >> 3 : 7 - (sq >> 3));
export const forward = (color: Color): number => (color === WHITE ? 8 : -8);

export function sqName(sq: number): string {
  return 'abcdefgh'[sq & 7] + String((sq >> 3) + 1);
}

export function parseSquare(name: string): number {
  const file = 'abcdefgh'.indexOf(name[0]);
  const rank = Number(name.slice(1)) - 1;
  if (name.length !== 2 || file < 0 || !(rank >= 0 && rank < 8)) throw new Error(`Invalid square: ${name}`);
  return rank * 8 + file;
}

/** FEN letters (upper case); A and C are the fairy pieces. */
export const KIND_LETTER: Readonly<Record<number, string>> = {
  [PAWN]: 'P',
  [KNIGHT]: 'N',
  [BISHOP]: 'B',
  [ROOK]: 'R',
  [QUEEN]: 'Q',
  [KING]: 'K',
  [ARCHBISHOP]: 'A',
  [CHANCELLOR]: 'C',
};

export const LETTER_KIND: Readonly<Record<string, number>> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
  a: ARCHBISHOP,
  c: CHANCELLOR,
};

export const KIND_NAME: Readonly<Record<number, string>> = {
  [PAWN]: '폰',
  [KNIGHT]: '나이트',
  [BISHOP]: '비숍',
  [ROOK]: '룩',
  [QUEEN]: '퀸',
  [KING]: '킹',
  [ARCHBISHOP]: '대주교',
  [CHANCELLOR]: '재상',
};

export const COLOR_NAME: Readonly<Record<Color, string>> = { 0: '백', 1: '흑' };

/** Material values in pawns, used for display and simple heuristics (the search has its own tables). */
export const KIND_POINTS: Readonly<Record<number, number>> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
  [KING]: 0,
  [ARCHBISHOP]: 7,
  [CHANCELLOR]: 8,
};
