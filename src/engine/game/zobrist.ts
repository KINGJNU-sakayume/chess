import { Rng } from '../rng/rng';

/**
 * Zobrist keys as two 32-bit halves (JS bit operations are 32-bit). The keys
 * are generated from a fixed seed, so hashes are stable across sessions and
 * between the UI thread and the AI worker.
 */
const rng = Rng.fromSeed('augment-chess-zobrist');
const fill = (n: number): [Int32Array, Int32Array] => {
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    lo[i] = rng.nextU32() | 0;
    hi[i] = rng.nextU32() | 0;
  }
  return [lo, hi];
};

/** [code * 64 + sq], codes 0..31. */
export const [Z_PIECE_LO, Z_PIECE_HI] = fill(32 * 64);
/** [flagBit * 64 + sq] for flag bits 0 (shield) and 1 (frozen). */
export const [Z_FLAG_LO, Z_FLAG_HI] = fill(2 * 64);
/** [terrain * 64 + sq], terrain 0..3 (0 unused). */
export const [Z_TERRAIN_LO, Z_TERRAIN_HI] = fill(4 * 64);
export const [Z_CASTLE_LO, Z_CASTLE_HI] = fill(16);
export const [Z_EP_LO, Z_EP_HI] = fill(64);
/** [color * 4 + count]. */
export const [Z_CHECKS_LO, Z_CHECKS_HI] = fill(8);
const [sideLo, sideHi] = fill(1);
export const Z_SIDE_LO = sideLo[0];
export const Z_SIDE_HI = sideHi[0];
