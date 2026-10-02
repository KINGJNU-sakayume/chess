import type { Position } from '../game/position';
import type { SideRules } from '../game/rules';
import {
  BISHOP,
  F_SHIELD,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  type Color,
} from '../game/types';
import { distance } from '../game/tables';

/**
 * Static evaluation: PeSTO material and piece-square tables (tapered between
 * middlegame and endgame), plus terms for what augments change — stronger
 * movement, shields, earlier promotion and the alternative victory
 * conditions. Scores are centipawns from the side to move's point of view.
 */

// Tables are written from White's point of view with a8 first (as printed).
// prettier-ignore
const MG_PAWN = [
    0,   0,   0,   0,   0,   0,  0,   0,
   98, 134,  61,  95,  68, 126, 34, -11,
   -6,   7,  26,  31,  65,  56, 25, -20,
  -14,  13,   6,  21,  23,  12, 17, -23,
  -27,  -2,  -5,  12,  17,   6, 10, -25,
  -26,  -4,  -4, -10,   3,   3, 33, -12,
  -35,  -1, -20, -23, -15,  24, 38, -22,
    0,   0,   0,   0,   0,   0,  0,   0,
];
// prettier-ignore
const EG_PAWN = [
    0,   0,   0,   0,   0,   0,   0,   0,
  178, 173, 158, 134, 147, 132, 165, 187,
   94, 100,  85,  67,  56,  53,  82,  84,
   32,  24,  13,   5,  -2,   4,  17,  17,
   13,   9,  -3,  -7,  -7,  -8,   3,  -1,
    4,   7,  -6,   1,   0,  -5,  -1,  -8,
   13,   8,   8,  10,  13,   0,   2,  -7,
    0,   0,   0,   0,   0,   0,   0,   0,
];
// prettier-ignore
const MG_KNIGHT = [
  -167, -89, -34, -49,  61, -97, -15, -107,
   -73, -41,  72,  36,  23,  62,   7,  -17,
   -47,  60,  37,  65,  84, 129,  73,   44,
    -9,  17,  19,  53,  37,  69,  18,   22,
   -13,   4,  16,  13,  28,  19,  21,   -8,
   -23,  -9,  12,  10,  19,  17,  25,  -16,
   -29, -53, -12,  -3,  -1,  18, -14,  -19,
  -105, -21, -58, -33, -17, -28, -19,  -23,
];
// prettier-ignore
const EG_KNIGHT = [
  -58, -38, -13, -28, -31, -27, -63, -99,
  -25,  -8, -25,  -2,  -9, -25, -24, -52,
  -24, -20,  10,   9,  -1,  -9, -19, -41,
  -17,   3,  22,  22,  22,  11,   8, -18,
  -18,  -6,  16,  25,  16,  17,   4, -18,
  -23,  -3,  -1,  15,  10,  -3, -20, -22,
  -42, -20, -10,  -5,  -2, -20, -23, -44,
  -29, -51, -23, -15, -22, -18, -50, -64,
];
// prettier-ignore
const MG_BISHOP = [
  -29,   4, -82, -37, -25, -42,   7,  -8,
  -26,  16, -18, -13,  30,  59,  18, -47,
  -16,  37,  43,  40,  35,  50,  37,  -2,
   -4,   5,  19,  50,  37,  37,   7,  -2,
   -6,  13,  13,  26,  34,  12,  10,   4,
    0,  15,  15,  15,  14,  27,  18,  10,
    4,  15,  16,   0,   7,  21,  33,   1,
  -33,  -3, -14, -21, -13, -12, -39, -21,
];
// prettier-ignore
const EG_BISHOP = [
  -14, -21, -11,  -8, -7,  -9, -17, -24,
   -8,  -4,   7, -12, -3, -13,  -4, -14,
    2,  -8,   0,  -1, -2,   6,   0,   4,
   -3,   9,  12,   9, 14,  10,   3,   2,
   -6,   3,  13,  19,  7,  10,  -3,  -9,
  -12,  -3,   8,  10, 13,   3,  -7, -15,
  -14, -18,  -7,  -1,  4,  -9, -15, -27,
  -23,  -9, -23,  -5, -9, -16,  -5, -17,
];
// prettier-ignore
const MG_ROOK = [
   32,  42,  32,  51, 63,  9,  31,  43,
   27,  32,  58,  62, 80, 67,  26,  44,
   -5,  19,  26,  36, 17, 45,  61,  16,
  -24, -11,   7,  26, 24, 35,  -8, -20,
  -36, -26, -12,  -1,  9, -7,   6, -23,
  -45, -25, -16, -17,  3,  0,  -5, -33,
  -44, -16, -20,  -9, -1, 11,  -6, -71,
  -19, -13,   1,  17, 16,  7, -37, -26,
];
// prettier-ignore
const EG_ROOK = [
  13, 10, 18, 15, 12,  12,   8,   5,
  11, 13, 13, 11, -3,   3,   8,   3,
   7,  7,  7,  5,  4,  -3,  -5,  -3,
   4,  3, 13,  1,  2,   1,  -1,   2,
   3,  5,  8,  4, -5,  -6,  -8, -11,
  -4,  0, -5, -1, -7, -12,  -8, -16,
  -6, -6,  0,  2, -9,  -9, -11,  -3,
  -9,  2,  3, -1, -5, -13,   4, -20,
];
// prettier-ignore
const MG_QUEEN = [
  -28,   0,  29,  12,  59,  44,  43,  45,
  -24, -39,  -5,   1, -16,  57,  28,  54,
  -13, -17,   7,   8,  29,  56,  47,  57,
  -27, -27, -16, -16,  -1,  17,  -2,   1,
   -9, -26,  -9, -10,  -2,  -4,   3,  -3,
  -14,   2, -11,  -2,  -5,   2,  14,   5,
  -35,  -8,  11,   2,   8,  15,  -3,   1,
   -1, -18,  -9,  10, -15, -25, -31, -50,
];
// prettier-ignore
const EG_QUEEN = [
   -9,  22,  22,  27,  27,  19,  10,  20,
  -17,  20,  32,  41,  58,  25,  30,   0,
  -20,   6,   9,  49,  47,  35,  19,   9,
    3,  22,  24,  45,  57,  40,  57,  36,
  -18,  28,  19,  47,  31,  34,  39,  23,
  -16, -27,  15,   6,   9,  17,  10,   5,
  -22, -23, -30, -16, -16, -23, -36, -32,
  -33, -28, -22, -43,  -5, -32, -20, -41,
];
// prettier-ignore
const MG_KING = [
  -65,  23,  16, -15, -56, -34,   2,  13,
   29,  -1, -20,  -7,  -8,  -4, -38, -29,
   -9,  24,   2, -16, -20,   6,  22, -22,
  -17, -20, -12, -27, -30, -25, -14, -36,
  -49,  -1, -27, -39, -46, -44, -33, -51,
  -14, -14, -22, -46, -44, -30, -15, -27,
    1,   7,  -8, -64, -43, -16,   9,   8,
  -15,  36,  12, -54,   8, -28,  24,  14,
];
// prettier-ignore
const EG_KING = [
  -74, -35, -18, -18, -11,  15,   4, -17,
  -12,  17,  14,  17,  17,  38,  23,  11,
   10,  17,  23,  15,  20,  45,  44,  13,
   -8,  22,  24,  27,  26,  33,  26,   3,
  -18,  -4,  21,  24,  27,  23,   9, -11,
  -19,  -3,  11,  21,  23,  16,   7,  -9,
  -27, -11,   4,  13,  14,   4,  -5, -17,
  -53, -34, -21, -11, -28, -14, -24, -43,
];

