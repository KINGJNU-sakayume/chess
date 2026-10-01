import type { ReactNode } from 'react';
import type { SquareType, Terrain } from '../../engine/core/state';
import { SQUARE_STYLE } from './squareStyle';

/** Square tints and icons for board mutations, terrain and objective markers. */

const ICONS: Record<SquareType, ReactNode> = {
  CRIMSON: <path d="M50 18 L78 50 L50 82 L22 50 Z M50 34 L62 50 L50 66 L38 50 Z" fillRule="evenodd" />,
  BISHOP_ALTAR: (
    <g>
      <rect x="45" y="18" width="10" height="64" rx="2" />
      <rect x="30" y="34" width="40" height="10" rx="2" />
      <rect x="26" y="74" width="48" height="8" rx="2" />
    </g>
  ),
  KNIGHT_GATE: (
    <g fill="none" strokeWidth="9">
      <circle cx="50" cy="50" r="28" stroke="currentColor" strokeDasharray="22 10" />
      <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" />
    </g>
  ),
  ROOK_RAIL: (
    <g>
      <rect x="10" y="38" width="80" height="7" rx="2" />
      <rect x="10" y="55" width="80" height="7" rx="2" />
    </g>
  ),
  PROMOTION: <path d="M50 14 L59 40 L87 40 L64 57 L73 84 L50 67 L27 84 L36 57 L13 40 L41 40 Z" />,
  ROYAL: <path d="M18 70 L22 32 L38 50 L50 26 L62 50 L78 32 L82 70 Z M18 76 H82 V84 H18 Z" />,
  CURSED: (
    <g>
      <circle cx="50" cy="44" r="22" />
      <rect x="38" y="60" width="24" height="16" rx="4" />
      <circle cx="42" cy="44" r="6" fill="#1a0b22" />
      <circle cx="58" cy="44" r="6" fill="#1a0b22" />
    </g>
  ),
  SANCTUARY: <path d="M50 14 L80 26 V50 C80 68 66 80 50 88 C34 80 20 68 20 50 V26 Z" />,
  CONSECRATED: (
    <g>
      <circle cx="50" cy="50" r="10" />
      <path d="M50 16 V30 M50 70 V84 M16 50 H30 M70 50 H84 M26 26 L36 36 M64 64 L74 74 M74 26 L64 36 M36 64 L26 74" stroke="currentColor" strokeWidth="6" />
    </g>
  ),
  ENEMY_SANCTUARY: <path d="M50 14 L80 26 V50 C80 68 66 80 50 88 C34 80 20 68 20 50 V26 Z M50 30 V62 M38 46 H62" />,
  PROFANE: <path d="M20 80 L80 20 M20 20 L80 80" stroke="currentColor" strokeWidth="10" />,
};

export function MarkIcon({ type, dimmed, label }: { type: SquareType; dimmed?: boolean; label?: string }) {
  const style = SQUARE_STYLE[type];
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: dimmed ? 0.35 : 1 }}>
      <div className="absolute inset-0" style={{ background: style.tint, mixBlendMode: 'multiply' }} />
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 0 2px ${style.color}55` }} />
      {type === 'ROOK_RAIL' ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ color: style.color, opacity: 0.55 }} fill="currentColor">
          {ICONS[type]}
        </svg>
      ) : (
        <svg
          viewBox="0 0 100 100"
          className="absolute right-[4%] top-[4%] h-[34%] w-[34%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
          style={{ color: style.color }}
          fill="currentColor"
        >
          {ICONS[type]}
        </svg>
      )}
      {label ? (
        <span
          className="absolute bottom-[3%] left-[5%] rounded px-[3px] text-[clamp(8px,1.2vmin,11px)] font-bold leading-tight"
          style={{ background: 'rgba(0,0,0,0.55)', color: style.color }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function TerrainArt({ type }: { type: Terrain }) {
  if (type === 'WALL') {
    return (
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg,#5d5868,#3b3644)' }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <g stroke="#2a2531" strokeWidth="3" fill="none">
            <path d="M0 33 H100 M0 66 H100 M33 0 V33 M70 0 V33 M18 33 V66 M55 33 V66 M85 33 V66 M33 66 V100 M70 66 V100" />
          </g>
          <rect x="0" y="0" width="100" height="100" fill="none" stroke="#1b1720" strokeWidth="4" />
        </svg>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <g fill="#6b5f57" stroke="#3a312c" strokeWidth="3">
          <path d="M18 70 L30 52 L46 58 L50 76 L32 82 Z" />
          <path d="M52 44 L66 30 L80 40 L76 58 L60 60 Z" />
          <path d="M56 70 L70 66 L80 78 L66 86 Z" />
          <path d="M22 30 L34 24 L40 36 L30 42 Z" />
        </g>
      </svg>
    </div>
  );
}

export function ExitMarker() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(80, 220, 140, 0.28)', boxShadow: 'inset 0 0 0 3px rgba(120,255,170,0.65)' }}>
      <svg viewBox="0 0 100 100" className="absolute left-[30%] top-[8%] h-[40%] w-[40%]" fill="#c6ffd9">
        <path d="M50 10 L82 46 H62 V86 H38 V46 H18 Z" />
      </svg>
    </div>
  );
}

export function ControlMarker({ controlled }: { controlled: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-[8%] rounded-full"
      style={{ border: `3px dashed ${controlled ? 'rgba(120,255,170,0.9)' : 'rgba(255,230,140,0.8)'}` }}
    />
  );
}

export function DeployZone() {
  return <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 0 2px rgba(94,200,214,0.35)' }} />;
}

export function ArrivalMarker({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-[10%] flex items-center justify-center rounded-md border-2 border-dashed border-blood-400/80 bg-blood-600/20">
      <span className="text-[clamp(8px,1.3vmin,12px)] font-bold text-blood-300">{label}</span>
    </div>
  );
}
