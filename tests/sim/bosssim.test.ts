import { it } from 'vitest';
import { think } from '../../src/engine/ai/think';
import { RUN_CARDS } from '../../src/engine/augments/cards';
import { type Color } from '../../src/engine/game/types';
import { applyAction, createMatch, type MatchSetup, type MatchState } from '../../src/engine/match/match';
import { BOSSES } from '../../src/engine/run/content';
import { Rng } from '../../src/engine/rng';

const PLAYER = Number(process.env.SIM_PLAYER ?? 2);
const ACT = Number(process.env.SIM_ACT ?? 1);
const LEVEL = Number(process.env.SIM_LEVEL ?? 2);
const N = Number(process.env.SIM_N ?? 6);
const AUGS = Number(process.env.SIM_AUGS ?? 5);

function play(setup: MatchSetup): string {
  let m: MatchState = createMatch(setup);
  for (let i = 0; i < 300 && m.phase !== 'over'; i++) {
    const color = m.pos.side as Color;
    const side = m.sides[color];
    const r = think({ pos: m.pos.toData(), history: m.hashes, level: color === 0 ? PLAYER : setup.level, cards: side.cards.filter((c) => c.uses > 0), cardAllowed: !side.cardUsedThisTurn, seed: `${setup.seed}:${i}`, timeMs: 120 });
    if (r.card) m = applyAction(m, { type: 'card', color, card: r.card.id, sq: r.card.sq });
    if (m.phase === 'play') m = applyAction(m, { type: 'move', color, move: r.move });
  }
  if (!m.result) return `D(cap ${m.pos.ply})`;
  return m.result.winner === -1 ? `D(${m.result.reason})` : m.result.winner === 0 ? `W(${m.result.reason},${m.pos.ply})` : `L(${m.result.reason},${m.pos.ply})`;
}

it('boss fights', () => {
  for (const b of BOSSES[ACT]) {
    const res: string[] = [];
    for (let k = 0; k < N; k++) {
      const rng = Rng.fromSeed(`boss-${k}`);
      const augs = rng.shuffle(RUN_CARDS.filter((c) => c.tier !== 'prism').map((c) => c.id)).slice(0, AUGS);
      res.push(play({ mode: 'ai', human: 0, level: LEVEL, seed: `bs-${b.id}-${k}`, drafts: false, loadout: [augs.map((id) => ({ id })), b.cards.map((id) => ({ id }))] }));
    }
    console.log(b.id, `L${LEVEL} vs player L${PLAYER}:`, res.join(' '));
  }
}, 3_600_000);
