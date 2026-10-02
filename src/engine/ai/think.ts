import { cardById } from '../augments/cards';
import { Position, type PositionData } from '../game/position';
import type { Color } from '../game/types';
import { Rng } from '../rng/rng';
import { Searcher, WIN, isWinScore } from './search';

/**
 * The AI's whole turn: whether to use an active card first (cards are free
 * actions, at most one per turn), then which move to play. Weaker levels
 * search shallower and pick among good moves with noise.
 */
export interface Level {
  name: string;
  /** Search depth (ID depth cap for timed levels). */
  depth: number;
  /** Time budget in ms (0 = depth-limited, exact root scores + noise). */
  timeMs: number;
  /** Noise added to root scores, in centipawns. */
  noise: number;
  /** Chance to play a random non-losing move. */
  blunder: number;
  /** Depth used to judge card uses. */
  cardDepth: number;
  /** Noise added to draft values. */
  draftNoise: number;
}

export const LEVELS: readonly Level[] = [
  { name: '입문', depth: 1, timeMs: 0, noise: 180, blunder: 0.2, cardDepth: 1, draftNoise: 220 },
  { name: '초급', depth: 2, timeMs: 0, noise: 80, blunder: 0.06, cardDepth: 1, draftNoise: 130 },
  { name: '중급', depth: 3, timeMs: 0, noise: 30, blunder: 0, cardDepth: 2, draftNoise: 70 },
  { name: '고급', depth: 64, timeMs: 1200, noise: 0, blunder: 0, cardDepth: 2, draftNoise: 35 },
  { name: '마스터', depth: 64, timeMs: 3200, noise: 0, blunder: 0, cardDepth: 3, draftNoise: 15 },
];

export const levelOf = (n: number): Level => LEVELS[Math.max(1, Math.min(LEVELS.length, n)) - 1];

export interface ThinkRequest {
  pos: PositionData;
  /** Hashes of earlier positions (repetition detection). */
  history: [number, number][];
  level: number;
  /** The AI's active cards and their uses left. */
  cards: { id: string; uses: number }[];
  /** False if a card was already used this turn. */
  cardAllowed: boolean;
  seed: string;
  /** Override the level's time budget (tests). */
  timeMs?: number;
}

export interface ThinkResult {
  card: { id: string; sq: number } | null;
  move: number;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
}

/** Minimum gain (centipawns) before the AI spends a card. */
const CARD_THRESHOLD = 45;

let shared: Searcher | null = null;

/** Reuse one searcher (and its transposition table) between turns. */
function searcherFor(pos: Position): Searcher {
  if (!shared) shared = new Searcher(pos);
  shared.pos = pos;
  return shared;
}

export function think(req: ThinkRequest): ThinkResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const level = levelOf(req.level);
  const pos = Position.fromData(req.pos);
  const color = pos.side as Color;
  const searcher = searcherFor(pos);
  searcher.setHistory(req.history);
  const rng = Rng.fromSeed(req.seed, `think:${pos.ply}`);
  let nodes = 0;

  // 1. Card use.
  let card: ThinkResult['card'] = null;
  if (req.cardAllowed) {
    const usable = req.cards.filter((c) => c.uses > 0 && cardById(c.id).kind === 'active');
    if (usable.length) {
      const depth = level.cardDepth;
      const baseline = searcher.search({ depth }).score;
      nodes += searcher.nodes;
      let bestGain = CARD_THRESHOLD;
      for (const c of usable) {
        const def = cardById(c.id);
        for (const sq of def.targets!(pos, color)) {
          pos.push();
          def.apply!(pos, color, sq);
          const s = searcher.search({ depth }).score;
          nodes += searcher.nodes;
          pos.pop();
          const jitter = level.noise ? rng.range(-level.noise, level.noise) / 4 : 0;
          const gain = s - baseline + jitter;
          if (gain > bestGain) {
            bestGain = gain;
            card = { id: c.id, sq };
          }
        }
      }
      if (card) cardById(card.id).apply!(pos, color, card.sq);
    }
  }

  // 2. Move.
  let move = 0;
  let score = 0;
  let depth = level.depth;
  if (level.timeMs === 0) {
    const scored = searcher.scoreRootMoves(level.depth);
    nodes += searcher.nodes;
    const wins = scored.filter((s) => isWinScore(s.score) && s.score > 0);
    if (wins.length) {
      const best = wins.reduce((a, b) => (b.score > a.score ? b : a));
      move = best.move;
      score = best.score;
    } else {
      const safe = scored.filter((s) => s.score > -WIN + 1000);
      const pool = safe.length ? safe : scored;
      if (level.blunder && rng.chance(level.blunder)) {
        const pick = pool[rng.int(pool.length)];
        move = pick.move;
        score = pick.score;
      } else {
        let bestNoisy = -Infinity;
        for (const s of pool) {
          const v = s.score + (isWinScore(s.score) ? 0 : rng.range(-level.noise, level.noise));
          if (v > bestNoisy) {
            bestNoisy = v;
            move = s.move;
            score = s.score;
          }
        }
      }
    }
  } else {
    const r = searcher.search({ depth: level.depth, timeMs: req.timeMs ?? level.timeMs });
    nodes += r.nodes;
    move = r.move;
    score = r.score;
    depth = r.depth;
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { card, move, score, depth, nodes, ms: Math.round(t1 - t0) };
}

/** The AI's draft pick: the card worth most to it right now, with level-dependent noise. */
export function pickDraft(
  posData: PositionData,
  color: Color,
  offer: readonly string[],
  levelN: number,
  seed: string,
  owned: readonly string[] = [],
): string {
  const pos = Position.fromData(posData);
  const level = levelOf(levelN);
  const rng = Rng.fromSeed(seed, `draft:${pos.ply}:${color}`);
  const round = pos.ply < 18 ? 1 : pos.ply < 38 ? 2 : 3;
  let best = offer[0];
  let bestV = -Infinity;
  for (const id of offer) {
    const v = cardById(id).aiValue({ pos, color, round, owned }) + rng.range(-level.draftNoise, level.draftNoise);
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best;
}
