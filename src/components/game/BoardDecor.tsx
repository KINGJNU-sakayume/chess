import type { Position } from '../../engine/game/position';
import { BISHOP, F_FROZEN, F_SHIELD, KING, KNIGHT, QUEEN, ROOK, WHITE, type Color } from '../../engine/game/types';
import { KnightEmblem } from '../board/PieceSvg';

const augmented = (pos: Position, color: Color, kind: number): boolean => {
  const r = pos.rules[color];
  return (
    (kind === KNIGHT && (r.knightCamel || r.knightOath)) ||
    (kind === BISHOP && r.bishopStep) ||
    (kind === ROOK && r.rookStep) ||
    (kind === KING && r.kingRange > 1)
  );
};

function Snowflake() {
  return (
    <svg viewBox="0 0 24 24" className="absolute right-[4%] top-[4%] h-[30%] w-[30%] drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="#e6f6ff" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function PieceOverlay({ pos, sq }: { pos: Position; sq: number }) {
  const code = pos.board[sq];
  const kind = code & 15;
  const color = (code >> 4) as Color;
  const f = pos.flags[sq];
  const amazon = kind === QUEEN && pos.rules[color].queenKnight;
  return (
    <>
      {f & F_SHIELD ? (
        <div className="shield-ring absolute inset-[2%] rounded-full border-[3px] border-arcane-300 shadow-[0_0_12px_rgba(94,200,214,0.85),inset_0_0_12px_rgba(94,200,214,0.45)]" />
      ) : null}
      {f & F_FROZEN ? (
        <>
          <div className="absolute inset-[3%] rounded-lg bg-sky-200/25 ring-2 ring-sky-100/80" />
          <Snowflake />
        </>
      ) : null}
      {amazon ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <KnightEmblem cx={78} cy={76} r={15} />
        </svg>
      ) : null}
      {augmented(pos, color, kind) ? (
        <div className="absolute left-[6%] top-[6%] h-[16%] w-[16%] rotate-45 rounded-[3px] border border-[#5a4313] bg-gold-400 shadow-[0_0_6px_rgba(232,196,106,0.9)]" />
      ) : null}
    </>
  );
}

export function Wall() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-[4%] h-[92%] w-[92%]">
      <rect x={6} y={12} width={88} height={76} rx={8} fill="#5d5466" stroke="#2a2430" strokeWidth={4} />
      <path d="M6 37H94M6 62H94M34 12V37M66 12V37M20 37V62M50 37V62M80 37V62M34 62V88M66 62V88" stroke="#2a2430" strokeWidth={4} />
      <path d="M10 16H90" stroke="#8b8096" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

export function Trap({ owner }: { owner: Color }) {
  const body = owner === WHITE ? '#f4ecdc' : '#2a2230';
  const rim = owner === WHITE ? '#2a2018' : '#e9dcc8';
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-[18%] h-[64%] w-[64%] opacity-90">
      <path
        d="M50 8 L58 30 L80 20 L70 42 L92 50 L70 58 L80 80 L58 70 L50 92 L42 70 L20 80 L30 58 L8 50 L30 42 L20 20 L42 30 Z"
        fill="#c9413a"
        stroke="#3b0d0b"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx={50} cy={50} r={18} fill={body} stroke={rim} strokeWidth={5} />
    </svg>
  );
}
