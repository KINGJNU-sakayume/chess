import type { MatchEvent, MatchEventKind } from '../../engine/match/match';

/**
 * Short effects for what the last action did, drawn over the board: a ring
 * or burst on the square and a rising label. Keyed by the action count, so
 * every new action replays its effects.
 */
const STYLE: Record<MatchEventKind, { color: string; label?: string; burst?: boolean }> = {
  capture: { color: '#e5675d', burst: true },
  bounce: { color: '#5ec8d6', label: '막힘!' },
  trap: { color: '#ff9b4a', label: '함정!', burst: true },
  martyr: { color: '#ff7a5a', label: '순교!', burst: true },
  promote: { color: '#f3d98f', label: '승진!' },
  wall: { color: '#b5aac2', label: '파괴!', burst: true },
  oath: { color: '#9fe6f0', label: '맹세!' },
  card: { color: '#b48cff' },
  check: { color: '#f2958c', label: '체크!' },
};

export function Fx({ events, stamp, flipped, durationMs }: { events: MatchEvent[]; stamp: number; flipped: boolean; durationMs: number }) {
  if (durationMs === 0 || events.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 28 }}>
      {events.map((e, i) => {
        if (e.sq < 0) return null;
        const s = STYLE[e.kind];
        const col = flipped ? 7 - (e.sq & 7) : e.sq & 7;
        const row = flipped ? e.sq >> 3 : 7 - (e.sq >> 3);
        const delay = i * 90;
        return (
          <div
            key={`${stamp}-${i}`}
            className="absolute"
            style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%`, width: '12.5%', height: '12.5%' }}
          >
            <div
              className={`absolute inset-[4%] rounded-full ${s.burst ? 'fx-burst' : 'fx-ring'}`}
              style={{
                border: `4px solid ${s.color}`,
                boxShadow: `0 0 18px ${s.color}`,
                animationDuration: `${durationMs * 3}ms`,
                animationDelay: `${delay}ms`,
              }}
            />
            {s.label ? (
              <div
                className="fx-rise absolute inset-x-[-40%] top-[-28%] text-center text-[clamp(10px,1.8vmin,15px)] font-bold"
                style={{ color: s.color, textShadow: '0 2px 4px rgba(0,0,0,0.9)', animationDuration: `${durationMs * 5}ms`, animationDelay: `${delay}ms` }}
              >
                {s.label}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
