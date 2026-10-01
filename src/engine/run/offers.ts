import type { PieceType } from '../core/pieces';
import type { OwnedUpgrade } from '../core/state';
import { allUpgrades } from '../rules/registry';
import type { Rarity, UpgradeDef } from '../rules/types';
import type { Rng } from '../rng/rng';
import { actTuning } from '../../data/acts';
import type { RosterPiece } from './roster';

/**
 * Offer generation (B9). Weight = rarity weight × (1 + 0.5 × owned upgrades
 * sharing a tag) — an offer-weighting curve, never a cap. Of every 3 offers at
 * least one comes from outside the most-owned tag.
 */

/** Tags that define archetypes; generic mechanical tags do not drive offer weighting. */
export const ARCHETYPE_TAGS = ['pawn', 'bishop', 'knight', 'rook', 'queen', 'king', 'board', 'promotion', 'sacrifice', 'start', 'enemy_debuff'] as const;

const archetypeTags = (u: UpgradeDef) => u.tags.filter((t) => (ARCHETYPE_TAGS as readonly string[]).includes(t));

export interface OfferContext {
  act: number;
  owned: readonly OwnedUpgrade[];
  roster: readonly RosterPiece[];
}

export function stacksOwned(owned: readonly OwnedUpgrade[], id: string): number {
  return owned.find((u) => u.id === id)?.stacks ?? 0;
}

/** Stacks of owned upgrades carrying `tag`. */
export function tagCount(owned: readonly OwnedUpgrade[], tag: string): number {
  let n = 0;
  for (const o of owned) {
    const def = allUpgrades().find((u) => u.id === o.id);
    if (def?.tags.includes(tag)) n += o.stacks;
  }
  return n;
}

export function mostOwnedTag(owned: readonly OwnedUpgrade[]): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const tag of ARCHETYPE_TAGS) {
    const n = tagCount(owned, tag);
    if (n > bestN) {
      best = tag;
      bestN = n;
    }
  }
  return best;
}

const hasPiece = (roster: readonly RosterPiece[], t: PieceType) => roster.some((r) => r.type === t);

/** Whether the upgrade can currently be offered (unique, saturation, prerequisites, feasibility). */
export function offerable(u: UpgradeDef, ctx: OfferContext): boolean {
  const owned = stacksOwned(ctx.owned, u.id);
  if (!u.stackable && owned > 0) return false;
  if (u.maxUsefulStacks !== undefined && owned >= u.maxUsefulStacks) return false;
  for (const p of u.prerequisites) if (tagCount(ctx.owned, p.tag) < p.count) return false;
  // Acquisition must be possible with the current roster.
  if (u.choice?.kind === 'choosePiece' && !hasPiece(ctx.roster, u.choice.pieceType)) return false;
  if (u.choice?.kind === 'castledSide' && !(hasPiece(ctx.roster, 'king') && hasPiece(ctx.roster, 'rook'))) return false;
  if (u.id === 'start_open_center' && !ctx.roster.some((r) => r.type === 'pawn' && r.sq !== null && [3, 4].includes(r.sq & 7))) return false;
  return true;
}

export function offerWeight(u: UpgradeDef, ctx: OfferContext): number {
  const rarity = actTuning(ctx.act).rarityWeights[u.rarity];
  if (rarity <= 0) return 0;
  const tags = archetypeTags(u);
  let shared = 0;
  for (const o of ctx.owned) {
    const def = allUpgrades().find((x) => x.id === o.id);
    if (def && archetypeTags(def).some((t) => tags.includes(t))) shared += o.stacks;
  }
  return rarity * (1 + 0.5 * shared);
}

export type OfferPool = 'standard' | 'mutation' | 'rarePlus';

function poolFilter(pool: OfferPool) {
  return (u: UpgradeDef) => {
    if (pool === 'mutation') return u.category === 'mutation';
    if (pool === 'rarePlus') return u.rarity === 'rare' || u.rarity === 'legendary';
    return true;
  };
}

const RARE_PLUS: readonly Rarity[] = ['rare', 'legendary'];

function weightedDraw(rng: Rng, candidates: UpgradeDef[], ctx: OfferContext, pool: OfferPool): UpgradeDef | null {
  const weights = candidates.map((u) => (pool === 'rarePlus' ? Math.max(1, offerWeight(u, { ...ctx, act: 3 })) : offerWeight(u, ctx)));
  const idx = rng.weightedIndex(weights);
  if (idx >= 0) return candidates[idx];
  return candidates.length ? rng.pick(candidates) : null;
}

/**
 * Draw up to `count` distinct offers. `atLeastOneRare` (elites) forces a Rare
 * or better into the set when possible.
 */
export function generateOffers(rng: Rng, ctx: OfferContext, opts: { count?: number; pool?: OfferPool; atLeastOneRare?: boolean } = {}): string[] {
  const count = opts.count ?? 3;
  const pool = opts.pool ?? 'standard';
  const candidates = allUpgrades()
    .filter(poolFilter(pool))
    .filter((u) => offerable(u, ctx))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const chosen: UpgradeDef[] = [];
  const remaining = candidates.slice();
  while (chosen.length < count && remaining.length) {
    const u = weightedDraw(rng, remaining, ctx, pool);
    if (!u) break;
    chosen.push(u);
    remaining.splice(remaining.indexOf(u), 1);
  }
  // Opportunity cost: at least one offer from outside the most-owned tag.
  const top = mostOwnedTag(ctx.owned);
  if (top && chosen.length === count && chosen.every((u) => u.tags.includes(top))) {
    const outside = remaining.filter((u) => !u.tags.includes(top));
    const replacement = weightedDraw(rng, outside, ctx, pool);
    if (replacement) chosen[chosen.length - 1] = replacement;
  }
  // Elites: at least one Rare or better.
  if (opts.atLeastOneRare && !chosen.some((u) => RARE_PLUS.includes(u.rarity))) {
    const rares = remaining.filter((u) => RARE_PLUS.includes(u.rarity) && !chosen.includes(u));
    const replacement = weightedDraw(rng, rares, { ...ctx, act: 3 }, pool);
    if (replacement) {
      // Keep the "outside the most-owned tag" guarantee when replacing.
      const idx = top ? Math.max(0, chosen.findIndex((u) => u.tags.includes(top))) : chosen.length - 1;
      chosen[idx >= 0 ? idx : chosen.length - 1] = replacement;
    }
  }
  return chosen.map((u) => u.id);
}
