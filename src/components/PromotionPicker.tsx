import type { PieceType, Side } from '../engine/core/pieces';
import { PIECE_NAME } from '../engine/core/pieces';
import { PieceSvg } from './board/PieceSvg';

export function PromotionPicker({
  side,
  options,
  onPick,
  onCancel,
}: {
  side: Side;
  options: PieceType[];
  onPick: (t: PieceType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="panel flex flex-col items-center gap-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-sm text-gold-300">Promote to</div>
        <div className="flex gap-2">
          {options.map((t) => (
            <button key={t} type="button" className="btn h-20 w-20 flex-col p-1" onClick={() => onPick(t)} title={PIECE_NAME[t]}>
              <PieceSvg type={t} side={side} className="h-12 w-12" />
              <span className="text-[10px] text-ink-200">{PIECE_NAME[t]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
