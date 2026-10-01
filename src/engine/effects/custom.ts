import type { HookSubscriber } from '../rules/compile';
import type { Resolver } from '../rules/resolver';
import type { GameEvent } from '../rules/types';

/**
 * Named custom effects and predicates — the documented escape hatch of D5 for
 * rules that the declarative DSL cannot express. Each entry must be tested
 * (tests/upgrades.*.test.ts) and listed in DESIGN_DECISIONS.md.
 */
export interface CustomEffect {
  doc: string;
  run: (r: Resolver, e: GameEvent, sub: HookSubscriber, params: Record<string, number | string | boolean>) => void;
}

export interface CustomPredicate {
  doc: string;
  test: (r: Resolver, e: GameEvent, sub: HookSubscriber) => boolean;
}

export const CUSTOM_EFFECTS: Record<string, CustomEffect> = {};
export const CUSTOM_PREDICATES: Record<string, CustomPredicate> = {};

export function registerCustomEffect(name: string, effect: CustomEffect): void {
  CUSTOM_EFFECTS[name] = effect;
}

export function registerCustomPredicate(name: string, predicate: CustomPredicate): void {
  CUSTOM_PREDICATES[name] = predicate;
}
