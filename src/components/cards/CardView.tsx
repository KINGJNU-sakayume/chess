import type { ReactNode } from 'react';
import { CATEGORY_NAME, TIER_NAME, cardById, type Tier } from '../../engine/augments/cards';
import { CardIcon } from './CardIcon';
import { TIER_STYLE } from './tierStyle';


export function TierBadge({ tier, className = '' }: { tier: Tier; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-bold ${TIER_STYLE[tier].badge} ${className}`}>
      {TIER_NAME[tier]}
    </span>
  );
}

export function KindBadge({ id, uses }: { id: string; uses?: number }) {
  const def = cardById(id);
  if (def.kind === 'passive') return <span className="rounded-full bg-ink-700 px-2 py-[1px] text-[11px] text-ink-200">패시브</span>;
  return (
    <span className="rounded-full bg-arcane-500/25 px-2 py-[1px] text-[11px] text-arcane-300">
      {uses === undefined ? `액티브 · ${def.uses}회` : `액티브 · 남은 ${uses}/${def.uses}회`}
    </span>
  );
}

export function CardArt({ id, size = 'h-16 w-16' }: { id: string; size?: string }) {
  const def = cardById(id);
  const t = TIER_STYLE[def.tier];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${size}`}
      style={{ color: t.accent, background: `radial-gradient(circle at 50% 40%, ${t.glow}, rgba(0,0,0,0) 70%), rgba(14,11,18,0.6)` }}
    >
      <CardIcon icon={def.icon} className="h-[82%] w-[82%]" />
    </div>
  );
}

/** A full card (draft offers, codex). */
export function CardView({
  id,
  onClick,
  selected = false,
  footer,
  className = '',
}: {
  id: string;
  onClick?: () => void;
  selected?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const def = cardById(id);
  const t = TIER_STYLE[def.tier];
  const body = (
    <div className="card-inner flex h-full flex-col gap-3 p-4 text-left">
      <div className="flex items-center gap-3">
        <CardArt id={id} />
        <div className="min-w-0">
          <div className="text-lg font-bold leading-tight" style={{ color: t.accent }}>
            {def.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <TierBadge tier={def.tier} />
            <KindBadge id={id} />
            <span className="rounded-full bg-ink-800 px-2 py-[1px] text-[11px] text-ink-300">{CATEGORY_NAME[def.category]}</span>
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink-100">{def.text}</p>
      {footer}
    </div>
  );
  const cls = `tier-frame ${t.frame} block h-full w-full ${selected ? 'card-selected' : ''} ${className}`;
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${cls} card-hover cursor-pointer`}>
      {body}
    </button>
  );
}
