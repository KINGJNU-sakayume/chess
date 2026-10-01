import type { SquareType } from '../../engine/core/state';

/** Square types (B10) — names and rules text shown in tooltips. */
export const SQUARE_INFO: Record<SquareType, { name: string; text: string }> = {
  CRIMSON: { name: 'Crimson Square', text: 'An enemy piece that ends a move here becomes Immobilized for its next enemy phase.' },
  BISHOP_ALTAR: {
    name: 'Bishop Altar',
    text: 'An allied Bishop that crosses or lands here gains 1 Ward (once per Bishop per turn).',
  },
  KNIGHT_GATE: {
    name: 'Knight Gate',
    text: 'An allied Knight landing on a gate may immediately reposition to the linked gate if it is empty.',
  },
  ROOK_RAIL: { name: 'Rook Rail', text: 'An allied Rook moving along the rail may pierce 1 allied piece.' },
  PROMOTION: { name: 'Promotion Square', text: 'An allied Pawn entering it promotes immediately.' },
  ROYAL: {
    name: 'Royal Square',
    text: 'The first time each turn your King or Queen ends a move here, gain 1 extra action.',
  },
  CURSED: {
    name: 'Cursed Square',
    text: 'Enemy sliding pieces starting here have range limited to 2. Enemy Kings cannot enter it.',
  },
  SANCTUARY: {
    name: 'Sanctuary',
    text: 'An allied piece standing here at the start of an enemy phase gains 1 Ward until that phase ends.',
  },
  CONSECRATED: { name: 'Consecrated', text: 'Enemy intents whose destination is Consecrated fizzle.' },
  ENEMY_SANCTUARY: {
    name: 'Enemy Sanctuary',
    text: 'An enemy piece standing here at the start of your turn gains 1 Ward until your turn ends.',
  },
  PROFANE: { name: 'Profane Diagonal', text: 'Your pieces ending a move here lose all Wards.' },
};
