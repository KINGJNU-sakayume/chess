import { useAppStore } from '../state/appStore';
import { PieceSvg } from '../components/board/PieceSvg';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex items-end gap-1 opacity-90">
        {(['pawn', 'knight', 'bishop', 'king', 'queen', 'rook', 'pawn'] as const).map((t, i) => (
          <PieceSvg key={i} type={t} side={i % 2 ? 'enemy' : 'player'} className={i === 3 ? 'h-20 w-20' : 'h-12 w-12'} />
        ))}
      </div>
      <div>
        <h1 className="font-display text-5xl font-extrabold text-gold-300 drop-shadow-[0_4px_18px_rgba(232,196,106,0.25)] sm:text-6xl">
          Break Chess
        </h1>
        <p className="mt-3 max-w-md text-ink-200">Every run starts as chess. By the end, it's your chess.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button type="button" className="btn btn-gold" onClick={() => go('sandbox')}>
          Encounter Sandbox
        </button>
        <button type="button" className="btn" onClick={() => go('hotseat')}>
          Hot-seat Test Board
        </button>
      </div>
    </div>
  );
}
