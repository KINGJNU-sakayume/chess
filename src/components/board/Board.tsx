import { memo, useMemo, type ReactNode } from 'react';
import { PieceSvg, type UiPieceType } from './PieceSvg';

/**
 * Presentational chessboard. It knows nothing about rules: callers pass view
 * models (pieces, square decorations, arrows) and receive clicks. Squares are
 * 0..63 (a1 = 0); `flipped` puts Black at the bottom.
 */
export type BoardSide = 'white' | 'black';

export interface BoardPieceView {
  id: string;
  type: UiPieceType;
  side: BoardSide;
  sq: number;
  /** Rendered on top of the piece (shields, frost, badges). */
  overlay?: ReactNode;
  /** Rendered beneath the piece (glows). */
  underlay?: ReactNode;
  dim?: boolean;
}

export type MoveDot = 'move' | 'capture' | 'danger' | 'danger-capture' | 'special' | 'target';

export interface BoardSquareView {
  tone?: 'selected' | 'last' | 'check' | 'hover' | 'target';
  dot?: MoveDot;
  /** Decorations inside the square, beneath pieces (terrain). */
  decor?: ReactNode;
  /** Decorations above pieces. */
  top?: ReactNode;
  tint?: string;
  title?: string;
}

export interface BoardArrow {
  from: number;
  to: number;
  color: string;
  dashed?: boolean;
  opacity?: number;
}

interface BoardProps {
  pieces: BoardPieceView[];
  squares?: Partial<Record<number, BoardSquareView>>;
  arrows?: BoardArrow[];
  onSquareClick?: (sq: number) => void;
  onSquareHover?: (sq: number | null) => void;
  flipped?: boolean;
  showCoords?: boolean;
  /** Move animation duration in ms (0 = instant). */
  moveMs?: number;
  /** Effect layer drawn above everything except click targets. */
  fx?: ReactNode;
  className?: string;
}

const FILES = 'abcdefgh';
const pct = (n: number) => `${n * 12.5}%`;

function dotNode(dot: MoveDot) {
  switch (dot) {
    case 'capture':
      return <div className="absolute inset-[6%] rounded-full border-[5px] border-blood-500/75" />;
    case 'danger':
      return <div className="absolute inset-[35%] rounded-full bg-blood-500/80 shadow-[0_0_8px_rgba(201,65,58,0.8)]" />;
    case 'danger-capture':
      return <div className="absolute inset-[6%] rounded-full border-[5px] border-dashed border-blood-400/90" />;
    case 'special':
      return <div className="absolute inset-[32%] rotate-45 bg-gold-400/85 shadow-[0_0_10px_rgba(232,196,106,0.9)]" />;
    case 'target':
      return (
        <div className="absolute inset-[10%] animate-pulse rounded-lg border-[3px] border-arcane-300/90 bg-arcane-400/15 shadow-[0_0_14px_rgba(94,200,214,0.7)]" />
      );
    default:
      return <div className="absolute inset-[35%] rounded-full bg-ink-900/40" />;
  }
}

const TONES: Record<NonNullable<BoardSquareView['tone']>, string> = {
  selected: 'rgba(232, 196, 106, 0.55)',
  last: 'rgba(205, 210, 120, 0.38)',
  check: 'rgba(201, 65, 58, 0.6)',
  hover: 'rgba(255, 255, 255, 0.16)',
  target: 'rgba(94, 200, 214, 0.25)',
};

function BoardImpl({
  pieces,
  squares = {},
  arrows = [],
  onSquareClick,
  onSquareHover,
  flipped = false,
  showCoords = true,
  moveMs = 180,
  fx,
  className = '',
}: BoardProps) {
  const col = (sq: number) => (flipped ? 7 - (sq & 7) : sq & 7);
  const row = (sq: number) => (flipped ? sq >> 3 : 7 - (sq >> 3));

  const squareNodes = useMemo(() => {
    const out: ReactNode[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const light = ((sq & 7) + (sq >> 3)) % 2 === 1;
      const view = squares[sq];
      const c = flipped ? 7 - (sq & 7) : sq & 7;
      const r = flipped ? sq >> 3 : 7 - (sq >> 3);
      out.push(
        <div
          key={sq}
          className="absolute"
          style={{
            left: pct(c),
            top: pct(r),
            width: '12.5%',
            height: '12.5%',
            background: light ? 'var(--color-board-light)' : 'var(--color-board-dark)',
          }}
        >
          {view?.tint ? <div className="absolute inset-0" style={{ background: view.tint }} /> : null}
          {view?.tone ? <div className="absolute inset-0" style={{ background: TONES[view.tone] }} /> : null}
          {view?.decor}
          {showCoords && c === 0 ? (
            <span
              className="pointer-events-none absolute left-[4%] top-[2%] text-[clamp(8px,1.4vmin,12px)] font-semibold"
              style={{ color: light ? 'var(--color-board-dark)' : 'var(--color-board-light)' }}
            >
              {(sq >> 3) + 1}
            </span>
          ) : null}
          {showCoords && r === 7 ? (
            <span
              className="pointer-events-none absolute bottom-[1%] right-[5%] text-[clamp(8px,1.4vmin,12px)] font-semibold"
              style={{ color: light ? 'var(--color-board-dark)' : 'var(--color-board-light)' }}
            >
              {FILES[sq & 7]}
            </span>
          ) : null}
        </div>,
      );
    }
    return out;
  }, [squares, showCoords, flipped]);

  return (
    <div
      className={`relative aspect-square w-full select-none overflow-hidden rounded-[6px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-black/40 ${className}`}
      onMouseLeave={() => onSquareHover?.(null)}
    >
      {squareNodes}
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
          {/* Keyed by type: a piece that appears or transforms replays its entrance. */}
          <div
            key={p.type}
            className={`absolute inset-0 ${moveMs > 0 ? 'piece-enter' : ''}`}
            style={moveMs > 0 ? { animationDuration: `${Math.round(moveMs * 1.8)}ms` } : undefined}
          >
            {p.underlay}
            <PieceSvg type={p.type} side={p.side} className="absolute inset-[7%] h-[86%] w-[86%] drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]" />
            {p.overlay}
          </div>
        </div>
      ))}
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
      {arrows.length > 0 ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 800" style={{ zIndex: 25 }}>
          <defs>
            {arrows.map((a, i) => (
              <marker key={i} id={`arrowhead-${i}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
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
            const ex = x2 - ((x2 - x1) / len) * 26;
            const ey = y2 - ((y2 - y1) / len) * 26;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={ex}
                y2={ey}
                stroke={a.color}
                strokeWidth={14}
                strokeLinecap="round"
                strokeDasharray={a.dashed ? '18 16' : undefined}
                markerEnd={`url(#arrowhead-${i})`}
                opacity={a.opacity ?? 0.85}
              />
            );
          })}
        </svg>
      ) : null}
      {fx}
      <div className="absolute inset-0" style={{ zIndex: 30 }}>
        {Array.from({ length: 64 }, (_, sq) => (
          <button
            key={sq}
            type="button"
            aria-label={`${FILES[sq & 7]}${(sq >> 3) + 1}`}
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
