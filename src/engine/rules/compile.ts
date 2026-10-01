import type { PieceType } from '../core/pieces';
import type { EncounterRules, OwnedUpgrade } from '../core/state';
import { evalNum } from './num';
import { affixDef, hasUpgradeDef, upgradeDef } from './registry';
import type { AffixDef, CounterDef, GameEventType, HookDef, MoveModDef, UpgradeDef } from './types';

/**
 * Upgrades compiled into fast lookups for one encounter. Cached per `rules`
 * object (which is shared by every state of an encounter).
 */
export interface CompiledMoveMod {
  upgradeId: string;
  stacks: number;
  order: number;
  def: MoveModDef;
  types: readonly PieceType[];
}

export interface HookSubscriber {
  upgradeId: string;
  name: string;
  stacks: number;
  order: number;
  priority: number;
  hook: HookDef;
  hookIndex: number;
}

export interface CompiledRules {
  owned: ReadonlyMap<string, OwnedUpgrade>;
  defs: ReadonlyMap<string, UpgradeDef>;
  playerMoveMods: CompiledMoveMod[];
  hooks: Partial<Record<GameEventType, HookSubscriber[]>>;
  /** Rank index (0–7) at or beyond which player Pawns promote. */
  promotionRankPlayer: number;
  /** Rank index at or below which enemy Pawns promote. */
  promotionRankEnemy: number;
  reserveDeploysPerTurn: number;
  heavyQueenRange: number | null;
  crackedFormation: number;
  delayedReinforcement: number;
  slowCommand: boolean;
  royalCurse: boolean;
  affixes: AffixDef[];
  counterDefs: ReadonlyMap<string, CounterDef & { upgradeId: string }>;
}

const cache = new WeakMap<EncounterRules, CompiledRules>();

export function stacksOf(c: CompiledRules, id: string): number {
  return c.owned.get(id)?.stacks ?? 0;
}

export function compileRules(rules: EncounterRules): CompiledRules {
  const cached = cache.get(rules);
  if (cached) return cached;

  const owned = new Map<string, OwnedUpgrade>();
  const defs = new Map<string, UpgradeDef>();
  const sorted = rules.upgrades
    .filter((u) => u.stacks > 0 && hasUpgradeDef(u.id))
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const u of sorted) {
    owned.set(u.id, u);
    defs.set(u.id, upgradeDef(u.id));
  }

  const playerMoveMods: CompiledMoveMod[] = [];
  const hooks: Partial<Record<GameEventType, HookSubscriber[]>> = {};
  const counterDefs = new Map<string, CounterDef & { upgradeId: string }>();
  let promotionRank = 8;
  let reserveDeploys = 1;
  let heavyQueenRange: number | null = null;
  let crackedFormation = 0;
  let delayedReinforcement = 0;
  let slowCommand = false;
  let royalCurse = false;

  for (const u of sorted) {
    const def = defs.get(u.id)!;
    for (const mod of def.moveModifiers ?? []) {
      playerMoveMods.push({
        upgradeId: u.id,
        stacks: u.stacks,
        order: u.order,
        def: mod,
        types: Array.isArray(mod.pieceType) ? mod.pieceType : [mod.pieceType],
      });
    }
    (def.hooks ?? []).forEach((hook, hookIndex) => {
      const list = (hooks[hook.event] ??= []);
      list.push({ upgradeId: u.id, name: def.name, stacks: u.stacks, order: u.order, priority: hook.priority ?? 0, hook, hookIndex });
    });
    for (const c of def.counters ?? []) counterDefs.set(c.id, { ...c, upgradeId: u.id });
    if (def.promotion) {
      promotionRank = Math.max(def.promotion.minRank, promotionRank + evalNum(def.promotion.rankDelta, u.stacks));
    }
    if (def.reserveDeploys !== undefined) reserveDeploys += evalNum(def.reserveDeploys, u.stacks);
    switch (def.debuff) {
      case 'heavyQueen':
        heavyQueenRange = Math.max(2, 5 - u.stacks);
        break;
      case 'crackedFormation':
        crackedFormation += u.stacks;
        break;
      case 'delayedReinforcement':
        delayedReinforcement += u.stacks;
        break;
      case 'slowCommand':
        slowCommand = true;
        break;
      case 'royalCurse':
        royalCurse = true;
        break;
      default:
        break;
    }
  }

  // D4 ordering: priority → acquisition order → upgrade id → hook index.
  for (const list of Object.values(hooks)) {
    list!.sort(
      (a, b) => a.priority - b.priority || a.order - b.order || a.upgradeId.localeCompare(b.upgradeId) || a.hookIndex - b.hookIndex,
    );
  }

  const affixes = rules.affixes.map((id) => affixDef(id));
  const hasty = affixes.reduce((n, a) => n + (a.hastyPromotion ?? 0), 0);

  const compiled: CompiledRules = {
    owned,
    defs,
    playerMoveMods,
    hooks,
    promotionRankPlayer: promotionRank - 1,
    promotionRankEnemy: Math.min(3, hasty),
    reserveDeploysPerTurn: reserveDeploys,
    heavyQueenRange,
    crackedFormation,
    delayedReinforcement,
    slowCommand,
    royalCurse,
    affixes,
    counterDefs,
  };
  cache.set(rules, compiled);
  return compiled;
}
