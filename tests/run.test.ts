import { describe, expect, it } from 'vitest';
import { cardById } from '../src/engine/augments/cards';
import { WHITE } from '../src/engine/game/types';
import { createMatch } from '../src/engine/match/match';
import { BOSSES } from '../src/engine/run/content';
import { EVENTS } from '../src/engine/run/events';
import { MAP_ROWS, generateMap, reachable } from '../src/engine/run/map';
import { battleSetup, createRun, nextNodes, runAction } from '../src/engine/run/reducer';
import type { RunState } from '../src/engine/run/types';

describe('act maps', () => {
  it('are connected, layered and follow the floor rules', () => {
    for (let i = 0; i < 40; i++) {
      for (const act of [1, 2, 3]) {
        const map = generateMap(`m${i}`, act);
        const nodes = Object.values(map.nodes);
        expect(map.starts.length).toBeGreaterThanOrEqual(2);
        // Every node is reachable from a start and reaches the boss.
        const seen = new Set<string>(map.starts);
        const stack = [...map.starts];
        while (stack.length) {
          const id = stack.pop()!;
          for (const n of reachable(map, id)) {
            if (seen.has(n)) continue;
            seen.add(n);
            stack.push(n);
          }
        }
        expect(seen.has(map.bossId)).toBe(true);
        for (const n of nodes) {
          expect(seen.has(n.id)).toBe(true);
          expect(n.next.length).toBeGreaterThan(0);
          for (const m of n.next) if (m !== map.bossId) expect(map.nodes[m].row).toBe(n.row + 1);
          if (n.row === 0) expect(n.type).toBe('battle');
          if (n.row === 4) expect(n.type).toBe('treasure');
          if (n.row === MAP_ROWS - 1) expect(n.type).toBe('rest');
          for (const m of n.next) {
            const child = map.nodes[m];
            if (child && ['elite', 'shop', 'rest'].includes(n.type) && n.row !== MAP_ROWS - 2) expect(child.type).not.toBe(n.type);
          }
        }
        expect(nodes.some((n) => n.type === 'shop')).toBe(true);
        expect(nodes.some((n) => n.type === 'elite')).toBe(true);
        expect(BOSSES[act].map((b) => b.id)).toContain(map.boss);
      }
    }
  });
});

/** Walk a run with simple choices; battles resolve with the given outcome. */
function walk(run: RunState, outcome: (r: RunState) => 'win' | 'loss' | 'draw', steps = 400): RunState {
  for (let i = 0; i < steps; i++) {
    switch (run.phase) {
      case 'start':
        run = runAction(run, { type: 'start-pick', card: run.reward!.cards[0] });
        break;
      case 'map':
        run = runAction(run, { type: 'enter', node: nextNodes(run)[0] });
        break;
      case 'prebattle':
        run = runAction(run, { type: 'begin-battle' });
        // The battle setup must build a valid match with both loadouts.
        createMatch(battleSetup(run));
        break;
      case 'battle':
        run = runAction(run, { type: 'battle-end', outcome: outcome(run), undos: run.undos });
        break;
      case 'reward':
      case 'treasure':
        run = runAction(run, { type: 'take-reward', card: run.reward!.cards[0] ?? null });
        break;
      case 'shop': {
        const i = run.shop!.findIndex((it) => !it.sold && it.kind === 'card' && it.price <= run.gold);
        run = i >= 0 ? runAction(run, { type: 'buy', index: i }) : runAction(run, { type: 'leave' });
        if (i >= 0) run = runAction(run, { type: 'leave' });
        break;
      }
      case 'rest':
        run = runAction(run, { type: 'rest', choice: 'heal' });
        break;
      case 'event': {
        const def = EVENTS.find((e) => e.id === run.event!.id)!;
        if (run.event!.result) {
          run = runAction(run, { type: 'leave' });
          break;
        }
        const idx = def.choices.findIndex((c) => !c.blocked?.(run) && !c.needsActive);
        run = runAction(run, { type: 'event', choice: idx });
        break;
      }
      default:
        return run;
    }
  }
  return run;
}

