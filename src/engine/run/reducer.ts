import { cardById } from '../augments/cards';
import { type Color } from '../game/types';
import type { MatchSetup } from '../match/match';
import {
  ACTS,
  GOLD_REWARD,
  MAX_LIVES,
  PRICE,
  REWARD_WEIGHTS,
  START_GOLD,
  START_LIVES,
  START_UNDOS,
  UNDOS_PER_PURCHASE,
} from './content';
import { EVENTS, eventById } from './events';
import { generateMap, reachable } from './map';
import { addAugment, addUndos, gainLife, makeEnemy, offerCards, ownsCard, rollRng } from './rolls';
import type { Difficulty, RunAction, RunState, ShopItem } from './types';

/**
 * The run as a pure reducer: every screen of the roguelike is a phase, and
 * every player decision an action. Battles themselves are ordinary matches
 * (see `battleSetup`); their outcome comes back as a `battle-end` action.
 */
export class RunError extends Error {}

export function createRun(seed: string, difficulty: Difficulty): RunState {
  const run: RunState = {
    version: 1,
    seed,
    difficulty,
    act: 1,
    map: generateMap(seed, 1),
    current: null,
    visited: [],
    lives: START_LIVES,
    maxLives: MAX_LIVES,
    gold: START_GOLD,
    undos: START_UNDOS,
    augments: [],
    phase: 'start',
    enemy: null,
    battleSeed: null,
    attempts: 0,
    reward: null,
    shop: null,
    event: null,
    seenEvents: [],
    nextEnemyBonus: 0,
    notice: null,
    stats: { wins: 0, losses: 0, draws: 0, elites: 0, bosses: 0, floors: 0 },
    counter: 0,
  };
  run.reward = { title: '출발 선물', cards: offerCards(run, rollRng(run, 'start'), [100, 0, 0]), gold: 0 };
  return run;
}

/** The match a battle is played as: the player is White, the enemy Black with its augments. */
export function battleSetup(run: RunState): MatchSetup {
  if (!run.enemy || !run.battleSeed) throw new RunError('no battle');
  const human: Color = 0;
  return {
    mode: 'ai',
    human,
    level: run.enemy.level,
    seed: run.battleSeed,
    drafts: false,
    loadout: [run.augments.map((a) => ({ id: a.id, bonus: a.bonus })), run.enemy.augments.map((id) => ({ id }))],
    names: [null, run.enemy.name],
    context: 'run',
  };
}

const clone = (run: RunState): RunState => JSON.parse(JSON.stringify(run)) as RunState;

export function runAction(prev: RunState, a: RunAction): RunState {
  const run = clone(prev);
  switch (a.type) {
    case 'start-pick': {
      expect(run, 'start');
      if (a.card && run.reward?.cards.includes(a.card)) addAugment(run, a.card);
      run.reward = null;
      run.phase = 'map';
      run.notice = { tone: 'info', text: '1막이 시작됩니다. 길을 골라 보스까지 올라가세요.' };
      break;
    }
    case 'enter':
      enter(run, a.node);
      break;
    case 'begin-battle': {
      expect(run, 'prebattle');
      run.battleSeed = `${run.seed}:battle:${run.counter++}`;
      run.phase = 'battle';
      run.notice = null;
      break;
    }
    case 'battle-end':
      battleEnd(run, a.outcome, a.undos);
      break;
    case 'take-reward': {
      if (run.phase !== 'reward' && run.phase !== 'treasure') throw new RunError('no reward open');
      if (a.card && run.reward?.cards.includes(a.card)) addAugment(run, a.card);
      run.reward = null;
      afterReward(run);
      break;
    }
    case 'buy':
      buy(run, a.index);
      break;
    case 'leave': {
      if (run.phase === 'event' && !run.event?.result) throw new RunError('choose first');
      if (run.phase !== 'shop' && run.phase !== 'event') throw new RunError('nothing to leave');
      run.shop = null;
      run.event = null;
      run.phase = 'map';
      break;
    }
    case 'rest': {
      expect(run, 'rest');
      if (a.choice === 'heal') {
        const full = run.lives >= run.maxLives;
        gainLife(run, 1);
        run.notice = { tone: 'good', text: full ? '푹 쉬었습니다.' : '푹 쉬었습니다. 목숨 +1.' };
      } else {
        const aug = run.augments.find((x) => x.id === a.card);
        if (!aug || cardById(aug.id).kind !== 'active') throw new RunError('forge needs an active augment');
        aug.bonus += 1;
        run.notice = { tone: 'good', text: `「${cardById(aug.id).name}」을(를) 연마했습니다. 대국마다 한 번 더 쓸 수 있습니다.` };
      }
      run.phase = 'map';
      break;
    }
    case 'spend-undo': {
      expect(run, 'battle');
      if (run.undos <= 0) throw new RunError('no undos left');
      run.undos -= 1;
      break;
    }
    case 'event': {
      expect(run, 'event');
      if (!run.event || run.event.result) throw new RunError('event closed');
      const choice = eventById(run.event.id).choices[a.choice];
      if (!choice) throw new RunError('no such choice');
      const why = choice.blocked?.(run);
      if (why) throw new RunError(why);
      if (choice.needsActive && !run.augments.some((x) => x.id === a.card && cardById(x.id).kind === 'active')) {
        throw new RunError('choose an active augment');
      }
      const text = choice.apply(run, rollRng(run, `event:${run.event.id}`), a.card);
      if (run.phase === 'event') run.event.result = text;
      else {
        run.event = null;
        run.notice = { tone: 'info', text };
      }
      break;
    }
  }
  return run;
}

