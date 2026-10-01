import type { UpgradeDef } from '../../engine/rules/types';

/** C2 — Bishop upgrades. Bishops must support a full-run build on their own. */
export const BISHOP_UPGRADES: UpgradeDef[] = [
  {
    id: 'bishop_ordination',
    name: 'Ordination',
    rarity: 'common',
    category: 'piece',
    tags: ['bishop', 'roster'],
    stackable: true,
    prerequisites: [],
    primitives: ['ROSTER'],
    affects: ['bishop'],
    roster: [{ type: 'ADD_PIECE', pieceType: 'bishop', count: 1 }],
    describe: () => 'Add 1 Bishop to your roster.',
    stackText: '+1 Bishop per stack.',
  },
  {
    id: 'bishop_long_cathedral',
    name: 'Long Cathedral',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['bishop', 'extra_action'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['bishop'],
    maxUsefulStacks: 3,
    hooks: [
      {
        event: 'onPieceMove',
        condition: { actorType: 'bishop', actorSide: 'player', free: false, minDistance: { base: 5, perStack: -1, min: 2 } },
        // D4 loop safety: two Bishops could otherwise hand actions back and forth forever.
        limit: { per: 'pieceTurn' },
        effects: [{ type: 'GRANT_ACTION', count: 1, restriction: { pieceTypes: ['bishop'], excludeActor: true }, label: 'a different Bishop' }],
      },
    ],
    describe: (s) =>
      `A Bishop move of ${Math.max(2, 5 - s)}+ squares grants 1 extra action usable only by a different Bishop (once per Bishop per turn).`,
    stackText: 'Distance threshold −1 per stack (minimum 2).',
  },
  {
    id: 'bishop_consecrated_diagonal',
    name: 'Consecrated Diagonal',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['bishop', 'board', 'enemy_debuff'],
    stackable: true,
    prerequisites: [],
    primitives: ['MARK_SQUARE'],
    affects: ['bishop'],
    hooks: [
      {
        event: 'onPieceMove',
        condition: { actorType: 'bishop', actorSide: 'player', free: false, minDistance: 4 },
        effects: [{ type: 'MARK_PATH', mark: 'CONSECRATED', until: { at: 'turnEnd', turnOffset: 'stacks' } }],
      },
    ],
    describe: (s) =>
      `After a Bishop moves 4+ squares, the squares it crossed become Consecrated until ${s > 1 ? `${s} turns from now` : 'your next turn ends'}. Enemy intents whose destination is Consecrated fizzle.`,
    stackText: '+1 turn duration per stack.',
  },
  {
    id: 'bishop_twin',
    name: 'Twin Bishops',
    rarity: 'common',
    category: 'piece',
    tags: ['bishop', 'defense'],
    stackable: true,
    prerequisites: [],
    primitives: ['WARD'],
    affects: ['bishop'],
    hooks: [{ event: 'onEncounterStart', effects: [{ type: 'CUSTOM', name: 'twinBishops' }] }],
    describe: (s) => `If you have Bishops on both square colours, each Bishop starts encounters with ${s} Ward${s > 1 ? 's' : ''}.`,
    stackText: '+1 Ward per stack.',
  },
  {
    id: 'bishop_battery',
    name: 'Bishop Battery',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['bishop', 'capture', 'extra_action'],
    stackable: true,
    prerequisites: [],
    primitives: ['EXTRA_ACTION'],
    affects: ['bishop'],
    hooks: [
      {
        event: 'onCapture',
        condition: { actorType: 'bishop', actorSide: 'player', custom: 'targetAttackedByOtherBishop' },
        effects: (s) =>
          s <= 1
            ? [{ type: 'GRANT_ACTION', count: 1, restriction: { pieceTypes: ['bishop'] }, label: 'Bishop' }]
            : [{ type: 'GRANT_ACTION', count: s - 1, label: 'any piece' }],
      },
    ],
    describe: (s) =>
      s <= 1
        ? 'When a Bishop captures a piece that another allied Bishop also attacked, gain 1 Bishop-only extra action.'
        : `When a Bishop captures a piece that another allied Bishop also attacked, gain ${s - 1} unrestricted extra action${s > 2 ? 's' : ''}.`,
    stackText: 'Stack 2+: the extra action is unrestricted, +1 per further stack.',
  },
  {
    id: 'bishop_recall',
    name: 'Bishop Recall',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['bishop', 'capture'],
    stackable: false,
    prerequisites: [],
    primitives: ['REPOSITION'],
    affects: ['bishop'],
    describe: () => 'After a Bishop captures, it may return to its origin square for free (once per Bishop per turn).',
  },
  {
    id: 'bishop_crusade',
    name: 'Crusade',
    rarity: 'uncommon',
    category: 'piece',
    tags: ['bishop', 'capture'],
    stackable: true,
    prerequisites: [],
    primitives: ['MOVE_PATTERN', 'PIERCE'],
    affects: ['bishop'],
    counters: [{ id: 'zeal', label: 'Zeal', thresholds: [3, 6] }],
    hooks: [
      {
        event: 'onCapture',
        condition: { actorType: 'bishop', actorSide: 'player' },
        effects: [{ type: 'ADD_COUNTER', counter: 'zeal', amount: 'stacks', label: 'Zeal' }],
      },
    ],
    moveModifiers: [
      { pieceType: 'bishop', when: { counterAtLeast: ['zeal', 3] }, add: { type: 'MOVE_PATTERN', vectors: 'orthogonal', range: 1 } },
      { pieceType: 'bishop', when: { counterAtLeast: ['zeal', 6] }, add: { type: 'PIERCE', count: 1, owner: 'enemy' } },
    ],
    describe: (s) =>
      `Each Bishop capture gives +${s} Zeal this encounter. At 3 Zeal, Bishops may also move 1 square orthogonally. At 6 Zeal, Bishops pierce 1 enemy piece.`,
    stackText: '+1 Zeal per capture per stack.',
  },
  {
    id: 'bishop_piercing',
    name: 'Piercing Bishop',
    rarity: 'rare',
    category: 'piece',
    tags: ['bishop', 'movement'],
    stackable: true,
    prerequisites: [{ tag: 'bishop', count: 2 }],
    primitives: ['PIERCE'],
    affects: ['bishop'],
    moveModifiers: [{ pieceType: 'bishop', add: { type: 'PIERCE', count: 'stacks', owner: 'enemy' } }],
    describe: (s) => `Bishops may pass through ${s} enemy piece${s > 1 ? 's' : ''} per move (only the final square is captured).`,
    stackText: '+1 piece per stack.',
  },
  {
    id: 'bishop_diagonal_dominion',
    name: 'Diagonal Dominion',
    rarity: 'rare',
    category: 'piece',
    tags: ['bishop', 'board', 'enemy_debuff'],
    stackable: true,
    prerequisites: [{ tag: 'bishop', count: 3 }],
    primitives: ['MARK_SQUARE', 'STATUS'],
    affects: ['bishop'],
    maxUsefulStacks: 2,
    hooks: [{ event: 'onTurnEnd', effects: [{ type: 'CUSTOM', name: 'diagonalDominion' }] }],
    describe: (s) =>
      `At the end of your turn, every empty square attacked by 2+ allied Bishops${s > 1 ? ' (or by any Bishop standing on a Bishop Altar)' : ''} becomes Crimson until your next turn.`,
    stackText: 'Stack 2+: squares attacked by 1+ Bishops on Altars also qualify.',
  },
];
