import type { Rng } from '../rng/rng';
import { cardById } from '../augments/cards';
import { addUndos, gainLife, makeEnemy, offerCards } from './rolls';
import type { RunState } from './types';

/**
 * Map events ("?" nodes). A choice changes the run and returns the text shown
 * afterwards; it may also open a card reward or start a battle by switching
 * the run's phase.
 */
export interface EventChoice {
  label: string;
  /** Null if the choice is available, else why not. */
  blocked?: (run: RunState) => string | null;
  /** The choice needs an owned active card (forging). */
  needsActive?: boolean;
  apply: (run: RunState, rng: Rng, card?: string) => string;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  choices: EventChoice[];
}

const needGold = (n: number) => (run: RunState) => (run.gold >= n ? null : `골드가 ${n} 필요합니다`);
const hasActive = (run: RunState) => run.augments.some((a) => cardById(a.id).kind === 'active');

export const EVENTS: readonly EventDef[] = [
  {
    id: 'merchant',
    title: '떠돌이 상인',
    icon: 'coin',
    text: '보따리를 짊어진 상인이 길을 막아섭니다. "골드만 있으면 귀한 물건을 보여 드리지요."',
    choices: [
      {
        label: '골드 60을 내고 골드 등급 증강 3장 중 하나를 고른다',
        blocked: needGold(60),
        apply: (run, rng) => {
          run.gold -= 60;
          run.reward = { title: '상인의 물건', cards: offerCards(run, rng, [0, 100, 0]), gold: 0 };
          run.phase = 'reward';
          return '상인이 보따리를 풀었습니다.';
        },
      },
      { label: '그냥 지나친다', apply: () => '상인은 어깨를 으쓱하고 사라졌습니다.' },
    ],
  },
  {
    id: 'altar',
    title: '피의 제단',
    icon: 'flame',
    text: '검붉은 제단이 희생을 요구합니다. 무언가를 바치는 자에게는 강력한 힘이 내려진다고 합니다.',
    choices: [
      {
        label: '목숨 1을 바치고 프리즘 증강 3장 중 하나를 고른다',
        blocked: (run) => (run.lives >= 2 ? null : '목숨이 2 이상 있어야 합니다'),
        apply: (run, rng) => {
          run.lives -= 1;
          run.reward = { title: '제단의 선물', cards: offerCards(run, rng, [0, 0, 100]), gold: 0 };
          run.phase = 'reward';
          return '제단이 피를 받아들였습니다.';
        },
      },
      { label: '떠난다', apply: () => '불길한 기운을 뒤로하고 길을 떠났습니다.' },
    ],
  },
  {
    id: 'battlefield',
    title: '옛 전장',
    icon: 'crosshair',
    text: '오래전 큰 대국이 벌어졌던 전장입니다. 쓰러진 기물들 사이에 쓸 만한 것이 남아 있습니다.',
    choices: [
      {
        label: '실버 등급 증강 3장 중 하나를 고른다',
        apply: (run, rng) => {
          run.reward = { title: '전장의 유물', cards: offerCards(run, rng, [100, 0, 0]), gold: 0 };
          run.phase = 'reward';
          return '전장을 뒤졌습니다.';
        },
      },
      {
        label: '흩어진 골드 50을 줍는다',
        apply: (run) => {
          run.gold += 50;
          return '골드 50을 주웠습니다.';
        },
      },
    ],
  },
  {
    id: 'gambler',
    title: '도박사',
    icon: 'coin',
    text: '"동전 한 번에 운명이 바뀌는 법이지." 도박사가 동전을 튕기며 웃습니다.',
    choices: [
      {
        label: '골드 40을 건다 (이기면 100을 받는다)',
        blocked: needGold(40),
        apply: (run, rng) => {
          if (rng.chance(0.5)) {
            run.gold += 60;
            return '앞면! 골드 100을 받았습니다.';
          }
          run.gold -= 40;
          return '뒷면… 골드 40을 잃었습니다.';
        },
      },
      { label: '거절한다', apply: () => '도박사는 아쉬운 듯 동전을 주머니에 넣었습니다.' },
    ],
  },
  {
    id: 'smith',
    title: '대장장이',
    icon: 'king-sword',
    text: '떠돌이 대장장이가 화로를 피워 놓았습니다. "무엇이든 한 번 더 쓸 수 있게 손봐 드리지."',
    choices: [
      {
        label: '액티브 증강 하나를 연마한다 (대국마다 사용 +1회)',
        blocked: (run) => (hasActive(run) ? null : '액티브 증강이 없습니다'),
        needsActive: true,
        apply: (run, _rng, card) => {
          const a = run.augments.find((x) => x.id === card);
          if (!a) return '아무것도 맡기지 않았습니다.';
          a.bonus += 1;
          return `「${cardById(a.id).name}」을(를) 연마했습니다. 이제 대국마다 한 번 더 쓸 수 있습니다.`;
        },
      },
      {
        label: '무르기 2회를 얻는다',
        apply: (run) => {
          addUndos(run, 2);
          return '대장장이가 손때 묻은 모래시계를 건넸습니다. 무르기 +2.';
        },
      },
    ],
  },
  {
    id: 'ambush',
    title: '매복',
    icon: 'mine',
    text: '길목에 적이 숨어 있었습니다! 맞서 싸워 이기면 두 배의 골드를 챙길 수 있습니다.',
    choices: [
      {
        label: '맞서 싸운다 (정예급 상대, 승리 시 골드 2배)',
        apply: (run, rng) => {
          run.enemy = { ...makeEnemy(run, rng, 'elite', 4), goldMul: 2 };
          run.attempts = 0;
          run.phase = 'prebattle';
          return '적이 모습을 드러냈습니다!';
        },
      },
      {
        label: '골드 30을 던져 주고 피한다',
        blocked: needGold(30),
        apply: (run) => {
          run.gold -= 30;
          return '골드를 던져 주고 무사히 빠져나왔습니다.';
        },
      },
    ],
  },
  {
    id: 'shrine',
    title: '고요한 사당',
    icon: 'halo',
    text: '바람 한 점 없는 사당입니다. 잠시 쉬어 갈 수 있을 것 같습니다.',
    choices: [
      {
        label: '기도한다 (목숨 +1)',
        blocked: (run) => (run.lives < run.maxLives ? null : '목숨이 이미 가득합니다'),
        apply: (run) => {
          gainLife(run, 1);
          return '따스한 기운이 감돕니다. 목숨 +1.';
        },
      },
      {
        label: '명상한다 (무르기 +3)',
        apply: (run) => {
          addUndos(run, 3);
          return '마음이 차분해졌습니다. 무르기 +3.';
        },
      },
    ],
  },
  {
    id: 'cursed_crown',
    title: '저주받은 왕관',
    icon: 'crown-up',
    text: '길가에 빛나는 왕관이 버려져 있습니다. 쓰면 힘이 솟지만, 그 빛을 쫓아 더 강한 적이 찾아온다고 합니다.',
    choices: [
      {
        label: '왕관을 쓴다 (최대 목숨 +1, 다음 일반·정예 상대의 AI가 한 단계 강해짐)',
        apply: (run) => {
          run.maxLives += 1;
          run.lives += 1;
          run.nextEnemyBonus = 1;
          return '왕관이 머리에 꼭 맞습니다. 어디선가 시선이 느껴집니다.';
        },
      },
      { label: '내버려 둔다', apply: () => '왕관을 그대로 두고 떠났습니다.' },
    ],
  },
  {
    id: 'scholar',
    title: '떠돌이 학자',
    icon: 'scroll',
    text: '학자가 낡은 기보를 펼쳐 보입니다. "수읽기를 배우겠나, 아니면 비기를 배우겠나?"',
    choices: [
      {
        label: '수읽기를 배운다 (무르기 +2, 골드 +20)',
        apply: (run) => {
          addUndos(run, 2);
          run.gold += 20;
          return '기보를 함께 복기했습니다. 무르기 +2, 골드 +20.';
        },
      },
      {
        label: '비기를 배운다 (골드 30을 내고 골드 등급 증강 3장 중 하나)',
        blocked: needGold(30),
        apply: (run, rng) => {
          run.gold -= 30;
          run.reward = { title: '학자의 비기', cards: offerCards(run, rng, [0, 100, 0]), gold: 0 };
          run.phase = 'reward';
          return '학자가 비기를 펼쳐 보였습니다.';
        },
      },
    ],
  },
];

export function eventById(id: string): EventDef {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event: ${id}`);
  return e;
}
