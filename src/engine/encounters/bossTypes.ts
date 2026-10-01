import type { Resolver } from '../rules/resolver';
import type { BossMoment } from './bossHooks';

export interface BossDef {
  id: string;
  name: string;
  title: string;
  description: string;
  hooks: Partial<Record<BossMoment, (r: Resolver) => void>>;
}
