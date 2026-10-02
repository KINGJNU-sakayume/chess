/**
 * A roguelike run: three acts of branching maps (Slay the Spire style).
 * Augments are kept for the whole run and brought into every game; after a
 * win you pick one of three more. Losing a game costs a life.
 */
export type Difficulty = 0 | 1 | 2;
export const DIFFICULTY_NAME: Readonly<Record<Difficulty, string>> = { 0: '쉬움', 1: '보통', 2: '어려움' };

export type NodeType = 'battle' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'boss';

export const NODE_NAME: Readonly<Record<NodeType, string>> = {
  battle: '대국',
  elite: '정예',
  event: '이벤트',
  shop: '상점',
  rest: '휴식처',
  treasure: '보물',
  boss: '보스',
};

export interface MapNode {
  id: string;
  /** 0 = first floor. */
  row: number;
  col: number;
  type: NodeType;
  next: string[];
}

export interface ActMap {
  act: number;
  rows: number;
  cols: number;
  nodes: Record<string, MapNode>;
  /** Nodes on the first floor. */
  starts: string[];
  bossId: string;
  /** Boss definition id. */
  boss: string;
}

export interface RunAugment {
  id: string;
  /** Extra uses per game (active cards forged at rest sites). */
  bonus: number;
}

export type EnemyKind = 'battle' | 'elite' | 'boss';

export interface EnemyDef {
  name: string;
  kind: EnemyKind;
  /** AI level 1..5. */
  level: number;
  augments: string[];
  blurb: string;
  /** Archetype or boss id (portrait). */
  look: string;
  /** Gold multiplier on victory (ambushes). */
  goldMul?: number;
}

export type RunPhase = 'start' | 'map' | 'prebattle' | 'battle' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'victory' | 'defeat';

export interface RewardOffer {
  title: string;
  cards: string[];
  gold: number;
}

export interface ShopItem {
  kind: 'card' | 'heal' | 'undo';
  card?: string;
  price: number;
  sold: boolean;
}

export interface EventState {
  id: string;
  /** Outcome text once a choice was made. */
  result: string | null;
}

export interface RunStats {
  wins: number;
  losses: number;
  draws: number;
  elites: number;
  bosses: number;
  floors: number;
}

export interface RunNotice {
  tone: 'good' | 'bad' | 'info';
  text: string;
}

export interface RunState {
  version: 1;
  seed: string;
  difficulty: Difficulty;
  act: number;
  map: ActMap;
  /** Node the player stands on (null before the first floor of an act). */
  current: string | null;
  visited: string[];
  lives: number;
  maxLives: number;
  gold: number;
  undos: number;
  augments: RunAugment[];
  phase: RunPhase;
  enemy: EnemyDef | null;
  /** Seed of the current battle (changes on retries). */
  battleSeed: string | null;
  attempts: number;
  reward: RewardOffer | null;
  shop: ShopItem[] | null;
  event: EventState | null;
  seenEvents: string[];
  /** One-shot modifiers: the next enemy is this many levels stronger. */
  nextEnemyBonus: number;
  notice: RunNotice | null;
  stats: RunStats;
  /** Increments whenever randomness is drawn, so every roll has its own label. */
  counter: number;
}

export type BattleOutcome = 'win' | 'loss' | 'draw';

export type RunAction =
  | { type: 'start-pick'; card: string | null }
  | { type: 'enter'; node: string }
  | { type: 'begin-battle' }
  | { type: 'battle-end'; outcome: BattleOutcome; undos: number }
  | { type: 'take-reward'; card: string | null }
  | { type: 'buy'; index: number }
  | { type: 'leave' }
  | { type: 'rest'; choice: 'heal' | 'forge'; card?: string }
  | { type: 'event'; choice: number; card?: string }
  | { type: 'spend-undo' };
