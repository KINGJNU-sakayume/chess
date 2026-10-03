import { it } from 'vitest';
import { think } from '../../src/engine/ai/think';
import { cardById } from '../../src/engine/augments/cards';
import { loadoutContext } from '../../src/engine/augments/draft';
import { type Color } from '../../src/engine/game/types';
import { applyAction, createMatch, type MatchState } from '../../src/engine/match/match';
import { EVENTS } from '../../src/engine/run/events';
import { battleSetup, createRun, nextNodes, runAction } from '../../src/engine/run/reducer';
import type { RunState } from '../../src/engine/run/types';

const PLAYER = Number(process.env.SIM_PLAYER ?? 3);
const RUNS = Number(process.env.SIM_RUNS ?? 3);
const DIFF = Number(process.env.SIM_DIFF ?? 1) as 0 | 1 | 2;

function playGame(setup: ReturnType<typeof battleSetup>): 'win' | 'loss' | 'draw' {
  let m: MatchState = createMatch(setup);
  for (let i = 0; i < 400 && m.phase !== 'over'; i++) {
    const color = m.pos.side as Color;
    const side = m.sides[color];
    const level = color === 0 ? PLAYER : setup.level;
    const r = think({ pos: m.pos.toData(), history: m.hashes, level: Math.min(level, 4), cards: side.cards.filter((c) => c.uses > 0), cardAllowed: !side.cardUsedThisTurn, seed: `${setup.seed}:${i}`, timeMs: 120 });
    if (r.card) m = applyAction(m, { type: 'card', color, card: r.card.id, sq: r.card.sq });
    if (m.phase === 'play') m = applyAction(m, { type: 'move', color, move: r.move });
  }
  if (!m.result || m.result.winner === -1) return 'draw';
  return m.result.winner === 0 ? 'win' : 'loss';
}

it('simulates runs', () => {
  const tally: Record<string, [number, number, number]> = {};
  const ends: string[] = [];
  for (let k = 0; k < RUNS; k++) {
    let run: RunState = createRun(`sim${PLAYER}-${DIFF}-${k}`, DIFF);
    for (let step = 0; step < 500; step++) {
      if (run.phase === 'victory' || run.phase === 'defeat') break;
      switch (run.phase) {
        case 'start': case 'reward': case 'treasure': {
          const cards = run.reward!.cards;
          const ctx = loadoutContext(run.augments.map((a) => a.id), 0);
          const best = cards.slice().sort((a, b) => cardById(b).aiValue(ctx) - cardById(a).aiValue(ctx))[0] ?? null;
          run = runAction(run, run.phase === 'start' ? { type: 'start-pick', card: best } : { type: 'take-reward', card: best });
          break;
        }
        case 'map': run = runAction(run, { type: 'enter', node: nextNodes(run)[step % nextNodes(run).length] }); break;
        case 'prebattle': run = runAction(run, { type: 'begin-battle' }); break;
        case 'battle': {
          const o = playGame(battleSetup(run));
          const key = `act${run.act}-${run.enemy!.kind}(L${run.enemy!.level})`;
          tally[key] ??= [0, 0, 0];
          tally[key][o === 'win' ? 0 : o === 'loss' ? 1 : 2]++;
          run = runAction(run, { type: 'battle-end', outcome: o, undos: run.undos });
          break;
        }
        case 'shop': {
          const i = run.shop!.findIndex((it) => !it.sold && it.kind === 'card' && it.price <= run.gold);
          run = i >= 0 ? runAction(run, { type: 'buy', index: i }) : runAction(run, { type: 'leave' });
          break;
        }
        case 'rest': run = runAction(run, { type: 'rest', choice: 'heal' }); break;
        case 'event': {
          if (run.event!.result) { run = runAction(run, { type: 'leave' }); break; }
          const def = EVENTS.find((e) => e.id === run.event!.id)!;
          run = runAction(run, { type: 'event', choice: def.choices.findIndex((c) => !c.blocked?.(run) && !c.needsActive) });
          break;
        }
      }
    }
    ends.push(`${run.phase} act${run.act} augs=${run.augments.length} lives=${run.lives}`);
  }
  console.log('PLAYER', PLAYER, 'DIFF', DIFF);
  for (const [k, v] of Object.entries(tally).sort()) console.log(k, 'W/L/D', v.join('/'));
  console.log(ends.join('\n'));
}, 3_600_000);
