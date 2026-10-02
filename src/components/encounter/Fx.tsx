import type { CSSProperties, ReactNode } from 'react';
import { fileOf, rankOf, type Sq } from '../../engine/core/coords';
import { fxDuration, type FxEvent, type FxTone } from '../../state/fx';

/**
 * The effect layer (F5): short, skippable animations drawn above the pieces.
 * `scale` stretches every duration and delay (1 at 1×, 0.5 at 2×).
 */
export interface FxItem {
  key: string;
  event: FxEvent;
}

const TONE_RGB: Record<FxTone, string> = {
  bishop: '243, 217, 143',
  slide: '214, 224, 240',
  enemy: '229, 103, 93',
  trigger: '94, 200, 214',
  ward: '125, 220, 235',
  blocked: '159, 230, 240',
  immobile: '190, 230, 255',
  fizzle: '164, 151, 182',
  gold: '243, 217, 143',
  mass: '229, 103, 93',
};

const cx = (sq: Sq) => fileOf(sq) * 12.5 + 6.25;
const cy = (sq: Sq) => (7 - rankOf(sq)) * 12.5 + 6.25;

function timing(e: FxEvent, scale: number, durationMs = fxDuration(e)): CSSProperties {
  return { animationDelay: `${Math.round(e.delay * scale)}ms`, animationDuration: `${Math.round(durationMs * scale)}ms` };
}

function SquareBox({ sq, children, style }: { sq: Sq; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="absolute" style={{ left: `${fileOf(sq) * 12.5}%`, top: `${(7 - rankOf(sq)) * 12.5}%`, width: '12.5%', height: '12.5%', ...style }}>
      {children}
    </div>
  );
}

function Trail({ e, scale }: { e: FxEvent; scale: number }) {
  const from = e.from!;
  const to = e.to!;
  const rgb = TONE_RGB[e.tone ?? 'slide'];
  const x1 = cx(from) * 8;
  const y1 = cy(from) * 8;
  const x2 = cx(to) * 8;
  const y2 = cy(to) * 8;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const bishop = e.tone === 'bishop';
  const steps = bishop ? Math.max(2, Math.round(len / 100)) : 0;
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 800">
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`rgba(${rgb}, ${bishop ? 0.95 : 0.6})`}
        strokeWidth={bishop ? 16 : 9}
        strokeLinecap="round"
        className="fx-trail"
        style={{ ...timing(e, scale), strokeDasharray: len, strokeDashoffset: len, filter: `drop-shadow(0 0 ${bishop ? 10 : 5}px rgba(${rgb}, 0.9))` }}
      />
      {Array.from({ length: steps }, (_, i) => {
        const t = (i + 1) / (steps + 1);
        return (
          <circle
            key={i}
            cx={x1 + (x2 - x1) * t}
            cy={y1 + (y2 - y1) * t}
            r={9}
            fill={`rgba(${rgb}, 1)`}
            className="fx-spark"
            style={{ ...timing({ ...e, delay: e.delay + 260 * t }, scale, 520), filter: `drop-shadow(0 0 8px rgba(${rgb}, 1))` }}
          />
        );
      })}
    </svg>
  );
}

