import type { AffixDef } from '../../engine/rules/types';

/**
 * Enemy affixes (B12 escalation). Elites and later acts draw from this pool;
 * Sacrifice nodes can make one permanent for the run as a curse.
 * "The world becomes unfair because the player is becoming unfair."
 */
export const AFFIXES: AffixDef[] = [
  { id: 'warded_rooks', name: 'Warded Rooks', description: 'Enemy Rooks start with 1 Ward.', enemyWards: { pieceType: 'rook', count: 1 } },
  { id: 'iron_cavalry', name: 'Iron Cavalry', description: 'Enemy Knights start with 1 Ward.', enemyWards: { pieceType: 'knight', count: 1 } },
  { id: 'zealots', name: 'Zealots', description: 'Enemy Bishops start with 1 Ward.', enemyWards: { pieceType: 'bishop', count: 1 } },
  { id: 'iron_crown', name: 'Iron Crown', description: 'The enemy King starts with 1 Ward.', enemyWards: { pieceType: 'king', count: 1 } },
  { id: 'hardened_targets', name: 'Hardened Targets', description: 'Marked targets start with 1 Ward.', enemyWards: { pieceType: 'targets', count: 1 } },
  { id: 'phalanx', name: 'Phalanx', description: 'Enemy Pawns adjacent to each other cannot be captured by Pawns.', phalanx: true },
  { id: 'reinforced', name: 'Reinforced', description: '+1 reinforcement wave (a Knight and a Bishop).', extraWave: true },
  { id: 'bulwark', name: 'Bulwark', description: 'Two extra enemy Pawns.', extraPawns: 2 },
  { id: 'vanguard', name: 'Vanguard', description: 'Enemy pieces start one rank closer.', vanguard: true },
  { id: 'hasty_promotion', name: 'Hasty Promotion', description: 'Enemy Pawns promote one rank earlier.', hastyPromotion: 1 },
];

/** Affixes that may be accepted as run-long curses. */
export const CURSE_POOL = ['warded_rooks', 'iron_cavalry', 'zealots', 'iron_crown', 'phalanx', 'bulwark', 'hasty_promotion'];
