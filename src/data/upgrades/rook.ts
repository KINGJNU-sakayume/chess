import type { UpgradeDef } from '../../engine/rules/types';

/** C4 — Rook upgrades. */
export const ROOK_UPGRADES: UpgradeDef[] = [
  {
    id: 'rook_heavy_formation',
    name: 'Heavy Formation',
    rarity: 'common',
    category: 'piece',
    tags: ['rook', 'roster'],
    stackable: true,
    prerequisites: [],
    primitives: ['ROSTER'],
    affects: ['rook'],
    roster: [{ type: 'ADD_PIECE', pieceType: 'rook', count: 1 }],
    describe: () => 'Add 1 Rook to your roster.',
    stackText: '+1 Rook per stack.',
  },
  {
    id: 'rook_open_file',
    name: 'Open File',
    rarity: 'common',
    category: 'piece',
    tags: ['rook', 'movement'],
    stackable: true,
    prerequisites: [],
    primitives: ['PIERCE'],
    affects: ['rook'],
    maxUsefulStacks: 2,
    moveModifiers: [
      {
        pieceType: 'rook',
        when: { onPawnlessFile: true },
        // Stack 1: one allied piece; stack 2+: any number (encoded as a very large budget).
        add: { type: 'PIERCE', count: { base: -98, perStack: 99, min: 1 }, owner: 'ally', axis: 'file' },
      },
    ],
    describe: (s) => `A Rook on a file with no Pawns may slide through ${s > 1 ? 'any number of allied pieces' : '1 allied piece'} along that file.`,
    stackText: 'Stack 2+: any number of allied pieces.',
  },
  {
    id: 'rook_battery',
    name: 'Rook Battery',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['rook', 'capture', 'extra_action'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['rook'],
    hooks: [{ event: 'onCapture', condition: { actorType: 'rook', actorSide: 'player' }, effects: [{ type: 'CUSTOM', name: 'rookBattery' }] }],
    describe: (s) =>
      `When a Rook captures while aligned with another allied Rook (nothing between), the other Rook gains ${s} extra action${s > 1 ? 's' : ''}.`,
    stackText: '+1 extra action per stack.',
  },
  {
    id: 'rook_siege_engine',
    name: 'Siege Engine',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['rook', 'capture'],
    stackable: true,
    prerequisites: [],
    primitives: ['STATUS'],
    affects: ['rook'],
    maxUsefulStacks: 2,
    counters: [],
    hooks: [
      { event: 'onTurnEnd', effects: [{ type: 'CUSTOM', name: 'siegeTrack' }] },
      { event: 'onTurnStart', priority: -1, effects: [{ type: 'CUSTOM', name: 'siegeFire' }] },
    ],
    describe: (s) =>
      s >= 2
        ? 'If a Rook ends your turn attacking an enemy piece, it captures that piece at the start of your next turn (if it still attacks it).'
        : 'If a Rook ends 2 consecutive turns attacking the same enemy piece, it captures that piece at the start of your next turn (if it still attacks it).',
    stackText: 'Requires 1 fewer turn per stack (minimum 1).',
  },
  {
    id: 'rook_castle_doctrine',
    name: 'Castle Doctrine',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['rook', 'king', 'defense'],
    stackable: false,
    prerequisites: [],
    primitives: ['EXTRA_ACTION', 'WARD'],
    affects: ['rook', 'king'],
    moveModifiers: [{ pieceType: 'king', add: { type: 'FREE_CASTLE' } }],
    hooks: [{ event: 'onCastle', condition: { actorSide: 'player' }, effects: [{ type: 'ADD_WARD', target: 'target', count: 1 }] }],
    describe: () => 'Castling is a free action, and the castling Rook gains 1 Ward.',
  },
];
