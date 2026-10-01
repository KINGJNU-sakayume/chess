import type { PieceType } from '../../engine/core/pieces';

/**
 * Scripted events (B9): one screen, a few choices, each a clear trade-off.
 * Outcomes are data interpreted by the run reducer; randomness uses the
 * seeded `events` stream.
 */
export type EventOutcome =
  | { type: 'gold'; amount: number }
  | { type: 'crown'; amount: number }
  | { type: 'addPieces'; pieces: PieceType[] }
  | { type: 'removePiece'; pieceType: PieceType | 'any' }
  | { type: 'offer'; pool: 'standard' | 'rarePlus' | 'mutation' }
  | { type: 'randomUpgrade'; tag: string }
  | { type: 'curse' }
  | { type: 'gamble'; chance: number; win: EventOutcome[]; lose: EventOutcome[] };

export interface EventChoice {
  label: string;
  detail: string;
  requires?: { gold?: number; crownsBelowMax?: boolean; pieceType?: PieceType };
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  acts: number[];
  choices: EventChoice[];
}

const leave: EventChoice = { label: 'Leave', detail: 'Nothing happens.', outcomes: [] };

export const EVENTS: EventDef[] = [
  {
    id: 'wandering_monk',
    title: 'The Wandering Monk',
    text: 'A monk in a tall mitre walks the diagonals of a ruined chapel floor, never once stepping on a dark square.',
    acts: [1, 2, 3],
    choices: [
      { label: 'Pay 25 gold', detail: 'A Bishop joins your roster.', requires: { gold: 25 }, outcomes: [{ type: 'gold', amount: -25 }, { type: 'addPieces', pieces: ['bishop'] }] },
      { label: 'Ask for a blessing', detail: 'Gain a random Bishop upgrade.', outcomes: [{ type: 'randomUpgrade', tag: 'bishop' }] },
      leave,
    ],
  },
  {
    id: 'deserters',
    title: 'Deserters at the Gate',
    text: 'Three hungry pawns from a fallen kingdom ask to march under your banner.',
    acts: [1, 2, 3],
    choices: [
      { label: 'Take them in', detail: 'Add 2 Pawns to your roster.', outcomes: [{ type: 'addPieces', pieces: ['pawn', 'pawn'] }] },
      { label: 'Take their purses', detail: '+20 gold.', outcomes: [{ type: 'gold', amount: 20 }] },
      leave,
    ],
  },
  {
    id: 'cursed_shrine',
    title: 'The Cursed Shrine',
    text: 'Black candles. A board carved from bone. Power, for a price the enemy will collect.',
    acts: [1, 2, 3],
    choices: [
      { label: 'Kneel', detail: 'Accept a curse (a permanent enemy affix), then choose 1 of 3 Rare upgrades.', outcomes: [{ type: 'curse' }, { type: 'offer', pool: 'rarePlus' }] },
      leave,
    ],
  },
  {
    id: 'royal_physician',
    title: 'The Royal Physician',
    text: '"Your crown is cracked, majesty. I can mend it — for a fee."',
    acts: [1, 2, 3],
    choices: [
      { label: 'Pay 40 gold', detail: 'Restore 1 Crown.', requires: { gold: 40, crownsBelowMax: true }, outcomes: [{ type: 'gold', amount: -40 }, { type: 'crown', amount: 1 }] },
      { label: 'Ask about tactics instead', detail: 'Choose 1 of 3 upgrades.', outcomes: [{ type: 'offer', pool: 'standard' }] },
      leave,
    ],
  },
  {
    id: 'old_battlefield',
    title: 'The Old Battlefield',
    text: 'Broken pieces everywhere. Something valuable might still be buried here.',
    acts: [1, 2, 3],
    choices: [
      {
        label: 'Search the ruins',
        detail: '60%: +35 gold. 40%: a Pawn is lost in the rubble.',
        outcomes: [{ type: 'gamble', chance: 0.6, win: [{ type: 'gold', amount: 35 }], lose: [{ type: 'removePiece', pieceType: 'pawn' }] }],
      },
      { label: 'Study the terrain', detail: 'Choose 1 of 3 board mutations.', outcomes: [{ type: 'offer', pool: 'mutation' }] },
      leave,
    ],
  },
  {
    id: 'knight_errant',
    title: 'Knight Errant',
    text: 'A lone rider blocks the road. "I serve whoever pays — or whoever impresses me."',
    acts: [1, 2, 3],
    choices: [
      { label: 'Pay 25 gold', detail: 'A Knight joins your roster.', requires: { gold: 25 }, outcomes: [{ type: 'gold', amount: -25 }, { type: 'addPieces', pieces: ['knight'] }] },
      { label: 'Learn the leaps', detail: 'Gain a random Knight upgrade.', outcomes: [{ type: 'randomUpgrade', tag: 'knight' }] },
      leave,
    ],
  },
  {
    id: 'gamblers_table',
    title: "The Gambler's Table",
    text: 'Two dice and a smile. "Double or nothing, your majesty?"',
    acts: [1, 2, 3],
    choices: [
      {
        label: 'Bet 20 gold',
        detail: '50%: win 45 gold. 50%: lose the bet.',
        requires: { gold: 20 },
        outcomes: [{ type: 'gold', amount: -20 }, { type: 'gamble', chance: 0.5, win: [{ type: 'gold', amount: 45 }], lose: [] }],
      },
      leave,
    ],
  },
  {
    id: 'architects_plans',
    title: "The Architect's Plans",
    text: 'Blueprints for a battlefield that favours you, drawn in an unfamiliar hand.',
    acts: [1, 2, 3],
    choices: [
      { label: 'Study the plans', detail: 'Choose 1 of 3 board mutations.', outcomes: [{ type: 'offer', pool: 'mutation' }] },
      { label: 'Sell them', detail: '+25 gold.', outcomes: [{ type: 'gold', amount: 25 }] },
    ],
  },
  {
    id: 'tower_garrison',
    title: 'The Tower Garrison',
    text: 'An abandoned rook-tower still flies your colours. Its keeper offers what remains.',
    acts: [2, 3],
    choices: [
      { label: 'Recruit the keeper', detail: 'A Rook joins your roster; lose 1 Pawn to staff the tower.', outcomes: [{ type: 'addPieces', pieces: ['rook'] }, { type: 'removePiece', pieceType: 'pawn' }] },
      { label: 'Take the armoury', detail: 'Gain a random Rook upgrade.', outcomes: [{ type: 'randomUpgrade', tag: 'rook' }] },
      leave,
    ],
  },
];
