import type { UpgradeDef } from '../../engine/rules/types';
import { SQUARE_INFO } from '../squares';

/**
 * C6 — Board mutations. Each acquisition places one more square (a pair for
 * Knight Gates, a whole rank or file for Rook Rails) that persists all run.
 */
const mutation = (
  id: string,
  name: string,
  square: UpgradeDef['mutation'] & string,
  rarity: UpgradeDef['rarity'],
  shape: 'single' | 'pair' | 'line',
  tags: string[],
  affects: UpgradeDef['affects'],
  primitives: UpgradeDef['primitives'],
): UpgradeDef => ({
  id,
  name,
  rarity,
  category: 'mutation',
  tags: ['board', ...tags],
  stackable: true,
  prerequisites: [],
  primitives: ['MARK_SQUARE', ...primitives],
  affects,
  mutation: square,
  choice: { kind: 'placeSquare', square, shape },
  describe: () => `Place a ${SQUARE_INFO[square].name}${shape === 'pair' ? ' pair' : shape === 'line' ? ' (a whole rank or file)' : ''}: ${SQUARE_INFO[square].text}`,
  stackText: 'Each stack places another one.',
});

export const BOARD_UPGRADES: UpgradeDef[] = [
  mutation('mut_crimson', 'Crimson Square', 'CRIMSON', 'uncommon', 'single', ['enemy_debuff'], [], ['STATUS']),
  mutation('mut_altar', 'Bishop Altar', 'BISHOP_ALTAR', 'common', 'single', ['bishop'], ['bishop'], ['WARD']),
  mutation('mut_gate', 'Knight Gate', 'KNIGHT_GATE', 'uncommon', 'pair', ['knight'], ['knight'], ['REPOSITION']),
  mutation('mut_rail', 'Rook Rail', 'ROOK_RAIL', 'common', 'line', ['rook'], ['rook'], ['PIERCE']),
  mutation('mut_promotion', 'Promotion Square', 'PROMOTION', 'uncommon', 'single', ['pawn', 'promotion'], ['pawn'], ['PROMOTION_RULE']),
  mutation('mut_royal', 'Royal Square', 'ROYAL', 'rare', 'single', ['king', 'queen', 'extra_action'], ['king', 'queen'], ['EXTRA_ACTION']),
  mutation('mut_cursed', 'Cursed Square', 'CURSED', 'uncommon', 'single', ['enemy_debuff'], [], ['RESTRICT_ENEMY']),
  mutation('mut_sanctuary', 'Sanctuary', 'SANCTUARY', 'common', 'single', ['defense'], [], ['WARD']),
];
