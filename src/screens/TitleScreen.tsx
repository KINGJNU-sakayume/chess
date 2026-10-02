import { useState } from 'react';
import { PieceSvg } from '../components/board/PieceSvg';
import { useAppStore } from '../state/appStore';
import { hasSavedGame, useGame } from '../state/gameStore';
import { hasSavedRun, useRun } from '../state/runStore';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  const resumeGame = useGame((s) => s.resume);
  const current = useGame((s) => s.match);
  const run = useRun((s) => s.run);
  const resumeRun = useRun((s) => s.resume);
  const abandon = useRun((s) => s.abandon);
  const [savedGame] = useState(hasSavedGame);
  const [savedRun] = useState(hasSavedRun);
  const [confirmNew, setConfirmNew] = useState(false);
  const runLive = run && run.phase !== 'victory' && run.phase !== 'defeat';
  const freeGame = current && current.setup.context !== 'run' && current.phase !== 'over';

  const continueRun = () => {
    if (runLive) {
      go(run.phase === 'battle' && current ? 'game' : 'run');
      return;
    }
    if (resumeRun()) go(useRun.getState().run?.phase === 'battle' ? 'game' : 'run');
  };

  const newRun = () => {
    if ((runLive || savedRun) && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    abandon();
    if (current?.setup.context === 'run') useGame.getState().quit();
    go('run');
  };

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
        <p className="mt-4 max-w-md text-ink-200">
          정통 체스 위에 증강을 쌓아 올리는 로그라이크. 지도를 오르며 AI를 꺾고, 판마다 증강을 모아 나만의 부서진 체스를 만드세요.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        {runLive || savedRun ? (
          <button type="button" className="btn btn-gold" onClick={continueRun}>
            도전 이어하기
          </button>
        ) : null}
        <button type="button" className={`btn ${runLive || savedRun ? (confirmNew ? 'btn-danger' : '') : 'btn-gold'}`} onClick={newRun}>
          {confirmNew ? '진행 중인 도전을 버리고 새로 시작' : '새 도전'}
        </button>
        <div className="my-1 h-px bg-ink-700" />
        {freeGame ? (
          <button type="button" className="btn" onClick={() => go('game')}>
            자유 대전으로 돌아가기
          </button>
        ) : savedGame ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (resumeGame()) go('game');
            }}
          >
            자유 대전 이어하기
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => go('setup')}>
          자유 대전 (AI · 2인)
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
