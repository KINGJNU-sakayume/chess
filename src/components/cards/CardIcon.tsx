import type { ReactNode } from 'react';
import type { CardIcon as IconKey } from '../../engine/augments/cards';
import { KnightEmblem, PieceGlyph, type UiPieceType } from '../board/PieceSvg';

/**
 * Card art: a piece silhouette and/or a symbol, drawn in a 100×100 box.
 * Accents use `currentColor`, so the tier colour flows in from the card.
 */
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const thin = { ...line, strokeWidth: 4.5 } as const;

function Piece({ type, x = 8, y = 14, size = 74, side = 'white' }: { type: UiPieceType; x?: number; y?: number; size?: number; side?: 'white' | 'black' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <PieceGlyph type={type} side={side} />
    </g>
  );
}

const Plus = ({ x, y, r = 11 }: { x: number; y: number; r?: number }) => <path {...line} d={`M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}`} />;
const Badge = ({ x, y, text, size = 26 }: { x: number; y: number; text: string; size?: number }) => (
  <text x={x} y={y} fontSize={size} fontWeight={800} textAnchor="middle" fill="currentColor" stroke="#15111b" strokeWidth={1.5} paintOrder="stroke">
    {text}
  </text>
);
const ShieldPath = 'M50 10 L80 22 V46 C80 66 67 81 50 90 C33 81 20 66 20 46 V22 Z';
const SmallShield = ({ x, y, s = 0.42 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d={ShieldPath} fill="currentColor" stroke="#15111b" strokeWidth={6} strokeLinejoin="round" />
  </g>
);

const ICONS: Record<IconKey, ReactNode> = {
  camel: (
    <>
      <Piece type="knight" x={4} />
      <Badge x={80} y={34} text="3" size={34} />
    </>
  ),
  cross: (
    <>
      <Piece type="bishop" x={4} />
      <Plus x={78} y={28} />
    </>
  ),
  tower: (
    <>
      <Piece type="rook" x={4} />
      <path {...line} d="M66 40 L88 18 M74 18 H88 V32" />
    </>
  ),
  sidestep: (
    <>
      <Piece type="pawn" x={13} y={6} size={74} />
      <path {...line} d="M14 86 H86 M24 76 L14 86 L24 96 M76 76 L86 86 L76 96" />
    </>
  ),
  charge: (
    <>
      <Piece type="pawn" x={2} />
      <path {...line} d="M68 38 L80 26 L92 38 M68 58 L80 46 L92 58" />
    </>
  ),
  pike: (
    <>
      <Piece type="pawn" x={2} />
      <path {...thin} d="M80 88 V20" />
      <path d="M80 6 L90 26 H70 Z" fill="currentColor" />
    </>
  ),
  retreat: (
    <>
      <Piece type="pawn" x={2} />
      <path {...line} d="M80 22 V70 M68 58 L80 70 L92 58" />
    </>
  ),
  'pawn-plus': (
    <>
      <Piece type="pawn" x={2} />
      <Plus x={80} y={28} />
    </>
  ),
  crosshair: (
    <>
      <circle cx={50} cy={50} r={28} {...line} />
      <circle cx={50} cy={50} r={6} fill="currentColor" />
      <path {...line} d="M50 8 V30 M50 70 V92 M8 50 H30 M70 50 H92" />
    </>
  ),
  shield: (
    <>
      <path d={ShieldPath} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
      <path {...thin} d="M50 24 V76 M34 40 H66" />
    </>
  ),
  wall: (
    <>
      <path {...line} d="M12 24 H88 V80 H12 Z M12 43 H88 M12 62 H88 M36 24 V43 M64 24 V43 M24 43 V62 M50 43 V62 M76 43 V62 M36 62 V80 M64 62 V80" />
    </>
  ),
  oath: (
    <>
      <Piece type="knight" x={2} />
      <SmallShield x={56} y={6} />
    </>
  ),
  coin: (
    <>
      <ellipse cx={50} cy={70} rx={30} ry={11} {...line} />
      <path {...line} d="M20 70 V58 M80 70 V58" />
      <ellipse cx={50} cy={58} rx={30} ry={11} {...line} />
      <ellipse cx={50} cy={34} rx={22} ry={22} {...line} />
      <path {...thin} d="M50 22 V46 M42 28 H56 Q60 34 50 34 Q40 34 44 40 H58" />
    </>
  ),
  mitre: <Piece type="archbishop" x={13} y={10} size={78} />,
  scroll: <Piece type="chancellor" x={13} y={10} size={78} />,
  'king-sword': (
    <>
      <Piece type="king" x={2} />
      <path {...line} d="M66 86 L92 24 M76 70 L90 76" />
    </>
  ),
  'crown-shield': (
    <>
      <path d={ShieldPath} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
      <path d="M34 58 L32 34 L42 44 L50 30 L58 44 L68 34 L66 58 Z" fill="currentColor" />
    </>
  ),
  snowflake: (
    <>
      <path {...line} d="M50 10 V90 M15 30 L85 70 M15 70 L85 30" />
      <path {...thin} d="M40 16 L50 26 L60 16 M40 84 L50 74 L60 84 M16 42 L27 36 L22 24 M84 58 L73 64 L78 76 M16 58 L27 64 L22 76 M84 42 L73 36 L78 24" />
    </>
  ),
  flame: (
    <>
      <Piece type="pawn" x={-2} y={22} size={64} />
      <path
        d="M72 8 C76 22 92 30 90 52 C89 66 80 74 70 74 C58 74 50 66 50 54 C50 44 56 38 60 32 C60 42 64 46 68 46 C66 34 62 22 72 8 Z"
        fill="currentColor"
      />
    </>
  ),
  horse: (
    <>
      <Piece type="knight" x={2} />
      <Plus x={80} y={28} />
    </>
  ),
  'star-up': (
    <>
      <Piece type="pawn" x={2} y={18} />
      <path d="M78 6 L84 20 L99 21 L87 30 L91 45 L78 37 L65 45 L69 30 L57 21 L72 20 Z" fill="currentColor" />
    </>
  ),
  phoenix: (
    <>
      <Piece type="rook" x={2} y={18} size={70} side="black" />
      <path
        d="M76 8 C80 20 94 26 92 44 C91 56 84 62 76 62 C66 62 60 56 60 46 C60 38 65 33 68 28 C68 36 71 39 74 39 C72 29 69 19 76 8 Z"
        fill="currentColor"
      />
      <path {...thin} d="M76 92 V70 M68 78 L76 70 L84 78" />
    </>
  ),
  mine: (
    <>
      <circle cx={50} cy={56} r={22} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={6} />
      <path {...line} d="M50 22 V10 M50 90 V82 M16 56 H24 M76 56 H84 M26 32 L32 38 M74 32 L68 38 M26 80 L32 74 M74 80 L68 74" />
      <circle cx={50} cy={56} r={7} fill="currentColor" />
    </>
  ),
  guard: (
    <>
      <Piece type="king" x={18} y={18} size={64} />
      <SmallShield x={-4} y={30} s={0.38} />
      <SmallShield x={66} y={30} s={0.38} />
    </>
  ),
  amazon: (
    <>
      <Piece type="queen" x={6} y={6} size={82} />
      <svg x={0} y={0} width={100} height={100} viewBox="0 0 100 100">
        <KnightEmblem cx={76} cy={74} r={18} />
      </svg>
    </>
  ),
  hill: (
    <>
      <path d="M6 88 L38 40 L54 62 L66 48 L94 88 Z" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
      <path {...line} d="M38 40 V10" />
      <path d="M38 10 H62 L56 18 L62 26 H38 Z" fill="currentColor" />
    </>
  ),
  check3: (
    <>
      <Piece type="king" x={2} y={18} size={70} side="black" />
      <Badge x={78} y={46} text="×3" size={30} />
      <path {...thin} d="M60 70 L72 60 M60 86 L80 74" />
    </>
  ),
  cavalry: (
    <>
      <Piece type="archbishop" x={-4} y={22} size={62} />
      <Piece type="archbishop" x={40} y={14} size={66} />
    </>
  ),
  horde: (
    <>
      <Piece type="pawn" x={-6} y={34} size={50} />
      <Piece type="pawn" x={25} y={22} size={54} />
      <Piece type="pawn" x={56} y={34} size={50} />
      <Plus x={50} y={14} r={9} />
    </>
  ),
  grail: (
    <>
      <path d="M28 12 H72 C72 40 62 52 50 52 C38 52 28 40 28 12 Z" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
      <path {...line} d="M50 52 V76 M32 88 H68 M38 76 H62" />
      <path {...thin} d="M40 24 Q50 32 60 24" />
    </>
  ),
  'crown-up': (
    <>
      <Piece type="pawn" x={2} y={20} size={72} />
      <path d="M62 34 L58 10 L68 20 L77 6 L86 20 L96 10 L92 34 Z" fill="currentColor" />
    </>
  ),
  halo: (
    <>
      <ellipse cx={50} cy={16} rx={24} ry={8} {...thin} />
      <path d={ShieldPath} transform="translate(5 14) scale(0.9)" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
      <path {...thin} d="M50 40 V80 M36 54 H64" />
    </>
  ),
  flag: (
    <>
      <Piece type="pawn" x={-2} y={24} size={64} />
      <path {...line} d="M66 92 V10" />
      <path d="M66 10 H94 L86 22 L94 34 H66 Z" fill="currentColor" />
    </>
  ),
};

export function CardIcon({ icon, className }: { icon: IconKey; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {ICONS[icon]}
    </svg>
  );
}
