import { Rng } from '../rng/rng';
import { Position, START_FEN } from '../game/position';
import { baseRules, type SideRules } from '../game/rules';
import type { Color } from '../game/types';
import { CARDS, TIERS, cardById, conflictsWith, type DraftContext, type Tier } from './cards';

/** A draft round opens before White's move on these plies (game start, move 10, move 20). */
export const DRAFT_PLIES: readonly number[] = [0, 18, 38];
export const DRAFT_ROUNDS = DRAFT_PLIES.length;
export const OFFER_SIZE = 3;
export const REROLLS_PER_GAME = 1;

/** Tier odds (silver, gold, prism) per round. Both sides always get the same base tier. */
export const ROUND_TIER_WEIGHTS: readonly (readonly [number, number, number])[] = [
  [60, 35, 5],
  [30, 50, 20],
  [15, 45, 40],
];

/** Base tier index (0 silver, 1 gold, 2 prism) of a round, shared by both sides. */
export function roundTier(seed: string, round: number): number {
  const rng = Rng.fromSeed(seed, `tier:${round}`);
  return Math.max(0, rng.weightedIndex(ROUND_TIER_WEIGHTS[round - 1]));
}

/**
 * Three distinct cards of `tier` the side does not own yet, in a seeded
 * random order. Falls back to neighbouring tiers if the tier runs dry.
 */
export function rollOffer(opts: {
  pos: Position;
  color: Color;
  owned: readonly string[];
  seed: string;
  round: number;
  tier: Tier;
  rerollIndex: number;
  exclude?: readonly string[];
}): string[] {
  const { pos, color, owned, seed, round, tier, rerollIndex, exclude = [] } = opts;
  const rng = Rng.fromSeed(seed, `offer:${round}:${color}:${rerollIndex}`);
  const ctx: DraftContext = { pos, color, round, owned };
  const ok = (id: string) => canTake(id, owned, ctx);
  const order: Tier[] = [tier, ...TIERS.filter((t) => t !== tier).sort((a, b) => Math.abs(TIERS.indexOf(a) - TIERS.indexOf(tier)) - Math.abs(TIERS.indexOf(b) - TIERS.indexOf(tier)))];
  const out: string[] = [];
  for (const t of order) {
    const fresh = rng.shuffle(CARDS.filter((c) => c.tier === t && ok(c.id) && !exclude.includes(c.id)).map((c) => c.id));
    const reused = rng.shuffle(CARDS.filter((c) => c.tier === t && ok(c.id) && exclude.includes(c.id)).map((c) => c.id));
    for (const id of [...fresh, ...reused]) {
      if (out.length >= OFFER_SIZE) break;
      if (!out.includes(id)) out.push(id);
    }
    if (out.length >= OFFER_SIZE) break;
  }
  return out;
}

/**
 * Draft context for a loadout that is brought into every game (runs): the
 * starting position with the side's rules and start-of-game effects applied,
 * as `applyLoadout` in the match does.
 */
export function loadoutContext(owned: readonly string[], color: Color): DraftContext {
  const pos = Position.fromFen(START_FEN);
  pos.setRules(color, compileRules(owned));
  for (const id of owned) cardById(id).onAcquire?.(pos, color);
  pos.commit();
  pos.refresh();
  return { pos, color, round: 1, owned };
}

/** May a side that owns `owned` (with `ctx` describing its games) take `id`? */
export function canTake(id: string, owned: readonly string[], ctx: DraftContext): boolean {
  const c = cardById(id);
  return !owned.includes(id) && !conflictsWith(id, owned) && (!c.offerable || c.offerable(ctx));
}

/** Fold every owned passive card into a side's rules. */
export function compileRules(cardIds: readonly string[]): SideRules {
  const r = baseRules();
  for (const id of cardIds) cardById(id).rules?.(r);
  return r;
}

export const tierIndex = (t: Tier): number => TIERS.indexOf(t);
export const tierAt = (i: number): Tier => TIERS[Math.max(0, Math.min(TIERS.length - 1, i))];
