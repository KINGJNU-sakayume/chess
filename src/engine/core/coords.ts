/**
 * Square and coordinate utilities.
 *
 * Squares are integers 0..63: `sq = rank * 8 + file`, where file 0 = "a" and
 * rank 0 = "1". The player (White) starts on ranks 1–2 at the bottom of the
 * board; the enemy (Black) sits at the top and moves toward rank 1.
 */
export type Sq = number;
export type Vec = readonly [number, number];

export const FILES = 'abcdefgh';

export const fileOf = (sq: Sq): number => sq & 7;
export const rankOf = (sq: Sq): number => sq >> 3;
export const sqOf = (file: number, rank: number): Sq => rank * 8 + file;
export const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8;

/** Algebraic name, e.g. 0 → "a1", 63 → "h8". */
export function sqName(sq: Sq): string {
  return FILES[fileOf(sq)] + String(rankOf(sq) + 1);
}

/** Parse "e4" → square index. Throws on malformed input. */
export function parseSq(name: string): Sq {
  const file = FILES.indexOf(name[0]);
  const rank = Number(name.slice(1)) - 1;
  if (name.length !== 2 || file < 0 || !(rank >= 0 && rank < 8)) {
    throw new Error(`Invalid square name: ${name}`);
  }
  return sqOf(file, rank);
}

/** a1 is a dark square. */
export const isLightSquare = (sq: Sq): boolean => (fileOf(sq) + rankOf(sq)) % 2 === 1;

export const chebyshev = (a: Sq, b: Sq): number =>
  Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

export const manhattan = (a: Sq, b: Sq): number =>
  Math.abs(fileOf(a) - fileOf(b)) + Math.abs(rankOf(a) - rankOf(b));

/** Step from `sq` by vector; returns -1 when leaving the board. */
export function step(sq: Sq, v: Vec, times = 1): Sq {
  const f = fileOf(sq) + v[0] * times;
  const r = rankOf(sq) + v[1] * times;
  return onBoard(f, r) ? sqOf(f, r) : -1;
}

export const ORTHOGONAL: readonly Vec[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
export const DIAGONAL: readonly Vec[] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];
export const ALL_DIRECTIONS: readonly Vec[] = [...ORTHOGONAL, ...DIAGONAL];
export const KNIGHT_JUMPS: readonly Vec[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/** All squares adjacent (8-neighbourhood) to `sq`. */
export function neighbours(sq: Sq, radius = 1): Sq[] {
  const out: Sq[] = [];
  const f0 = fileOf(sq);
  const r0 = rankOf(sq);
  for (let dr = -radius; dr <= radius; dr++) {
    for (let df = -radius; df <= radius; df++) {
      if (df === 0 && dr === 0) continue;
      const f = f0 + df;
      const r = r0 + dr;
      if (onBoard(f, r)) out.push(sqOf(f, r));
    }
  }
  return out;
}

/** Squares strictly between a and b if they share a rank, file or diagonal; otherwise null. */
export function between(a: Sq, b: Sq): Sq[] | null {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (df === 0 && dr === 0) return null;
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
  const v: Vec = [Math.sign(df), Math.sign(dr)];
  const out: Sq[] = [];
  let cur = step(a, v);
  while (cur !== b) {
    out.push(cur);
    cur = step(cur, v);
  }
  return out;
}

export const ALL_SQUARES: readonly Sq[] = Array.from({ length: 64 }, (_, i) => i);
