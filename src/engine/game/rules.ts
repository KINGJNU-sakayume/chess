import { ARCHBISHOP, BISHOP, CHANCELLOR, KING, KNIGHT, QUEEN, ROOK } from './types';
import { LEAP_CAMEL, LEAP_DIAG, LEAP_KNIGHT, LEAP_ORTHO, LEAP_SET_COUNT } from './tables';

/**
 * The rules one side plays by. Passive augments compile into these flags;
 * move generation, make/unmake and evaluation only ever read this struct.
 */
export interface SideRules {
  /** Knights also leap (3,1). */
  knightCamel: boolean;
  /** Bishops (and Archbishops) also step one square orthogonally. */
  bishopStep: boolean;
  /** Rooks (and Chancellors) also step one square diagonally. */
  rookStep: boolean;
  /** Queens also move like a knight (Amazon). */
  queenKnight: boolean;
  /** How far the King moves in each direction (1 or 2). */
  kingRange: number;
  /** Pawns may step or capture sideways. */
  pawnSidestep: boolean;
  /** Pawns may advance two squares from any rank. */
  pawnCharge: boolean;
  /** Pawns may capture straight ahead. */
  pawnPike: boolean;
  /** Pawns may step back one square or capture diagonally backwards (never onto the back rank). */
  pawnRetreat: boolean;
  /** Relative rank (0..7) on or beyond which a pawn promotes. 7 = orthodox. */
  promoRank: number;
  /** When one of these pawns is captured, the capturer (not a King) dies too. */
  martyrPawns: boolean;
  /** A Knight that captures gains a shield. */
  knightOath: boolean;
  /** A pawn that captures gains a shield. */
  pawnOath: boolean;
  /** When one of these shields stops a capture, the attacker (not a King) is frozen. */
  thornShield: boolean;
  /** Win when the King still stands on d4, e4, d5 or e5 after the opponent's turn. */
  kingOfTheHill: boolean;
  /** Win by checking the enemy King three times. */
  threeCheck: boolean;
  /** Win by promoting a pawn. */
  breakthrough: boolean;
}

export const BASE_RULES: Readonly<SideRules> = {
  knightCamel: false,
  bishopStep: false,
  rookStep: false,
  queenKnight: false,
  kingRange: 1,
  pawnSidestep: false,
  pawnCharge: false,
  pawnPike: false,
  pawnRetreat: false,
  promoRank: 7,
  martyrPawns: false,
  knightOath: false,
  pawnOath: false,
  thornShield: false,
  kingOfTheHill: false,
  threeCheck: false,
  breakthrough: false,
};

export const baseRules = (): SideRules => ({ ...BASE_RULES });

/** Compiled movement geometry for one side. */
export interface Profile {
  /** leapSets[kind]: leap set ids the kind uses. */
  leapSets: number[][];
  /** rayRange[kind * 8 + dir]: how far the kind slides in a direction (0 = not at all). */
  rayRange: Int8Array;
  /** leapMask[set]: bit (1 << kind) for every kind using the leap set (attack detection). */
  leapMask: Int32Array;
  /** Bit (1 << kind) for every kind that slides at all. */
  sliderMask: number;
}

export function buildProfile(r: SideRules): Profile {
  const leapSets: number[][] = Array.from({ length: 9 }, () => []);
  const rayRange = new Int8Array(9 * 8);
  const setRays = (kind: number, dirs: number[], range: number) => {
    for (const d of dirs) rayRange[kind * 8 + d] = range;
  };
  const ORTHO = [0, 1, 2, 3];
  const DIAG = [4, 5, 6, 7];
  const ALL = [0, 1, 2, 3, 4, 5, 6, 7];

  leapSets[KNIGHT].push(LEAP_KNIGHT);
  if (r.knightCamel) leapSets[KNIGHT].push(LEAP_CAMEL);

  setRays(BISHOP, DIAG, 7);
  if (r.bishopStep) leapSets[BISHOP].push(LEAP_ORTHO);

  setRays(ROOK, ORTHO, 7);
  if (r.rookStep) leapSets[ROOK].push(LEAP_DIAG);

  setRays(QUEEN, ALL, 7);
  if (r.queenKnight) leapSets[QUEEN].push(LEAP_KNIGHT);

  setRays(KING, ALL, Math.max(1, Math.min(2, r.kingRange)));

  setRays(ARCHBISHOP, DIAG, 7);
  leapSets[ARCHBISHOP].push(LEAP_KNIGHT);
  if (r.bishopStep) leapSets[ARCHBISHOP].push(LEAP_ORTHO);

  setRays(CHANCELLOR, ORTHO, 7);
  leapSets[CHANCELLOR].push(LEAP_KNIGHT);
  if (r.rookStep) leapSets[CHANCELLOR].push(LEAP_DIAG);

  const leapMask = new Int32Array(LEAP_SET_COUNT);
  for (let kind = 0; kind < 9; kind++) for (const s of leapSets[kind]) leapMask[s] |= 1 << kind;
  let sliderMask = 0;
  for (let kind = 0; kind < 9; kind++) {
    for (let d = 0; d < 8; d++) if (rayRange[kind * 8 + d] > 0) sliderMask |= 1 << kind;
  }
  return { leapSets, rayRange, leapMask, sliderMask };
}