const avg = (a: number[], b: number[]) => a.map((v, i) => Math.round((v + b[i]) / 2));

/** Base material by kind (index = kind). */
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0, 830, 930];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0, 800, 940];
const PHASE_INC = [0, 0, 1, 1, 2, 4, 0, 3, 4];
const MAX_PHASE = 24;

const MG_PST: number[][] = [[], MG_PAWN, MG_KNIGHT, MG_BISHOP, MG_ROOK, MG_QUEEN, MG_KING, avg(MG_BISHOP, MG_KNIGHT), avg(MG_ROOK, MG_KNIGHT)];
const EG_PST: number[][] = [[], EG_PAWN, EG_KNIGHT, EG_BISHOP, EG_ROOK, EG_QUEEN, EG_KING, avg(EG_BISHOP, EG_KNIGHT), avg(EG_ROOK, EG_KNIGHT)];

/**
 * Combined value + PST per piece code and square: MG[code * 64 + sq].
 * White reads the table at sq ^ 56 (tables are printed rank 8 first), Black at sq.
 */
const BASE_MG = new Int16Array(32 * 64);
const BASE_EG = new Int16Array(32 * 64);
for (let kind = 1; kind <= 8; kind++) {
  for (let color = 0; color < 2; color++) {
    const code = kind | (color << 4);
    for (let sq = 0; sq < 64; sq++) {
      const idx = color === WHITE ? sq ^ 56 : sq;
      BASE_MG[code * 64 + sq] = MG_VALUE[kind] + MG_PST[kind][idx];
      BASE_EG[code * 64 + sq] = EG_VALUE[kind] + EG_PST[kind][idx];
    }
  }
}

export const PIECE_MG = MG_VALUE;

