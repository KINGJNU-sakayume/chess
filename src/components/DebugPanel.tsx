import { useMemo, useState } from 'react';
import type { OwnedUpgrade } from '../engine/core/state';
import { allUpgrades } from '../engine/rules/registry';
import { stackedName } from '../engine/rules/num';
import { PanelTitle } from './encounter/Panels';

const RARITY_COLOR: Record<string, string> = {
  common: 'text-ink-200',
  uncommon: 'text-arcane-300',
  rare: 'text-gold-300',
  legendary: 'text-violet-300',
};

/** Developer panel (M3 acceptance): grant or remove any upgrade, then restart the encounter. */
export function DebugPanel({ upgrades, onChange }: { upgrades: OwnedUpgrade[]; onChange: (next: OwnedUpgrade[]) => void }) {
  const [filter, setFilter] = useState('');
  const defs = useMemo(
    () =>
      allUpgrades()
        .filter((u) => !u.mutation && !u.choice)
        .filter((u) => !filter || `${u.name} ${u.tags.join(' ')}`.toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );
  const stacks = (id: string) => upgrades.find((u) => u.id === id)?.stacks ?? 0;
  const grant = (id: string, delta: number) => {
    const existing = upgrades.find((u) => u.id === id);
    let next: OwnedUpgrade[];
    if (!existing) next = delta > 0 ? [...upgrades, { id, stacks: 1, order: upgrades.length ? Math.max(...upgrades.map((u) => u.order)) + 1 : 0 }] : upgrades;
    else {
      const s = existing.stacks + delta;
      next = s <= 0 ? upgrades.filter((u) => u.id !== id) : upgrades.map((u) => (u.id === id ? { ...u, stacks: s } : u));
    }
    onChange(next);
  };
  return (
    <div className="panel p-3">
      <PanelTitle right={<span className="text-[10px] text-ink-400">restarts encounter</span>}>Debug: grant upgrades</PanelTitle>
      <input
        className="mb-2 w-full rounded bg-ink-800 px-2 py-1 text-xs"
        placeholder="Filter (name or tag)…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
        {defs.length === 0 ? <div className="text-xs text-ink-400">No upgrades registered yet.</div> : null}
        {defs.map((u) => {
          const s = stacks(u.id);
          return (
            <div key={u.id} className="flex items-center gap-1 text-xs" title={u.describe(Math.max(1, s))}>
              <span className={`flex-1 truncate ${RARITY_COLOR[u.rarity]}`}>{s ? stackedName(u.name, s) : u.name}</span>
              <button type="button" className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" onClick={() => grant(u.id, -1)} disabled={!s}>
                −
              </button>
              <button
                type="button"
                className="rounded bg-ink-700 px-1.5 hover:bg-ink-600"
                onClick={() => grant(u.id, 1)}
                disabled={!u.stackable && s > 0}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
