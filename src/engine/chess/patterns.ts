import { DIAGONAL, KNIGHT_JUMPS, ORTHOGONAL, ALL_DIRECTIONS, type Vec } from '../core/coords';
import type { PieceType } from '../core/pieces';

/**
 * Base (orthodox) movement patterns. Both the strict reference engine and the
 * gameplay MoveGenerator (Layer B step 1) read these, so "base piece moves"
 * mean exactly the same thing everywhere.
 */
export interface BasePattern {
  /** Sliding / stepping rays: direction plus maximum range. */
  rays: { dir: Vec; range: number }[];
  /** Leaper offsets (Knight). */
  leaps: Vec[];
}

const rays = (dirs: readonly Vec[], range: number) => dirs.map((dir) => ({ dir, range }));

export const BASE_PATTERNS: Readonly<Record<Exclude<PieceType, 'pawn'>, BasePattern>> = {
  knight: { rays: [], leaps: [...KNIGHT_JUMPS] },
  bishop: { rays: rays(DIAGONAL, 7), leaps: [] },
  rook: { rays: rays(ORTHOGONAL, 7), leaps: [] },
  queen: { rays: rays(ALL_DIRECTIONS, 7), leaps: [] },
  king: { rays: rays(ALL_DIRECTIONS, 1), leaps: [] },
};