describe('run flow', () => {
  it('a winning run clears three acts and collects augments', () => {
    let run = createRun('flow-win', 1);
    expect(run.reward!.cards).toHaveLength(3);
    // Rest sites heal only when hurt: pick forge-free paths by never losing.
    run = walk(run, () => 'win');
    expect(run.phase).toBe('victory');
    expect(run.stats.bosses).toBe(3);
    expect(run.augments.length).toBeGreaterThan(8);
    expect(new Set(run.augments.map((a) => a.id)).size).toBe(run.augments.length);
    for (const a of run.augments) expect(cardById(a.id).run).not.toBe(false);
  });

  it('losing every game ends the run', () => {
    const run = walk(createRun('flow-loss', 1), () => 'loss');
    expect(run.phase).toBe('defeat');
    expect(run.lives).toBe(0);
  });

  it('a lost boss game is retried at the cost of a life', () => {
    let run = createRun('boss-retry', 1);
    run = runAction(run, { type: 'start-pick', card: null });
    // Jump to the boss: clear the act quickly by walking the map with wins.
    while (run.current !== run.map.bossId) {
      run = walk(run, () => 'win', 1);
      if (run.phase === 'prebattle' && run.current === run.map.bossId) break;
    }
    expect(run.phase).toBe('prebattle');
    expect(run.enemy!.kind).toBe('boss');
    const lives = run.lives;
    run = runAction(run, { type: 'begin-battle' });
    run = runAction(run, { type: 'battle-end', outcome: 'loss', undos: 1 });
    expect(run.phase).toBe('prebattle');
    expect(run.lives).toBe(lives - 1);
    expect(run.undos).toBe(1);
    const firstSeed = run.battleSeed;
    run = runAction(run, { type: 'begin-battle' });
    expect(run.battleSeed).not.toBe(firstSeed);
  });

  it('battles bring both loadouts into the match', () => {
    let run = createRun('loadout', 1);
    run = runAction(run, { type: 'start-pick', card: run.reward!.cards[0] });
    run = runAction(run, { type: 'enter', node: nextNodes(run)[0] });
    run = runAction(run, { type: 'begin-battle' });
    const m = createMatch(battleSetup(run));
    expect(m.phase).toBe('play');
    expect(m.sides[WHITE].cards.map((c) => c.id)).toEqual(run.augments.map((a) => a.id));
    expect(m.sides[1].cards.map((c) => c.id)).toEqual(run.enemy!.augments);
    expect(m.setup.names?.[1]).toBe(run.enemy!.name);
  });

  it('enemies get stronger by act', () => {
    const run = createRun('scaling', 1);
    const levels: number[] = [];
    const counts: number[] = [];
    let r = runAction(run, { type: 'start-pick', card: null });
    for (let guard = 0; guard < 300 && r.phase !== 'victory'; guard++) {
      if (r.phase === 'prebattle' && r.enemy!.kind === 'battle') {
        levels[r.act] = Math.max(levels[r.act] ?? 0, r.enemy!.level);
        counts[r.act] = Math.max(counts[r.act] ?? 0, r.enemy!.augments.length);
      }
      r = walk(r, () => 'win', 1);
    }
    expect(levels[1]).toBeLessThan(levels[3]);
    expect(counts[1]).toBeLessThan(counts[3]);
  });

  it('forging adds uses per game', () => {
    let run = createRun('forge', 1);
    run = runAction(run, { type: 'start-pick', card: null });
    run.augments.push({ id: 'shield', bonus: 0 });
    run.phase = 'rest';
    run = runAction(run, { type: 'rest', choice: 'forge', card: 'shield' });
    expect(run.augments.find((a) => a.id === 'shield')!.bonus).toBe(1);
    run.enemy = { name: 'x', kind: 'battle', level: 1, augments: [], blurb: '', look: 'knights' };
    run.battleSeed = 's';
    const m = createMatch(battleSetup(run));
    expect(m.sides[WHITE].cards.find((c) => c.id === 'shield')!.uses).toBe(2);
  });
});