function expect(run: RunState, phase: RunState['phase']): void {
  if (run.phase !== phase) throw new RunError(`expected ${phase}, in ${run.phase}`);
}

function enter(run: RunState, nodeId: string): void {
  expect(run, 'map');
  if (!reachable(run.map, run.current).includes(nodeId)) throw new RunError('not reachable');
  run.current = nodeId;
  run.visited.push(nodeId);
  run.stats.floors += 1;
  run.notice = null;
  run.attempts = 0;
  if (nodeId === run.map.bossId) {
    run.enemy = makeEnemy(run, rollRng(run, 'boss'), 'boss', run.map.rows);
    run.phase = 'prebattle';
    return;
  }
  const node = run.map.nodes[nodeId];
  switch (node.type) {
    case 'battle':
    case 'elite':
      run.enemy = makeEnemy(run, rollRng(run, 'enemy'), node.type, node.row);
      run.phase = 'prebattle';
      break;
    case 'shop':
      run.shop = makeShop(run);
      run.phase = 'shop';
      break;
    case 'rest':
      run.phase = 'rest';
      break;
    case 'treasure':
      run.reward = { title: '보물 상자', cards: offerCards(run, rollRng(run, 'treasure'), REWARD_WEIGHTS.treasure[run.act - 1]), gold: 0 };
      run.phase = 'treasure';
      break;
    case 'event': {
      const rng = rollRng(run, 'event-pick');
      const unseen = EVENTS.filter((e) => !run.seenEvents.includes(e.id));
      const e = rng.pick(unseen.length ? unseen : EVENTS);
      run.seenEvents.push(e.id);
      run.event = { id: e.id, result: null };
      run.phase = 'event';
      break;
    }
    default:
      run.phase = 'map';
  }
}

