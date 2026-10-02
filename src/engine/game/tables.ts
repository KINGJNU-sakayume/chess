/**
 * Precomputed geometry: rays per direction and leap targets per leap set.
 * Every leap set is closed under negation, so "squares a leaper on `sq`
 * reaches" is also "squares a leaper attacking `sq` can stand on".
 */

/** 0..3 orthogonal (N, E, S, W), 4..7 diagonal (NE, SE, SW, NW). */
export const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];
export const OPP_DIR: readonly number[] = [2, 3, 0, 1, 6, 7, 4, 5];

/** RAYS[dir * 64 + sq]: squares from `sq` (exclusive) to the edge in `dir`. */
export const RAYS: Int8Array[] = [];
for (let d = 0; d < 8; d++) {
  for (let sq = 0; sq < 64; sq++) {
    const out: number[] = [];
    let f = (sq & 7) + DIRS[d][0];
    let r = (sq >> 3) + DIRS[d][1];
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      out.push(r * 8 + f);
      f += DIRS[d][0];
      r += DIRS[d][1];
    }
    RAYS[d * 64 + sq] = Int8Array.from(out);
  }
}

export const LEAP_KNIGHT = 0;
export const LEAP_CAMEL = 1;
/** One step orthogonally (used as a leap so it never slides). */
export const LEAP_ORTHO = 2;
/** One step diagonally. */
export const LEAP_DIAG = 3;
export const LEAP_SET_COUNT = 4;

const LEAP_VECTORS: readonly (readonly [number, number])[][] = [
  [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ],
  [
    [1, 3],
    [3, 1],
    [3, -1],
    [1, -3],
    [-1, -3],
    [-3, -1],
    [-3, 1],
    [-1, 3],
  ],
  [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ],
  [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ],
];

/** LEAPS[set][sq]: target squares. */
export const LEAPS: Int8Array[][] = LEAP_VECTORS.map((vectors) => {
  const perSq: Int8Array[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const out: number[] = [];
    for (const [df, dr] of vectors) {
      const f = (sq & 7) + df;
      const r = (sq >> 3) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(r * 8 + f);
    }
    perSq.push(Int8Array.from(out));
  }
  return perSq;
});

/** Chebyshev distance between two squares. */
export function distance(a: number, b: number): number {
  return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));
}
