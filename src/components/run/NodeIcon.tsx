import type { ReactNode } from 'react';
import type { NodeType } from '../../engine/run/types';

/** Map node glyphs (24×24, stroke-based). */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const GLYPH: Record<NodeType, ReactNode> = {
  battle: (
    <>
      <path {...S} d="M5 4l10.5 10.5M19 4L8.5 14.5" />
      <path {...S} d="M13 17l4-4M11 17l-4-4M15 19l2 2 2-2-2-2M9 19l-2 2-2-2 2-2" />
    </>
  ),
  elite: (
    <>
      <path {...S} d="M4 9l3 3 3-6 2 5 2-5 3 6 3-3-2 9H6z" />
      <path {...S} d="M9 15h.01M15 15h.01" />
    </>
  ),
  event: (
    <>
      <path {...S} d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4" />
      <circle cx={12} cy={18} r={1} fill="currentColor" />
    </>
  ),
  shop: (
    <>
      <path {...S} d="M8 7c0-2 1.8-3 4-3s4 1 4 3M6 8h12l-1 12H7z" />
      <path {...S} d="M12 11v6M10 12.5h3a1.2 1.2 0 0 1 0 2.4h-2a1.2 1.2 0 0 0 0 2.4h3" />
    </>
  ),
  rest: (
    <>
      <path {...S} d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5 1 2 2 2-.5-2-.5-4 0-6z" />
      <path {...S} d="M4 20l16-3M4 17l16 3" />
    </>
  ),
  treasure: (
    <>
      <path {...S} d="M4 10h16v9H4zM4 10a8 5 0 0 1 16 0" />
      <path {...S} d="M4 13h16M11 12h2v3h-2z" />
    </>
  ),
  boss: (
    <>
      <path {...S} d="M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5z" />
      <path {...S} d="M8 16h8" />
    </>
  ),
};

export function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {GLYPH[type]}
    </svg>
  );
}

export function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        fill={filled ? '#e5675d' : 'none'}
        stroke={filled ? '#9c2a25' : '#7a6c8f'}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx={12} cy={12} r={8.5} fill="#e8c46a" stroke="#8c6a22" strokeWidth={1.6} />
      <circle cx={12} cy={12} r={5.5} fill="none" stroke="#a9822f" strokeWidth={1.2} />
    </svg>
  );
}

export function UndoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="#9fe6f0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
