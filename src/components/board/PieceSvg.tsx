import type { PieceType } from '../../engine/core/pieces';
import { PALETTES, type PiecePalette } from './palettes';

/**
 * Hand-drawn piece silhouettes (100×100 viewBox). The two fairy pieces are
 * drawn as their base piece with a knight emblem: the Archbishop moves as a
 * Bishop and a Knight, the Chancellor as a Rook and a Knight.
 */
export type UiPieceType = PieceType | 'archbishop' | 'chancellor';
export type PieceSide = 'white' | 'black';
const BASE = 'M21 84 Q21 80 25 80 H75 Q79 80 79 84 V92 H21 Z';

const BODY: Record<PieceType, string> = {
  pawn:
    'M50 15 A12.5 12.5 0 1 1 49.99 15 Z ' +
    'M37 41 Q50 37 63 41 L60 48 H40 Z ' +
    'M41 48 H59 Q59 64 69 80 H31 Q41 64 41 48 Z',
  rook:
    'M27 16 H38 V24 H45 V16 H55 V24 H62 V16 H73 V36 Q73 40 69 40 H31 Q27 40 27 36 Z ' +
    'M33 40 H67 L69 76 H31 Z ' +
    'M27 74 H73 V80 H27 Z',
  bishop:
    'M50 7 A5.5 5.5 0 1 1 49.99 7 Z ' +
    'M50 18 C33 30 31 46 38 56 H62 C69 46 67 30 50 18 Z ' +
    'M35 56 H65 Q67 59 65 62 H35 Q33 59 35 56 Z ' +
    'M40 62 H60 Q60 72 70 80 H30 Q40 72 40 62 Z',
  knight:
    'M30 80 C29 68 35 60 44 53 C38 52 30 54 24 51 C17 48 15 43 18 38 L29 24 C31 19 33 13 37 8 L44 18 ' +
    'C59 18 72 29 76 47 C79 61 77 72 74 80 Z',
  queen:
    'M30 62 L20 25 L35 44 L36 18 L45 41 L50 13 L55 41 L64 18 L65 44 L80 25 L70 62 Z ' +
    'M29 62 H71 Q72 66 70 69 H30 Q28 66 29 62 Z ' +
    'M32 69 H68 Q66 75 72 80 H28 Q34 75 32 69 Z',
  king:
    'M46.5 4 H53.5 V11 H60 V17 H53.5 V27 H46.5 V17 H40 V11 H46.5 Z ' +
    'M50 30 C44 26 34 26 30 34 C26 43 30 53 34 60 H66 C70 53 74 43 70 34 C66 26 56 26 50 30 Z ' +
    'M32 60 H68 Q70 64 68 68 H32 Q30 64 32 60 Z ' +
    'M35 68 H65 Q64 75 71 80 H29 Q36 75 35 68 Z',
};

/** Thin interior detail lines drawn in the outline colour. */
const DETAIL: Partial<Record<PieceType, string>> = {
  bishop: 'M55 30 L45 44',
  knight: 'M33 33 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M22 44 L26 43',
  rook: 'M31 40 H69',
  king: 'M50 31 V58',
  queen: '',
};

const QUEEN_BALLS: [number, number][] = [
  [20, 23],
  [36, 15.5],
  [50, 10],
  [64, 15.5],
  [80, 23],
];

/** A small gold medallion with a knight head: "also moves like a Knight". */
export function KnightEmblem({ cx = 74, cy = 70, r = 17 }: { cx?: number; cy?: number; r?: number }) {
  const scale = (r * 2 * 0.8) / 100;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#e8c46a" stroke="#5a4313" strokeWidth={2.4} />
      <path
        d={BODY.knight}
        transform={`translate(${cx - 50 * scale} ${cy - 47 * scale}) scale(${scale})`}
        fill="#2a2018"
        stroke="none"
      />
    </g>
  );
}

/** The piece's shapes in a 100×100 box, for embedding inside another SVG. */
export function PieceGlyph({ type, side, palette }: { type: UiPieceType; side: PieceSide; palette?: PiecePalette }) {
  const p = palette ?? PALETTES[side];
  const base: PieceType = type === 'archbishop' ? 'bishop' : type === 'chancellor' ? 'rook' : type;
  return (
    <>
      <g fill={p.fill} stroke={p.stroke} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        <path d={BASE} />
        <path d={BODY[base]} fillRule="nonzero" />
        {base === 'queen' && QUEEN_BALLS.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r={4.2} />)}
      </g>
      {DETAIL[base] ? (
        <path d={DETAIL[base]} fill={base === 'knight' ? p.detail : 'none'} stroke={p.detail} strokeWidth={2.6} strokeLinecap="round" />
      ) : null}
      {type === 'archbishop' || type === 'chancellor' ? <KnightEmblem /> : null}
    </>
  );
}

export function PieceSvg({
  type,
  side,
  className,
  palette,
}: {
  type: UiPieceType;
  side: PieceSide;
  className?: string;
  palette?: PiecePalette;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <PieceGlyph type={type} side={side} palette={palette} />
    </svg>
  );
}