function battleEnd(run: RunState, outcome: 'win' | 'loss' | 'draw', undos: number): void {
  expect(run, 'battle');
  const enemy = run.enemy!;
  run.undos = Math.max(0, undos);
  const boss = enemy.kind === 'boss';
  if (outcome === 'win') {
    run.stats.wins += 1;
    if (enemy.kind === 'elite') run.stats.elites += 1;
    if (boss) run.stats.bosses += 1;
    const rng = rollRng(run, 'reward');
    const [lo, hi] = GOLD_REWARD[enemy.kind];
    const gold = Math.round((rng.range(lo, hi) + 5 * (run.act - 1)) * (enemy.goldMul ?? 1));
    run.gold += gold;
    const weights = boss ? [0, 0, 100] : enemy.kind === 'elite' ? REWARD_WEIGHTS.elite[run.act - 1] : REWARD_WEIGHTS.battle[run.act - 1];
    run.reward = { title: boss ? '보스 격파 보상' : enemy.kind === 'elite' ? '정예 격파 보상' : '승리 보상', cards: offerCards(run, rng, weights), gold };
    if (boss) gainLife(run, 1);
    run.phase = 'reward';
    run.notice = { tone: 'good', text: `${enemy.name}을(를) 이겼습니다! 골드 +${gold}${boss ? ', 목숨 +1' : ''}` };
    return;
  }
  if (outcome === 'draw' && !boss) {
    run.stats.draws += 1;
    const gold = Math.round(GOLD_REWARD[enemy.kind][0] / 2);
    run.gold += gold;
    run.reward = { title: '무승부', cards: [], gold };
    run.phase = 'reward';
    run.notice = { tone: 'info', text: `${enemy.name}과(와) 비겼습니다. 목숨은 지켰지만 증강 보상은 없습니다. 골드 +${gold}` };
    return;
  }
  // A loss (or a draw against a boss, which must be beaten).
  if (outcome === 'draw') run.stats.draws += 1;
  else run.stats.losses += 1;
  run.lives -= 1;
  if (run.lives <= 0) {
    run.phase = 'defeat';
    run.notice = { tone: 'bad', text: `${enemy.name}에게 졌습니다. 목숨을 모두 잃었습니다.` };
    return;
  }
  if (boss) {
    run.attempts += 1;
    run.phase = 'prebattle';
    run.notice = { tone: 'bad', text: `${enemy.name}을(를) 넘지 못했습니다. 목숨 -1. 보스는 쓰러뜨려야 지나갈 수 있습니다.` };
    return;
  }
  run.enemy = null;
  run.phase = 'map';
  run.notice = { tone: 'bad', text: `${enemy.name}에게 졌습니다. 목숨 -1. 보상 없이 길을 계속합니다.` };
}

function afterReward(run: RunState): void {
  const bossBeaten = run.current === run.map.bossId && run.enemy?.kind === 'boss';
  run.enemy = null;
  if (!bossBeaten) {
    run.phase = 'map';
    return;
  }
  if (run.act >= ACTS) {
    run.phase = 'victory';
    run.notice = { tone: 'good', text: '모든 보스를 쓰러뜨렸습니다!' };
    return;
  }
  run.act += 1;
  run.map = generateMap(run.seed, run.act);
  run.current = null;
  run.visited = [];
  run.phase = 'map';
  run.notice = { tone: 'info', text: `${run.act}막에 들어섰습니다. 상대가 더 강해지고, 더 많은 증강을 들고 나옵니다.` };
}

function makeShop(run: RunState): ShopItem[] {
  const rng = rollRng(run, 'shop');
  const items: ShopItem[] = [];
  const cards = [
    ...offerCards(run, rng, [100, 0, 0], 2),
  ];
  cards.push(...offerCards(run, rng, [0, 100, 0], 2, cards));
  cards.push(...offerCards(run, rng, [0, 0, 100], 1, cards));
  for (const id of cards) {
    const base = PRICE[cardById(id).tier];
    items.push({ kind: 'card', card: id, price: Math.round((base * (90 + rng.int(21))) / 100), sold: false });
  }
  items.push({ kind: 'heal', price: PRICE.heal, sold: false });
  items.push({ kind: 'undo', price: PRICE.undo, sold: false });
  return items;
}

function buy(run: RunState, index: number): void {
  expect(run, 'shop');
  const item = run.shop?.[index];
  if (!item || item.sold) throw new RunError('not for sale');
  if (run.gold < item.price) throw new RunError('not enough gold');
  if (item.kind === 'heal' && run.lives >= run.maxLives) throw new RunError('already full');
  if (item.kind === 'card' && item.card && ownsCard(run, item.card)) throw new RunError('owned');
  run.gold -= item.price;
  item.sold = true;
  if (item.kind === 'card' && item.card) addAugment(run, item.card);
  if (item.kind === 'heal') gainLife(run, 1);
  if (item.kind === 'undo') {
    addUndos(run, UNDOS_PER_PURCHASE);
    item.sold = false;
    item.price += 15;
  }
}

/** Nodes the player can enter now (map phase). */
export const nextNodes = (run: RunState): string[] => (run.phase === 'map' ? reachable(run.map, run.current) : []);
