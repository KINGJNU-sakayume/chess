import { AFFIXES } from '../../data/affixes';
import { UPGRADES } from '../../data/upgrades';
import type { AffixDef, UpgradeDef } from './types';

let upgradeIndex: Map<string, UpgradeDef> | null = null;
let affixIndex: Map<string, AffixDef> | null = null;

export function upgradeDef(id: string): UpgradeDef {
  upgradeIndex ??= new Map(UPGRADES.map((u) => [u.id, u]));
  const def = upgradeIndex.get(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return def;
}

export function hasUpgradeDef(id: string): boolean {
  upgradeIndex ??= new Map(UPGRADES.map((u) => [u.id, u]));
  return upgradeIndex.has(id);
}

export function affixDef(id: string): AffixDef {
  affixIndex ??= new Map(AFFIXES.map((a) => [a.id, a]));
  const def = affixIndex.get(id);
  if (!def) throw new Error(`Unknown affix: ${id}`);
  return def;
}

export const allUpgrades = (): readonly UpgradeDef[] => UPGRADES;
export const allAffixes = (): readonly AffixDef[] => AFFIXES;

/** Tests only: register an extra upgrade definition (e.g. trigger-ordering probes). */
export function registerUpgradeForTests(def: UpgradeDef): void {
  upgradeIndex ??= new Map(UPGRADES.map((u) => [u.id, u]));
  upgradeIndex.set(def.id, def);
}
