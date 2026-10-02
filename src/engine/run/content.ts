import type { Difficulty, EnemyKind } from './types';

/**
 * Run tuning and content: AI levels, enemy archetypes, bosses, rewards,
 * prices. Everything a designer would tweak lives here.
 */

export const START_LIVES = 3;
export const MAX_LIVES = 3;
export const START_GOLD = 60;
export const START_UNDOS = 3;
export const ACTS = 3;

/** AI level by enemy kind and act on Normal; Easy is one lower, Hard one higher (clamped 1..5). */
const LEVELS: Record<EnemyKind, [number, number, number]> = {
  battle: [1, 2, 3],
  elite: [2, 3, 4],
  boss: [2, 3, 4],
};

export function enemyLevel(kind: EnemyKind, act: number, difficulty: Difficulty, bonus = 0): number {
  return Math.max(1, Math.min(5, LEVELS[kind][Math.min(3, act) - 1] + (difficulty - 1) + bonus));
}

/**
 * How many random augments an enemy brings. The player keeps every augment it
 * wins, so enemies must grow faster than linearly to keep later acts tense.
 */
export function battleAugments(act: number, row: number): number {
  return [0, 2, 4][act - 1] + (row >= 4 ? 1 : 0);
}
export const eliteAugments = (act: number): number => [2, 4, 6][act - 1];
/** Random augments a boss carries on top of its signature set. */
export const bossExtraAugments = (act: number): number => [0, 2, 4][act - 1];

/** Tiers an enemy's random augments may come from. */
export function enemyTiers(kind: EnemyKind, act: number): number[] {
  if (kind === 'battle') return act === 1 ? [0] : act === 2 ? [0, 1] : [1, 2];
  return act === 1 ? [0, 1] : act === 2 ? [0, 1, 2] : [1, 2];
}

export interface Archetype {
  id: string;
  /** Names for acts 1..3. */
  names: [string, string, string];
  blurb: string;
  cards: string[];
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'knights',
    names: ['떠돌이 기사', '용병 기사단', '흑기사 대장'],
    blurb: '나이트를 앞세워 파고드는 상대입니다.',
    cards: ['camel_knight', 'knight_oath', 'conscript', 'vanguard', 'mercenary_rook'],
  },
  {
    id: 'clergy',
    names: ['순례자', '수도원장', '이단 심문관'],
    blurb: '비숍을 강화하고 쓰러진 기물을 되살립니다.',
    cards: ['bishop_step', 'ordain', 'resurrect', 'shield', 'revival', 'cavalry_order'],
  },
  {
    id: 'wall',
    names: ['성문 수비대', '요새 공병', '철벽 수문장'],
    blurb: '보호막과 바리케이드로 버팁니다.',
    cards: ['barricade', 'shield', 'royal_aegis', 'royal_guard', 'thorns', 'mercenary_rook', 'divine_aegis'],
  },
  {
    id: 'pawns',
    names: ['농민 반란군', '민병대장', '돌격 보병대'],
    blurb: '폰을 밀어붙여 승진을 노립니다.',
    cards: ['pawn_charge', 'pawn_pike', 'pawn_sidestep', 'pawn_grit', 'knighting', 'martyr_pawns', 'early_promotion', 'reinforce', 'coronation'],
  },
  {
    id: 'duelist',
    names: ['결투가', '검투사', '전쟁광'],
    blurb: '킹까지 앞세우는 공격적인 상대입니다.',
    cards: ['warrior_king', 'rook_step', 'sniper', 'shield_breaker', 'appoint', 'demote', 'freeze', 'amazon'],
  },
  {
    id: 'trickster',
    names: ['함정꾼', '첩자', '암살자'],
    blurb: '함정과 동결로 허를 찌릅니다.',
    cards: ['minefield', 'freeze', 'sniper', 'barricade', 'demote', 'three_check', 'ice_age'],
  },
];

export interface BossDef {
  id: string;
  name: string;
  blurb: string;
  cards: string[];
}

export const BOSSES: Readonly<Record<number, BossDef[]>> = {
  1: [
    {
      id: 'fortress_lord',
      name: '성채의 군주',
      blurb: '왕관의 가호와 근위대에 둘러싸여 바리케이드 뒤에 숨어 있습니다. 보호막을 하나씩 벗겨 내야 합니다.',
      cards: ['royal_aegis', 'royal_guard', 'barricade'],
    },
    {
      id: 'knight_captain',
      name: '기병대장',
      blurb: '낙타처럼 도약하는 기병대가 맹세의 보호막을 두르고 몰려옵니다. (3,1) 도약에 주의하세요.',
      cards: ['camel_knight', 'knight_oath', 'vanguard'],
    },
  ],
  2: [
    {
      id: 'tyrant_queen',
      name: '폭군 여왕',
      blurb: '나이트처럼도 뛰는 아마존 여왕과 두 칸씩 걷는 전사왕. 얼음 마법으로 수비수를 묶습니다.',
      cards: ['amazon', 'warrior_king', 'freeze', 'sniper'],
    },
    {
      id: 'red_archbishop',
      name: '붉은 대주교',
      blurb: '모든 비숍이 대주교로 승격하고, 쓰러진 기물을 되살립니다.',
      cards: ['cavalry_order', 'bishop_step', 'resurrect', 'shield'],
    },
  ],
  3: [
    {
      id: 'pawn_emperor',
      name: '폰 황제',
      blurb: '잡으면 함께 쓰러지는 순교자 폰들이 돌진해 일찍 승진합니다.',
      cards: ['martyr_pawns', 'pawn_charge', 'pawn_pike', 'early_promotion', 'reinforce', 'royal_aegis'],
    },
    {
      id: 'hill_king',
      name: '언덕의 왕',
      blurb: '킹이 중앙 네 칸에 올라 한 턴을 버티면 승리합니다. 두 번째 여왕이 그 길을 열고, 왕관의 가호가 킹을 지킵니다.',
      cards: ['king_of_the_hill', 'warrior_king', 'royal_aegis', 'second_queen', 'freeze'],
    },
  ],
};

export function bossById(id: string): BossDef {
  for (const list of Object.values(BOSSES)) for (const b of list) if (b.id === id) return b;
  throw new Error(`Unknown boss: ${id}`);
}

/** Reward tier odds (silver, gold, prism) by node kind and act. */
export const REWARD_WEIGHTS: Record<'battle' | 'elite' | 'treasure', [number, number, number][]> = {
  battle: [
    [70, 27, 3],
    [50, 42, 8],
    [35, 48, 17],
  ],
  elite: [
    [0, 80, 20],
    [0, 70, 30],
    [0, 60, 40],
  ],
  treasure: [
    [0, 75, 25],
    [0, 65, 35],
    [0, 55, 45],
  ],
};

/** Gold for a win: [min, max] plus 5 per act after the first. */
export const GOLD_REWARD: Record<EnemyKind, [number, number]> = {
  battle: [15, 25],
  elite: [35, 45],
  boss: [90, 110],
};

export const PRICE = { silver: 50, gold: 90, prism: 150, heal: 70, undo: 30 } as const;
export const UNDOS_PER_PURCHASE = 2;
