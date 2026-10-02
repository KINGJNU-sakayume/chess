import type { Intent, PieceTag } from '../core/state';
import type { Resolver } from '../rules/resolver';
import type { BossMoment } from './bossHooks';

export interface BossDef {
  id: string;
  name: string;
  title: string;
  description: string;
  hooks: Partial<Record<BossMoment, (r: Resolver) => void>>;
  /**
   * The tagged piece plans this many sequential intents per phase (in addition
   * to N). With `ramp`, it plans one on turn 1, two on turn 2, … up to `count`.
   */
  multiIntent?: { tag: PieceTag; count: number; ramp?: boolean };
  /** One of the boss side's intents failed (fizzled or Ward-repelled); the piece still stands. */
  onStepFailed?: (r: Resolver, intent: Intent) => void;
}
