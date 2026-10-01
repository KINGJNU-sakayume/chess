import type { Resolver } from '../rules/resolver';
import { BOSSES } from '../../data/bosses';

/**
 * Boss rules plug into fixed points of the turn cycle. Each boss is data plus
 * small hook functions (Part E) — they change the puzzle, never the AI depth.
 */
export type BossMoment = 'setup' | 'turnStart' | 'phaseStart' | 'reinforcements' | 'phaseEnd';

export function runBossHooks(r: Resolver, moment: BossMoment): void {
  const id = r.d.config.bossId;
  if (!id) return;
  const boss = BOSSES[id];
  if (!boss) return;
  boss.hooks[moment]?.(r);
  r.drain();
}
