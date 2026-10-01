import { useMemo } from 'react';
import { sqName } from '../../engine/core/coords';
import { PIECE_NAME, type PieceType } from '../../engine/core/pieces';
import { stackedName } from '../../engine/rules/num';
import { affixDef, upgradeDef } from '../../engine/rules/registry';
import type { RunState } from '../../engine/run/types';
import { SQUARE_INFO } from '../../data/squares';
import { RARITY_STYLE } from './rarity';

/** "This is MY chess build": every rule the player has bent, grouped. */
export function BuildPanel({ run, onClose }: { run: RunState; onClose: () => void }) {
  const groups = useMemo(() => {
    const g: Record<string, { id: string; stacks: number }[]> = { piece: [], start: [], mutation: [], debuff: [] };
    for (const u of run.upgrades) g[upgradeDef(u.id).category].push(u);
    return g;
  }, [run.upgrades]);
  const counts = run.roster.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {});
  const section = (title: string, list: { id: string; stacks: number }[]) =>
    list.length ? (
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-ink-400">{title}</div>
        <ul className="space-y-1.5">
          {list.map((u) => {
            const def = upgradeDef(u.id);
            return (
              <li key={u.id} className="text-sm">
                <span className={RARITY_STYLE[def.rarity].text}>{stackedName(def.name, u.stacks)}</span>
                <div className="text-xs text-ink-300">{def.describe(u.stacks)}</div>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="panel h-full w-full max-w-md overflow-y-auto rounded-none p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-gold-300">Your Chess</h2>
          <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mb-4 text-sm text-ink-200">
          Army ({run.roster.length}):{' '}
          {(Object.keys(counts) as PieceType[]).map((t) => `${counts[t]} ${PIECE_NAME[t]}${counts[t] > 1 ? 's' : ''}`).join(', ')}
          <span className="text-ink-400"> · {run.roster.filter((r) => r.sq === null).length} in Reserve</span>
        </div>
        <div className="space-y-4">
          {run.upgrades.length === 0 ? <p className="text-sm text-ink-400">Orthodox chess — for now.</p> : null}
          {section('Piece rules', groups.piece)}
          {section('Starting position', groups.start)}
          {section('Enemy debuffs', groups.debuff)}
          {run.mutations.length ? (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-ink-400">Board ({run.mutations.length} squares)</div>
              <ul className="space-y-0.5 text-sm text-ink-200">
                {run.mutations
                  .filter((m) => !m.id.endsWith('b'))
                  .map((m) => (
                    <li key={m.id}>
                      {SQUARE_INFO[m.type].name}{' '}
                      <span className="text-ink-400">
                        {m.rail ? `${m.rail.axis} ${m.rail.axis === 'file' ? 'abcdefgh'[m.rail.index] : m.rail.index + 1}` : sqName(m.sq)}
                        {m.linkSq !== undefined ? ` ↔ ${sqName(m.linkSq)}` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {run.curses.length ? (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-blood-300">Curses</div>
              <ul className="space-y-0.5 text-sm text-blood-300">
                {run.curses.map((c) => (
                  <li key={c}>
                    {affixDef(c).name} <span className="text-ink-400">— {affixDef(c).description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
