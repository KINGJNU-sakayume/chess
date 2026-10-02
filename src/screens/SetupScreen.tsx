import { useState } from 'react';
import { PieceSvg } from '../components/board/PieceSvg';
import { LEVELS } from '../engine/ai/think';
import type { Color } from '../engine/game/types';
import { useAppStore } from '../state/appStore';
import { useGame } from '../state/gameStore';

const LEVEL_TEXT = [
  '자주 실수합니다. 규칙과 증강을 익히기 좋습니다.',
  '눈앞의 기물은 지키지만 수읽기가 얕습니다.',
  '세 수 앞을 읽습니다. 방심하면 집니다.',
  '1초 남짓 깊게 읽습니다. 실수를 놓치지 않습니다.',
  '3초 넘게 읽는 최강 상대입니다.',
];

type ColorChoice = 'white' | 'black' | 'random';

export function SetupScreen() {
  const go = useAppStore((s) => s.go);
  const start = useGame((s) => s.start);
  const [color, setColor] = useState<ColorChoice>('white');
  const [level, setLevel] = useState(3);

  const seed = () => `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const begin = (mode: 'ai' | 'local') => {
    const human: Color = mode === 'local' ? 0 : color === 'random' ? (Math.random() < 0.5 ? 0 : 1) : color === 'white' ? 0 : 1;
    start({ mode, human, level, seed: seed() });
    go('game');
  };

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-5 p-4 py-8">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => go('title')}>
          ← 메뉴
        </button>
        <h1 className="font-serif-kr text-3xl font-bold text-gold-300">새 대국</h1>
      </div>

      <section className="panel flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold text-ink-100">AI와 대전</h2>
        <div>
          <div className="mb-2 text-sm text-ink-300">내 색</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['white', '백 (선공)'],
                ['black', '흑 (후공)'],
                ['random', '무작위'],
              ] as [ColorChoice, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" className={`btn flex-col gap-1 py-3 ${color === v ? 'btn-gold' : ''}`} onClick={() => setColor(v)}>
                {v === 'random' ? (
                  <span className="flex">
                    <PieceSvg type="king" side="white" className="h-7 w-7" />
                    <PieceSvg type="king" side="black" className="-ml-2 h-7 w-7" />
                  </span>
                ) : (
                  <PieceSvg type="king" side={v} className="h-7 w-7" />
                )}
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm text-ink-300">AI 난이도</div>
          <div className="flex flex-col gap-2">
            {LEVELS.map((l, i) => (
              <button
                key={l.name}
                type="button"
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  level === i + 1 ? 'border-gold-400 bg-gold-500/15' : 'border-ink-600 bg-ink-850 hover:border-ink-400'
                }`}
                onClick={() => setLevel(i + 1)}
              >
                <span className="flex gap-0.5">
                  {Array.from({ length: 5 }, (_, j) => (
                    <span key={j} className={`h-2 w-2 rounded-full ${j <= i ? 'bg-gold-400' : 'bg-ink-600'}`} />
                  ))}
                </span>
                <span className="w-14 shrink-0 font-bold text-ink-100">{l.name}</span>
                <span className="text-xs text-ink-300">{LEVEL_TEXT[i]}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-gold py-3 text-base" onClick={() => begin('ai')}>
          대국 시작
        </button>
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold text-ink-100">둘이서 대전</h2>
        <p className="text-sm text-ink-300">한 화면에서 번갈아 둡니다. 증강 선택도 백과 흑이 차례로 합니다.</p>
        <button type="button" className="btn" onClick={() => begin('local')}>
          2인 대전 시작
        </button>
      </section>
    </div>
  );
}
