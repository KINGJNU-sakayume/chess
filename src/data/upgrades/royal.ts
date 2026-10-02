import type { UpgradeDef } from '../../engine/rules/types';

/** C5 — Queen and King upgrades. */
export const ROYAL_UPGRADES: UpgradeDef[] = [
  {
    id: 'queen_royal_momentum',
    name: 'Royal Momentum',
    rarity: 'rare',
    category: 'piece',
    tags: ['queen', 'extra_action', 'capture'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['queen'],
    hooks: [
      {
        event: 'onCapture',
        condition: { actorType: 'queen', actorSide: 'player' },
        limit: { per: 'turn', uses: { base: -1, perStack: 1, min: 1 } },
        effects: (s) => [{ type: 'GRANT_ACTION', count: 1, restriction: { actorOnly: true, nonCapturing: s < 2 }, label: s < 2 ? 'Queen, no capture' : 'Queen' }],
      },
    ],
    describe: (s) =>
      s < 2
        ? 'Once per turn, when the Queen captures, gain 1 non-capturing extra action for the Queen.'
        : `${s - 1 > 1 ? `${s - 1} times` : 'Once'} per turn, when the Queen captures, gain 1 extra action for the Queen (it may capture).`,
    stackText: 'Stack 2: may capture; +1 use per turn per further stack.',
  },
  {
    id: 'queen_tyrant',
    name: 'Tyrant Queen',
    rarity: 'rare',
    category: 'piece',
    tags: ['queen', 'extra_action'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['queen'],
    hooks: [{ event: 'onTurnStart', effects: [{ type: 'CUSTOM', name: 'tyrantQueen' }] }],
    describe: (s) =>
      `At turn start, if you have 1 or fewer other non-Pawn, non-King pieces on the board, the Queen gains ${s} extra action${s > 1 ? 's' : ''}.`,
    stackText: '+1 extra action per stack.',
  },
  {
    id: 'queen_gambit',
    name: "Queen's Gambit",
    rarity: 'uncommon',
    category: 'piece',
    tags: ['queen', 'sacrifice'],
    stackable: true,
    prerequisites: [],
    primitives: ['PIERCE'],
    affects: ['queen'],
    hooks: [
      {
        event: 'onPieceDestroyed',
        condition: { targetSide: 'player' },
        effects: [{ type: 'ADD_PIECE_COUNTER', target: 'allyQueens', counter: 'gambit', amount: 'stacks', label: 'the Queen gathers fury (pierce)' }],
      },
      { event: 'onPieceMove', condition: { actorType: 'queen', actorSide: 'player' }, priority: 5, effects: [{ type: 'CUSTOM', name: 'consumeGambit' }] },
    ],
    moveModifiers: [
      { pieceType: 'queen', when: { pieceCounterAtLeast: ['gambit', 1] }, add: { type: 'PIERCE', count: { pieceCounter: 'gambit' }, owner: 'any' } },
    ],
    describe: (s) => `When an allied piece is captured, the Queen's next move this encounter may pierce ${s} piece${s > 1 ? 's' : ''} (charges accumulate).`,
    stackText: '+1 pierce per stack.',
  },
  {
    id: 'king_war',
    name: 'War King',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['king', 'movement'],
    stackable: true,
    prerequisites: [],
    primitives: ['MOVE_PATTERN', 'WARD'],
    affects: ['king'],
    moveModifiers: [{ pieceType: 'king', add: { type: 'RANGE', vectors: 'all', range: { base: 1, perStack: 1 } } }],
    hooks: [{ event: 'onCapture', condition: { actorType: 'king', actorSide: 'player' }, effects: [{ type: 'ADD_WARD', target: 'actor', count: 1 }] }],
    describe: (s) => `The King may move up to ${1 + s} squares in a straight line. King captures grant the King 1 Ward.`,
    stackText: '+1 range per stack.',
  },
  {
    id: 'king_royal_guard',
    name: 'Royal Guard',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['king', 'defense'],
    stackable: true,
    prerequisites: [],
    primitives: ['WARD'],
    affects: ['king'],
    maxUsefulStacks: 2,
    hooks: [{ event: 'onEnemyPhaseStart', effects: [{ type: 'CUSTOM', name: 'royalGuard' }] }],
    describe: (s) => `Allied pieces within ${s > 1 ? '2 squares of' : '1 square of'} your King at the start of an enemy phase gain 1 Ward until the phase ends.`,
    stackText: 'Stack 2+: radius 2.',
  },
];
