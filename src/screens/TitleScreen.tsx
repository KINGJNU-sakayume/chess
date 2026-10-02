import { useState } from 'react';
import { PieceSvg } from '../components/board/PieceSvg';
import { useAppStore } from '../state/appStore';
import { hasSavedGame, useGame } from '../state/gameStore';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  const resume = useGame((s) => s.resume);
  const current = useGame((s) => s.match);
  const [saved] = useState(hasSavedGame);
  const inProgress = current && current.phase !== 'over';
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex items-end gap-1 opacity-90">
        {(['pawn', 'knight', 'archbishop', 'king', 'queen', 'chancellor', 'pawn'] as const).map((t, i) => (
          <PieceSvg key={i} type={t} side={i % 2 ? 'black' : 'white'} className={i === 3 ? 'h-20 w-20' : 'h-12 w-12'} />
        ))}
      </div>
      <div>
        <div className="font-display text-sm tracking-[0.35em] text-gold-500">BREAK CHESS</div>
        <h1 className="mt-1 font-serif-kr text-5xl font-bold text-gold-300 drop-shadow-[0_4px_18px_rgba(232,196,106,0.25)] sm:text-6xl">브레이크 체스</h1>
        <p className="mt-4 max-w-md text-ink-200">정통 체스 위에 증강을 쌓아 올리는 대국. 게임 시작, 10수, 20수에 증강을 골라 매번 다른 체스를 둡니다.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {inProgress ? (
          <button type="button" className="btn btn-gold" onClick={() => go('game')}>
            대국으로 돌아가기
          </button>
        ) : saved ? (
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              if (resume()) go('game');
            }}
          >
            이어하기
          </button>
        ) : null}
        <button type="button" className={`btn ${inProgress || saved ? '' : 'btn-gold'}`} onClick={() => go('setup')}>
          새 대국
        </button>
        <button type="button" className="btn" onClick={() => go('codex')}>
          증강 도감
        </button>
        <button type="button" className="btn" onClick={() => go('rules')}>
          게임 규칙
        </button>
      </div>
    </div>
  );
}