function Capture({ e, scale }: { e: FxEvent; scale: number }) {
  return (
    <SquareBox sq={e.sq!}>
      <div className="fx-ring absolute inset-[12%] rounded-full border-[4px] border-blood-300" style={timing(e, scale)} />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${i * 60 + 15}deg)` }}>
          <div className="fx-shard absolute -left-[3px] -top-[9px] h-[18px] w-[6px] rounded-sm bg-blood-300" style={timing(e, scale)} />
        </div>
      ))}
    </SquareBox>
  );
}

function Pulse({ e, scale }: { e: FxEvent; scale: number }) {
  const rgb = TONE_RGB[e.tone ?? 'trigger'];
  return (
    <SquareBox sq={e.sq!}>
      <div
        className="fx-ring absolute inset-[8%] rounded-full"
        style={{ ...timing(e, scale), border: `4px solid rgba(${rgb}, 0.95)`, boxShadow: `0 0 14px rgba(${rgb}, 0.8), inset 0 0 10px rgba(${rgb}, 0.6)` }}
      />
    </SquareBox>
  );
}

function Popup({ e, scale }: { e: FxEvent; scale: number }) {
  const rgb = TONE_RGB[e.tone ?? 'trigger'];
  const sq = e.sq;
  const lane = (e.lane ?? 0) * 5.5;
  // Keep labels on the board: centre them at most 11% from either edge.
  const style: CSSProperties =
    sq === undefined
      ? { left: '50%', top: `${8 + lane}%` }
      : { left: `${Math.min(89, Math.max(11, cx(sq)))}%`, top: `${Math.max(3, cy(sq) - 8 - lane)}%` };
  return (
    <div className="absolute" style={style}>
      <div
        className="fx-rise -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[clamp(10px,1.5vmin,13px)] font-bold text-white"
        style={{ ...timing(e, scale), background: `rgba(${rgb}, 0.22)`, border: `1px solid rgba(${rgb}, 0.8)`, textShadow: '0 1px 2px rgba(0,0,0,0.9)', backdropFilter: 'blur(2px)' }}
      >
        {e.text}
      </div>
    </div>
  );
}

function Promotion({ e, scale }: { e: FxEvent; scale: number }) {
  const rgb = TONE_RGB[e.tone ?? 'gold'];
  return (
    <SquareBox sq={e.sq!}>
      <div className="fx-burst absolute inset-[-30%]" style={{ ...timing(e, scale), background: `conic-gradient(from 0deg, transparent 0 8%, rgba(${rgb},0.75) 10%, transparent 12% 20%, rgba(${rgb},0.75) 22%, transparent 24% 33%, rgba(${rgb},0.75) 35%, transparent 37% 45%, rgba(${rgb},0.75) 47%, transparent 49% 58%, rgba(${rgb},0.75) 60%, transparent 62% 70%, rgba(${rgb},0.75) 72%, transparent 74% 83%, rgba(${rgb},0.75) 85%, transparent 87% 100%)`, maskImage: 'radial-gradient(circle, black 30%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)' }} />
      <div className="fx-ring absolute inset-[4%] rounded-full" style={{ ...timing(e, scale), border: `5px solid rgba(${rgb}, 1)`, boxShadow: `0 0 18px rgba(${rgb}, 1)` }} />
    </SquareBox>
  );
}

function Flash({ e, scale }: { e: FxEvent; scale: number }) {
  const rgb = TONE_RGB[e.tone ?? 'gold'];
  const at = e.sq !== undefined ? `${cx(e.sq)}% ${cy(e.sq)}%` : '50% 50%';
  return <div className="fx-flash absolute inset-0" style={{ ...timing(e, scale), background: `radial-gradient(circle at ${at}, rgba(${rgb}, 0.65), rgba(${rgb}, 0.18) 45%, transparent 75%)` }} />;
}

function Extra({ e, scale }: { e: FxEvent; scale: number }) {
  const sq = e.sq;
  return (
    <>
      {sq !== undefined ? (
        <SquareBox sq={sq}>
          <div className="fx-spin absolute inset-[-6%] rounded-full" style={{ ...timing(e, scale, 800), border: '4px dashed rgba(243, 217, 143, 0.95)', boxShadow: '0 0 16px rgba(232, 196, 106, 0.9)' }} />
        </SquareBox>
      ) : null}
      <Popup e={{ ...e, tone: 'gold' }} scale={scale} />
    </>
  );
}

export function FxLayer({ items, scale }: { items: FxItem[]; scale: number }) {
  if (!items.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 27 }}>
      {items.map(({ key, event: e }) => {
        switch (e.kind) {
          case 'trail':
            return <Trail key={key} e={e} scale={scale} />;
          case 'capture':
            return <Capture key={key} e={e} scale={scale} />;
          case 'pulse':
            return e.sq !== undefined ? <Pulse key={key} e={e} scale={scale} /> : null;
          case 'popup':
            return <Popup key={key} e={e} scale={scale} />;
          case 'promotion':
            return <Promotion key={key} e={e} scale={scale} />;
          case 'flash':
            return <Flash key={key} e={e} scale={scale} />;
          case 'extra':
            return <Extra key={key} e={e} scale={scale} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
