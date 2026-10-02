import { memo, useMemo, type ReactNode } from 'react';
import { fileOf, rankOf, FILES, type Sq } from '../../engine/core/coords';
import type { PieceType, Side } from '../../engine/core/pieces';
import { PieceSvg } from './PieceSvg';

/**
 * Generic presentational chessboard. It knows nothing about rules: callers
 * pass view models (pieces, square decorations, arrows) and receive clicks.
 */
export interface BoardPieceView {
  id: string;
  type: PieceType;
  side: Side;
  sq: Sq;
  /** Optional overlay (wards, statuses, sigils) rendered on top of the piece. */
  overlay?: ReactNode;
  /** Optional underlay (glow, base rings) rendered beneath the piece. */
  underlay?: ReactNode;
  dim?: boolean;
  /** Classes for the piece body (e.g. an idle animation); positioning stays separate. */
  className?: string;
  /** Delay offset (ms) for the body animation, so a crowd does not move in lockstep. */
  phaseMs?: number;
}

export type MoveDot = 'move' | 'capture' | 'pierce' | 'extra' | 'special' | 'deploy' | 'place';

export interface BoardSquareView {
  tone?: 'selected' | 'last' | 'check' | 'hover' | 'target';
  dot?: MoveDot;
  /** Extra decorations rendered inside the square, beneath pieces. */
  decor?: ReactNode;
  /** Decorations rendered above pieces (e.g. intent destination markers). */
  top?: ReactNode;
  tint?: string;
  title?: string;
}

export interface BoardArrow {
  from: Sq;
  to: Sq;
  color: string;
  label?: string;
  dashed?: boolean;
  opacity?: number;
}

interface BoardProps {
  pieces: BoardPieceView[];
  squares?: Partial<Record<Sq, BoardSquareView>>;
  arrows?: BoardArrow[];
  onSquareClick?: (sq: Sq) => void;
  onSquareHover?: (sq: Sq | null) => void;
  showCoords?: boolean;
  /** Move animation duration in ms (0 = instant). */
  moveMs?: number;
  /** Effect layer drawn above pieces and arrows (F5). */
  fx?: ReactNode;
  /** Glow around the board (visual build identity, F4). */
  aura?: string | null;
  className?: string;
}

const pct = (n: number) => `${n * 12.5}%`;
const col = (sq: Sq) => fileOf(sq);
const row = (sq: Sq) => 7 - rankOf(sq);

function dotNode(dot: MoveDot) {
  switch (dot) {
    case 'capture':
      return <div className="absolute inset-[6%] rounded-full border-[5px] border-blood-500/75" />;
    case 'pierce':
      return (
        <div className="absolute inset-[18%] rotate-45 rounded-[22%] border-[4px] border-violet-glow/90 shadow-[0_0_12px_rgba(180,140,255,0.8)]" />
      );
    case 'extra':
      return <div className="absolute inset-[34%] rounded-full bg-arcane-400/85 shadow-[0_0_10px_rgba(94,200,214,0.9)]" />;
    case 'special':
      return <div className="absolute inset-[30%] rotate-45 bg-gold-400/85 shadow-[0_0_10px_rgba(232,196,106,0.9)]" />;
    case 'deploy':
      return <div className="absolute inset-[30%] rounded-md border-[3px] border-dashed border-arcane-300/90" />;
    case 'place':
      return <div className="absolute inset-[7%] rounded-md border-2 border-gold-300/70 bg-gold-300/10" />;
    default:
      return <div className="absolute inset-[35%] rounded-full bg-ink-900/40" />;
  }
}

const TONES: Record<NonNullable<BoardSquareView['tone']>, string> = {
  selected: 'rgba(232, 196, 106, 0.55)',
  last: 'rgba(205, 210, 120, 0.38)',
  check: 'rgba(201, 65, 58, 0.55)',
  hover: 'rgba(255, 255, 255, 0.16)',
  target: 'rgba(201, 65, 58, 0.28)',
};

