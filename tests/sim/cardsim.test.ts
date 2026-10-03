import { it } from 'vitest';
import { think } from '../../src/engine/ai/think';
import { RUN_CARDS, TIERS, cardById } from '../../src/engine/augments/cards';
import { type Color } from '../../src/engine/game/types';
import { applyAction, createMatch, type MatchSetup, type MatchState } from '../../src/engine/match/match';
import { Rng } from '../../src/engine/rng';

/**
 * Card power index: a bot holding one augment (or one combo) plays the same
 * bot, alternating colours. The score is (wins + draws / 2) / games from the
 * holder's side.
 *
 * SIM_MODE=none (default): the opponent holds nothing; 0.5 means the card does nothing.
 * SIM_MODE=tier: the opponent holds a random card of the same tier, so 0.5 is the
 *   tier's average; then random cards of neighbouring tiers play each other.
 *
 * SIM_LEVEL (AI level, default 3), SIM_N (games per card, default 8),
 * SIM_CARDS (comma-separated ids), SIM_SHARD ("i/k": every k-th entry from i).
 */
const LEVEL = Number(process.env.SIM_LEVEL ?? 3);
const N = Number(process.env.SIM_N ?? 8);
const FILTER = (process.env.SIM_CARDS ?? '').split(',').filter(Boolean);
const [SHARD, SHARDS] = (process.env.SIM_SHARD ?? '0/1').split('/').map(Number);
const MODE = process.env.SIM_MODE ?? 'none';

const COMBOS: string[][] = [
  ['king_of_the_hill', 'warrior_king'],
  ['king_of_the_hill', 'warrior_king', 'royal_aegis'],
  ['breakthrough', 'early_promotion', 'pawn_charge'],
  ['breakthrough', 'pawn_charge'],
  ['divine_aegis', 'royal_aegis'],
];

function play(setup: MatchSetup, holder: Color): number {
  let m: MatchState = createMatch(setup);
  for (let i = 0; i < 300 && m.phase !== 'over'; i++) {
    const color = m.pos.side as Color;
    const side = m.sides[color];
    const r = think({
      pos: m.pos.toData(),
      history: m.hashes,
      level: LEVEL,
      cards: side.cards.filter((c) => c.uses > 0),
      cardAllowed: !side.cardUsedThisTurn,
      seed: `${setup.seed}:${i}`,
      timeMs: 150,
    });
    if (r.card) m = applyAction(m, { type: 'card', color, card: r.card.id, sq: r.card.sq });
    if (m.phase === 'play') m = applyAction(m, { type: 'move', color, move: r.move });
  }
  if (!m.result || m.result.winner === -1) return 0.5;
  return m.result.winner === holder ? 1 : 0;
}

const tierPool = (tier: string, not: string[] = []): string[] => RUN_CARDS.filter((c) => c.tier === tier && !not.includes(c.id)).map((c) => c.id);

type Pick = (k: number) => string[];

/** Holder's score with `mine(k)` against `rival(k)` over N games, alternating colours. */
function score(mineAt: Pick, rival: Pick, label: string): number {
  let total = 0;
  for (let k = 0; k < N; k++) {
    const holder = (k % 2) as Color;
    const mine = mineAt(k).map((id) => ({ id }));
    const theirs = rival(k).map((id) => ({ id }));
    const loadout: MatchSetup['loadout'] = holder === 0 ? [mine, theirs] : [theirs, mine];
    total += play({ mode: 'ai', human: 0, level: LEVEL, seed: `cardsim:${label}:${k}`, drafts: false, loadout }, holder);
  }
  return total / N;
}

/** The k-th rival from a pool: cycles through a seeded shuffle so every rival appears. */
function rivalFrom(pool: string[], seed: string): Pick {
  const order = Rng.fromSeed(seed).shuffle(pool.slice());
  return (k) => [order[Math.floor(k / 2) % order.length]];
}

it('card power index', () => {
  const singles = RUN_CARDS.map((c) => [c.id]);
  const extra = MODE === 'tier' ? [['tier:silver>gold'], ['tier:gold>prism']] : COMBOS;
  let entries = FILTER.length ? [...singles, ...extra].filter((e) => e.every((id) => FILTER.includes(id))) : [...singles, ...extra];
  entries = entries.filter((_, i) => i % SHARDS === SHARD);
  const byTier: Record<string, number[]> = {};
  for (const ids of entries) {
    if (ids[0].startsWith('tier:')) {
      // Random cards of the lower tier against random cards of the higher one.
      const [lo, hi] = ids[0].slice(5).split('>');
      const s = score(rivalFrom(tierPool(lo), `${ids[0]}:lo`), rivalFrom(tierPool(hi), `${ids[0]}:hi`), ids[0]);
      console.log(`CARDSIM ${JSON.stringify({ ids, tier: 'cross', score: s, n: N, level: LEVEL })}`);
      continue;
    }
    const rival = MODE === 'tier' && ids.length === 1 ? rivalFrom(tierPool(cardById(ids[0]).tier, ids), ids[0]) : () => [];
    const s = score(() => ids, rival, ids.join('+'));
    const tier = ids.length === 1 ? cardById(ids[0]).tier : 'combo';
    if (ids.length === 1) (byTier[tier] ??= []).push(s);
    console.log(`CARDSIM ${JSON.stringify({ ids, tier, score: s, n: N, level: LEVEL, mode: MODE })}`);
  }
  for (const t of TIERS) {
    const v = byTier[t];
    if (v?.length) console.log(`TIER ${t} avg ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)} over ${v.length}`);
  }
}, 7_200_000);
