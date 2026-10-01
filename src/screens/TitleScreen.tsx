import { useState } from 'react';
import { useAppStore } from '../state/appStore';
import { hasSavedRun, useRun } from '../state/runStore';
import { PieceSvg } from '../components/board/PieceSvg';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  const run = useRun();
  const [seed, setSeed] = useState('');
  const [saved] = useState(hasSavedRun);
  const startRun = () => {
    const s = seed.trim() || `run-${Date.now().toString(36)}`;
    run.start(s);
    go('run');
  };
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
        {saved ? (
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              if (run.resume()) go('run');
            }}
          >
            Continue run
          </button>
        ) : null}
        <div className="flex gap-2">
          <input
            className="w-0 flex-1 rounded-[10px] border border-ink-600 bg-ink-850 px-3 text-sm text-ink-100 placeholder:text-ink-400"
            placeholder="Seed (optional)"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          <button type="button" className={`btn ${saved ? '' : 'btn-gold'}`} onClick={startRun}>
            New run
          </button>
        </div>
        <button type="button" className="btn" onClick={() => go('sandbox')}>
          Encounter Sandbox
        </button>
        <button type="button" className="btn" onClick={() => go('hotseat')}>
          Hot-seat Test Board
        </button>
      </div>
    </div>
  );
}