function BoardImpl({
  pieces,
  squares = {},
  arrows = [],
  onSquareClick,
  onSquareHover,
  showCoords = true,
  moveMs = 180,
  fx,
  aura = null,
  className = '',
}: BoardProps) {
  const squareNodes = useMemo(() => {
    const out: ReactNode[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
      const view = squares[sq];
      out.push(
        <div
          key={sq}
          data-sq={sq}
          className="absolute"
          style={{
            left: pct(col(sq)),
            top: pct(row(sq)),
            width: '12.5%',
            height: '12.5%',
            background: light ? 'var(--color-board-light)' : 'var(--color-board-dark)',
          }}
        >
          {view?.tint ? <div className="absolute inset-0" style={{ background: view.tint }} /> : null}
          {view?.tone ? <div className="absolute inset-0" style={{ background: TONES[view.tone] }} /> : null}
          {view?.decor}
          {showCoords && fileOf(sq) === 0 ? (
            <span
              className="pointer-events-none absolute left-[4%] top-[2%] text-[clamp(8px,1.4vmin,12px)] font-semibold"
              style={{ color: light ? 'var(--color-board-dark)' : 'var(--color-board-light)' }}
            >
              {rankOf(sq) + 1}
            </span>
          ) : null}
          {showCoords && rankOf(sq) === 0 ? (
            <span
              className="pointer-events-none absolute bottom-[1%] right-[5%] text-[clamp(8px,1.4vmin,12px)] font-semibold"
              style={{ color: light ? 'var(--color-board-dark)' : 'var(--color-board-light)' }}
            >
              {FILES[fileOf(sq)]}
            </span>
          ) : null}
        </div>,
      );
    }
    return out;
  }, [squares, showCoords]);

  return (
    <div
      className={`relative aspect-square w-full select-none overflow-hidden rounded-[6px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-black/40 ${className}`}
      style={aura ? { boxShadow: `0 18px 50px rgba(0,0,0,0.55), 0 0 0 2px rgba(${aura}, 0.55), 0 0 36px rgba(${aura}, 0.35)` } : undefined}
      onMouseLeave={() => onSquareHover?.(null)}
    >
      {squareNodes}
      {/* Pieces */}
      {pieces.map((p) => (
        <div
          key={p.id}
          className="pointer-events-none absolute left-0 top-0 h-[12.5%] w-[12.5%]"
          style={{
            transform: `translate(${col(p.sq) * 100}%, ${row(p.sq) * 100}%)`,
            transition: moveMs > 0 ? `transform ${moveMs}ms cubic-bezier(.3,.7,.3,1)` : 'none',
            opacity: p.dim ? 0.45 : 1,
            zIndex: 10,
          }}
        >
          {/* Pieces drop in when they first appear (deployment, reinforcements) and pop when they
              transform (promotion): keyed by type, the body remounts and replays. Skipped at Instant. */}
          <div
            key={p.type}
            className={`absolute inset-0 ${moveMs > 0 ? 'piece-enter' : ''}`}
            style={moveMs > 0 ? { animationDuration: `${Math.round(moveMs * 1.8)}ms`, animationDelay: `${Math.round(((fileOf(p.sq) + rankOf(p.sq)) * 18 * moveMs) / 220)}ms` } : undefined}
          >
            <div className={`absolute inset-0 ${p.className ?? ''}`} style={p.phaseMs ? { animationDelay: `-${p.phaseMs}ms` } : undefined}>
              {p.underlay}
              <PieceSvg
                type={p.type}
                side={p.side}
                className="absolute inset-[7%] h-[86%] w-[86%] drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]"
              />
              {p.overlay}
            </div>
          </div>
        </div>
      ))}
      {/* Move dots and top decorations */}
      {Object.entries(squares).map(([key, view]) =>
        view && (view.dot || view.top) ? (
          <div
            key={`top-${key}`}
            className="pointer-events-none absolute"
            style={{ left: pct(col(Number(key))), top: pct(row(Number(key))), width: '12.5%', height: '12.5%', zIndex: 20 }}
          >
            {view.dot ? dotNode(view.dot) : null}
            {view.top}
          </div>
        ) : null,
      )}
      {/* Arrows */}
      {arrows.length > 0 ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 800" style={{ zIndex: 25 }}>
          <defs>
            {arrows.map((a, i) => (
              <marker
                key={i}
                id={`arrowhead-${i}`}
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="3.2"
                markerHeight="3.2"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={a.color} />
              </marker>
            ))}
          </defs>
          {arrows.map((a, i) => {
            const x1 = col(a.from) * 100 + 50;
            const y1 = row(a.from) * 100 + 50;
            const x2 = col(a.to) * 100 + 50;
            const y2 = row(a.to) * 100 + 50;
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const shorten = 26;
            const ex = x2 - ((x2 - x1) / len) * shorten;
            const ey = y2 - ((y2 - y1) / len) * shorten;
            return (
              <g key={i} opacity={a.opacity ?? 0.9}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={ex}
                  y2={ey}
                  stroke={a.color}
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeDasharray={a.dashed ? '18 16' : undefined}
                  markerEnd={`url(#arrowhead-${i})`}
                />
                {a.label ? (
                  <g transform={`translate(${x1}, ${y1})`}>
                    <circle r={17} fill="#15111b" stroke={a.color} strokeWidth={4} />
                    <text textAnchor="middle" dy="7" fontSize="20" fontWeight={700} fill="#fff">
                      {a.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {fx}
      {/* Click targets */}
      <div className="absolute inset-0" style={{ zIndex: 30 }}>
        {Array.from({ length: 64 }, (_, sq) => (
          <button
            key={sq}
            type="button"
            aria-label={`square ${FILES[fileOf(sq)]}${rankOf(sq) + 1}`}
            title={squares[sq]?.title}
            className="absolute cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            style={{ left: pct(col(sq)), top: pct(row(sq)), width: '12.5%', height: '12.5%' }}
            onClick={() => onSquareClick?.(sq)}
            onMouseEnter={() => onSquareHover?.(sq)}
          />
        ))}
      </div>
    </div>
  );
}

export const Board = memo(BoardImpl);