/** Extra value per piece of a kind under a side's rules: [mg, eg]. */
function kindBonus(r: SideRules, kind: number): [number, number] {
  switch (kind) {
    case PAWN: {
      let b = 0;
      if (r.pawnSidestep) b += 8;
      if (r.pawnCharge) b += 6;
      if (r.pawnPike) b += 8;
      if (r.pawnRetreat) b += 6;
      if (r.martyrPawns) b += 30;
      if (r.breakthrough) b += 25;
      b += (7 - r.promoRank) * 22;
      return [b, b];
    }
    case KNIGHT:
      return [(r.knightCamel ? 110 : 0) + (r.knightOath ? 20 : 0), (r.knightCamel ? 120 : 0) + (r.knightOath ? 15 : 0)];
    case BISHOP:
      return r.bishopStep ? [120, 130] : [0, 0];
    case ROOK:
      return r.rookStep ? [90, 100] : [0, 0];
    case QUEEN:
      return r.queenKnight ? [320, 300] : [0, 0];
    case KING:
      return r.kingRange > 1 ? [20, 90] : [0, 0];
    default:
      return [0, 0];
  }
}

const bonusCache = new WeakMap<SideRules, Int16Array>();

/** [mg by kind (0..8), eg by kind (9..17)], cached per rules object (rules objects are replaced, never mutated). */
function bonusTable(r: SideRules): Int16Array {
  let t = bonusCache.get(r);
  if (!t) {
    t = new Int16Array(18);
    for (let k = 1; k <= 8; k++) {
      const [mg, eg] = kindBonus(r, k);
      t[k] = mg;
      t[9 + k] = eg;
    }
    bonusCache.set(r, t);
  }
  return t;
}

/** Bonus for a pawn by squares left to its promotion rank (index = squares to go). */
const ADVANCE_MG = [0, 70, 35, 18, 8, 0, 0, 0];
const ADVANCE_EG = [0, 150, 80, 40, 18, 6, 0, 0];

/** King-of-the-hill bonus by distance to the nearest centre square. */
const HILL = [0, 230, 120, 55, 20, 0, 0, 0];
/** Three-check bonus by checks already given. */
const CHECKS = [0, 140, 380, 0];

export function evaluate(pos: Position): number {
  const board = pos.board;
  const flags = pos.flags;
  let mg0 = 0;
  let eg0 = 0;
  let mg1 = 0;
  let eg1 = 0;
  let phase = 0;
  const r0 = pos.rules[0];
  const r1 = pos.rules[1];
  const b0 = bonusTable(r0);
  const b1 = bonusTable(r1);
  const adv0 = r0.promoRank < 7 || r0.breakthrough;
  const adv1 = r1.promoRank < 7 || r1.breakthrough;

  for (let sq = 0; sq < 64; sq++) {
    const c = board[sq];
    if (c === 0) continue;
    const kind = c & 15;
    const color = c >> 4;
    let mg = BASE_MG[c * 64 + sq];
    let eg = BASE_EG[c * 64 + sq];
    phase += PHASE_INC[kind];
    const b = color === 0 ? b0 : b1;
    mg += b[kind];
    eg += b[9 + kind];
    if (kind === PAWN) {
      const r = color === 0 ? r0 : r1;
      if (color === 0 ? adv0 : adv1) {
        const rel = color === 0 ? sq >> 3 : 7 - (sq >> 3);
        const togo = Math.max(0, r.promoRank - rel);
        const mul = r.breakthrough ? 3 : 1;
        mg += ADVANCE_MG[togo] * mul;
        eg += ADVANCE_EG[togo] * mul;
      }
    }
    if (flags[sq] & F_SHIELD) {
      const v = kind === KING ? 320 : Math.min(160, (MG_VALUE[kind] * 3) / 10);
      mg += v;
      eg += v;
    }
    if (color === 0) {
      mg0 += mg;
      eg0 += eg;
    } else {
      mg1 += mg;
      eg1 += eg;
    }
  }

  // Alternative victory conditions.
  for (let color = 0; color < 2; color++) {
    const r = color === 0 ? r0 : r1;
    let bonus = 0;
    if (r.kingOfTheHill) {
      const k = pos.kingSq[color];
      if (k >= 0) {
        const d = Math.min(distance(k, 27), distance(k, 28), distance(k, 35), distance(k, 36));
        bonus += HILL[d];
      }
    }
    if (r.threeCheck) bonus += CHECKS[Math.min(3, pos.checks[color])] + 40;
    if (color === 0) {
      mg0 += bonus;
      eg0 += bonus;
    } else {
      mg1 += bonus;
      eg1 += bonus;
    }
  }

  const p = Math.min(phase, MAX_PHASE);
  const mg = mg0 - mg1;
  const eg = eg0 - eg1;
  const score = Math.round((mg * p + eg * (MAX_PHASE - p)) / MAX_PHASE);
  return (pos.side === WHITE ? score : -score) + 12;
}

/** Rough piece value for move ordering (MVV-LVA), by kind. */
export const ORDER_VALUE = [0, 100, 320, 330, 500, 950, 2000, 800, 900];

/** Does the side have anything other than pawns and the King (null-move safety)? */
export function hasPieces(pos: Position, color: Color): boolean {
  const board = pos.board;
  for (let sq = 0; sq < 64; sq++) {
    const c = board[sq];
    if (c !== 0 && c >> 4 === color) {
      const k = c & 15;
      if (k !== PAWN && k !== KING) return true;
    }
  }
  return false;
}
