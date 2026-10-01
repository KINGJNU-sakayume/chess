import { useMemo, useState } from 'react';
import { parseSq, sqName } from '../engine/core/coords';
import type { OwnedUpgrade, SquareType } from '../engine/core/state';
import type { PlacedMutation } from '../engine/encounters/setup';
import { allUpgrades } from '../engine/rules/registry';
import { stackedName } from '../engine/rules/num';
import { SQUARE_INFO } from '../data/squares';
import { PanelTitle } from './encounter/Panels';

const RARITY_COLOR: Record<string, string> = {
  common: 'text-ink-200',
  uncommon: 'text-arcane-300',
  rare: 'text-gold-300',
  legendary: 'text-violet-300',
};

const PLACEABLE: SquareType[] = ['CRIMSON', 'BISHOP_ALTAR', 'KNIGHT_GATE', 'ROOK_RAIL', 'PROMOTION', 'ROYAL', 'CURSED', 'SANCTUARY'];

/** Developer panel (M3 acceptance): grant or remove any upgrade or square, then restart the encounter. */
export function DebugPanel({
  upgrades,
  mutations,
  onChange,
}: {
  upgrades: OwnedUpgrade[];
  mutations: PlacedMutation[];
  onChange: (next: { upgrades: OwnedUpgrade[]; mutations: PlacedMutation[] }) => void;
}) {
  const [filter, setFilter] = useState('');
  const [squareType, setSquareType] = useState<SquareType>('CRIMSON');
  const [squareText, setSquareText] = useState('e4');
  const [error, setError] = useState('');
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
    onChange({ upgrades: next, mutations });
  };
  const addSquare = () => {
    try {
      const parts = squareText.trim().toLowerCase().split(/[\s,]+/);
      const id = `dbg${mutations.length}-${Date.now() % 10000}`;
      const upgradeId = `mut_${squareType.toLowerCase()}`;
      let m: PlacedMutation;
      if (squareType === 'ROOK_RAIL') {
        const [axis, val] = parts.length === 2 ? parts : ['rank', parts[0]];
        const index = axis === 'file' ? 'abcdefgh'.indexOf(val) : Number(val) - 1;
        if (index < 0 || index > 7) throw new Error('Use "rank 3" or "file e"');
        m = { id, upgradeId, type: squareType, sq: axis === 'file' ? index : index * 8, rail: { axis: axis === 'file' ? 'file' : 'rank', index } };
      } else if (squareType === 'KNIGHT_GATE') {
        if (parts.length !== 2) throw new Error('Gates need two squares, e.g. "c3 f6"');
        const [a, b] = parts.map(parseSq);
        onChange({
          upgrades,
          mutations: [...mutations, { id, upgradeId, type: squareType, sq: a, linkSq: b }, { id: `${id}b`, upgradeId, type: squareType, sq: b, linkSq: a }],
        });
        setError('');
        return;
      } else {
        m = { id, upgradeId, type: squareType, sq: parseSq(parts[0]) };
      }
      onChange({ upgrades, mutations: [...mutations, m] });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
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
        {defs.map((u) => {
          const s = stacks(u.id);
          return (
            <div key={u.id} className="flex items-center gap-1 text-xs" title={u.describe(Math.max(1, s))}>
              <span className={`flex-1 truncate ${RARITY_COLOR[u.rarity]}`}>{s ? stackedName(u.name, s) : u.name}</span>
              <button type="button" className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" onClick={() => grant(u.id, -1)} disabled={!s}>
                −
              </button>
              <button type="button" className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" onClick={() => grant(u.id, 1)} disabled={!u.stackable && s > 0}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-ink-700 pt-2">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-ink-300">Board squares</div>
        <div className="flex gap-1">
          <select className="flex-1 rounded bg-ink-800 px-1 py-1 text-xs" value={squareType} onChange={(e) => setSquareType(e.target.value as SquareType)}>
            {PLACEABLE.map((t) => (
              <option key={t} value={t}>
                {SQUARE_INFO[t].name}
              </option>
            ))}
          </select>
          <input className="w-20 rounded bg-ink-800 px-1 py-1 text-xs" value={squareText} onChange={(e) => setSquareText(e.target.value)} />
          <button type="button" className="rounded bg-ink-700 px-2 text-xs hover:bg-ink-600" onClick={addSquare}>
            Add
          </button>
        </div>
        {error ? <div className="mt-1 text-[11px] text-blood-300">{error}</div> : null}
        <div className="mt-1 flex flex-wrap gap-1">
          {mutations.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-200 hover:bg-blood-600/40"
              title="Remove"
              onClick={() => onChange({ upgrades, mutations: mutations.filter((x) => x.id !== m.id) })}
            >
              {SQUARE_INFO[m.type].name} {m.rail ? `${m.rail.axis} ${m.rail.axis === 'file' ? 'abcdefgh'[m.rail.index] : m.rail.index + 1}` : sqName(m.sq)} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
