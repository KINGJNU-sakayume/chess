import { upgradeDef } from '../../engine/rules/registry';
import { roman } from '../../engine/rules/num';
import { RARITY_STYLE } from './rarity';

const CATEGORY_LABEL = { piece: 'Piece upgrade', mutation: 'Board mutation', start: 'Starting position', debuff: 'Enemy debuff' } as const;

export function UpgradeCard({
  id,
  owned,
  onPick,
  footer,
  disabled,
}: {
  id: string;
  /** Stacks currently owned (the card shows the next stack). */
  owned: number;
  onPick?: () => void;
  footer?: React.ReactNode;
  disabled?: boolean;
}) {
  const def = upgradeDef(id);
  const next = owned + 1;
  const style = RARITY_STYLE[def.rarity];
  return (
    <button
      type="button"
      disabled={disabled || !onPick}
      onClick={onPick}
      className={`panel group flex h-full w-full flex-col gap-2 border-2 p-4 text-left transition hover:-translate-y-0.5 disabled:hover:translate-y-0 ${style.ring} ${style.glow} ${onPick ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`font-display text-lg leading-tight ${style.text}`}>
            {def.name}
            {def.stackable && owned > 0 ? <span className="ml-1.5 text-sm text-ink-300">→ {roman(next)}</span> : null}
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
            {style.label} · {CATEGORY_LABEL[def.category]}
            {def.stackable ? '' : ' · unique'}
          </div>
        </div>
      </div>
      <p className="text-sm leading-snug text-ink-100">{def.describe(next)}</p>
      {def.stackable && def.stackText ? <p className="text-xs text-ink-300">Stacks: {def.stackText}</p> : null}
      {def.prerequisites.length ? (
        <p className="text-[11px] text-gold-300/80">Requires {def.prerequisites.map((p) => `${p.count}+ ${p.tag} upgrades`).join(', ')}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1 pt-1">
        {def.tags.map((t) => (
          <span key={t} className="rounded bg-ink-700/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-300">
            {t.replace('_', ' ')}
          </span>
        ))}
        {def.primitives.map((p) => (
          <span key={p} className="rounded border border-ink-600 px-1.5 py-0.5 font-mono text-[9px] text-ink-400">
            {p}
          </span>
        ))}
      </div>
      {def.flavor ? <p className="text-[11px] italic text-ink-400">{def.flavor}</p> : null}
      {footer}
    </button>
  );
}
