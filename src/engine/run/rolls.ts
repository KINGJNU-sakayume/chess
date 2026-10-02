import { RUN_CARDS, TIERS, cardById } from '../augments/cards';
import { Rng } from '../rng/rng';
import { ARCHETYPES, battleAugments, bossById, bossExtraAugments, eliteAugments, enemyLevel, enemyTiers } from './content';
import type { EnemyDef, EnemyKind, RunState } from './types';

/** A fresh random stream for one roll; the run's counter makes every roll distinct. */
export function rollRng(run: RunState, label: string): Rng {
  run.counter += 1;
  return Rng.fromSeed(run.seed, `${label}:${run.counter}`);
}

export const ownsCard = (run: RunState, id: string): boolean => run.augments.some((a) => a.id === id);

export function addAugment(run: RunState, id: string): void {
  if (!ownsCard(run, id)) run.augments.push({ id, bonus: 0 });
}

export function gainLife(run: RunState, n: number): void {
  run.lives = Math.min(run.maxLives, run.lives + n);
}

export function addUndos(run: RunState, n: number): void {
  run.undos += n;
}

const tierOf = (id: string): number => TIERS.indexOf(cardById(id).tier);

/**
 * `n` distinct run cards the player does not own, each slot's tier drawn
 * from `weights` (silver, gold, prism); a tier that ran dry falls back to the
 * nearest one.
 */
export function offerCards(run: RunState, rng: Rng, weights: readonly number[], n = 3, exclude: readonly string[] = []): string[] {
  const out: string[] = [];
  const free = (id: string) => !ownsCard(run, id) && !out.includes(id) && !exclude.includes(id);
  for (let i = 0; i < n; i++) {
    const want = Math.max(0, rng.weightedIndex(weights));
    const order = [0, 1, 2].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || b - a);
    for (const t of order) {
      const pool = RUN_CARDS.filter((c) => tierOf(c.id) === t && free(c.id));
      if (pool.length) {
        out.push(rng.pick(pool).id);
        break;
      }
    }
  }
  return out;
}

/** An enemy for a battle or elite node (bosses come from their fixed definitions). */
export function makeEnemy(run: RunState, rng: Rng, kind: EnemyKind, row: number): EnemyDef {
  const act = run.act;
  // The cursed crown's bonus waits for the next regular or elite enemy; bosses are hard enough.
  const upper = kind === 'battle' && act >= 2 && row >= 5 ? 1 : 0;
  const level = enemyLevel(kind, act, run.difficulty, (kind === 'boss' ? 0 : run.nextEnemyBonus) + upper);
  if (kind !== 'boss') run.nextEnemyBonus = 0;
  if (kind === 'boss') {
    const b = bossById(run.map.boss);
    const extra = rng
      .shuffle(RUN_CARDS.map((c) => c.id).filter((id) => tierOf(id) >= 1 && !b.cards.includes(id)))
      .slice(0, bossExtraAugments(act));
    return { name: b.name, kind, level, augments: [...b.cards, ...extra], blurb: b.blurb, look: b.id };
  }
  const arch = rng.pick(ARCHETYPES);
  const tiers = enemyTiers(kind, act);
  const count = kind === 'battle' ? battleAugments(act, row) : eliteAugments(act);
  const allowed = (id: string) => tiers.includes(tierOf(id)) && cardById(id).run !== false;
  const augments = rng.shuffle(arch.cards.filter(allowed)).slice(0, count);
  if (augments.length < count) {
    const extra = rng.shuffle(RUN_CARDS.map((c) => c.id).filter((id) => allowed(id) && !augments.includes(id)));
    augments.push(...extra.slice(0, count - augments.length));
  }
  // Elites always carry at least one card above silver when the act allows it.
  if (kind === 'elite' && !augments.some((id) => tierOf(id) > 0)) {
    const strong = RUN_CARDS.map((c) => c.id).filter((id) => allowed(id) && tierOf(id) > 0 && !augments.includes(id));
    if (strong.length) augments[augments.length - 1 >= 0 ? augments.length - 1 : 0] = rng.pick(strong);
  }
  const name = kind === 'elite' ? arch.names[Math.min(2, act)] : arch.names[act - 1];
  return { name, kind, level, augments, blurb: arch.blurb, look: arch.id };
}
