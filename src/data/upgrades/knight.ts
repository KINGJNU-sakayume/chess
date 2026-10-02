import type { UpgradeDef } from '../../engine/rules/types';

/** C3 — Knight upgrades. */
export const KNIGHT_UPGRADES: UpgradeDef[] = [
  {
    id: 'knight_cavalry',
    name: 'Cavalry',
    rarity: 'common',
    category: 'piece',
    tags: ['knight', 'roster'],
    stackable: true,
    prerequisites: [],
    primitives: ['ROSTER'],
    affects: ['knight'],
    roster: [{ type: 'ADD_PIECE', pieceType: 'knight', count: 1 }],
    describe: () => 'Add 1 Knight to your roster.',
    stackText: '+1 Knight per stack.',
  },
  {
    id: 'knight_fork_engine',
    name: 'Fork Engine',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['knight', 'extra_action'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['knight'],
    hooks: [
      {
        event: 'onFork',
        condition: { actorType: 'knight', actorSide: 'player' },
        limit: { per: 'turn', uses: 'stacks' },
        effects: [{ type: 'GRANT_ACTION', count: 1, restriction: { excludeTypes: ['knight'] }, label: 'a non-Knight piece' }],
      },
    ],
    describe: (s) =>
      `After a Knight move that attacks 2+ enemy pieces, gain 1 extra action for a non-Knight piece (${s > 1 ? `${s} times` : 'once'} per turn).`,
    stackText: '+1 use per turn per stack.',
  },
  {
    id: 'knight_momentum',
    name: 'Momentum Knight',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['knight', 'extra_action', 'movement'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['knight'],
    maxUsefulStacks: 2,
    hooks: [
      {
        event: 'onPieceMove',
        condition: { actorType: 'knight', actorSide: 'player', free: false, custom: 'movedLastTurn' },
        limit: { per: 'pieceTurn' },
        effects: (s) => [{ type: 'GRANT_ACTION', count: 1, restriction: { actorOnly: true, nonCapturing: s < 2 }, label: s < 2 ? 'same Knight, no capture' : 'same Knight' }],
      },
    ],
    describe: (s) =>
      `If the same Knight moved on your previous turn, after it moves it may make 1 free ${s < 2 ? 'non-capturing ' : ''}Knight move (once per Knight per turn).`,
    stackText: 'Stack 2: the follow-up may capture.',
  },
  {
    id: 'knight_landing_shock',
    name: 'Landing Shock',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['knight', 'enemy_debuff'],
    stackable: true,
    prerequisites: [],
    primitives: ['STATUS'],
    affects: ['knight'],
    hooks: [
      {
        event: 'onPieceLanded',
        condition: { actorType: 'knight', actorSide: 'player' },
        effects: [{ type: 'APPLY_STATUS', target: 'adjacentEnemiesOfActor', status: 'IMMOBILIZED', phases: 'stacks' }],
      },
    ],
    describe: (s) => `When a Knight lands, adjacent enemy pieces become Immobilized for their next ${s > 1 ? `${s} enemy phases` : 'enemy phase'}.`,
    stackText: '+1 phase duration per stack.',
  },
  {
    id: 'knight_royal_fork',
    name: 'Royal Fork',
    rarity: 'rare',
    category: 'piece',
    tags: ['knight', 'capture'],
    stackable: false,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['knight'],
    hooks: [
      {
        event: 'onFork',
        condition: { actorType: 'knight', actorSide: 'player', custom: 'forkIncludesKing' },
        effects: [{ type: 'CUSTOM', name: 'royalFork' }],
      },
    ],
    describe: () => 'If a Knight move attacks the enemy King and another piece, immediately capture the other piece (its most valuable).',
  },
];
