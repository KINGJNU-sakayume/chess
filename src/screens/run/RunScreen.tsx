import { useState } from 'react';
import { RunHud } from '../../components/run/RunHud';
import { ACTS, MAX_LIVES, START_GOLD, START_UNDOS } from '../../engine/run/content';
import { DIFFICULTY_NAME, type Difficulty } from '../../engine/run/types';
import { useAppStore } from '../../state/appStore';
import { useGame } from '../../state/gameStore';
import { useRun } from '../../state/runStore';
import { MapView } from './MapView';
import { EndView, EventView, Notice, PreBattleView, RestView, RewardView, ShopView } from './RunViews';

const DIFF_TEXT: Record<Difficulty, string> = {
  0: '상대 AI가 한 단계 약합니다. 규칙과 증강을 익히기 좋습니다.',
  1: '1막은 입문~중급, 3막은 중급~고급 AI가 상대합니다.',
  2: '상대 AI가 한 단계 강합니다. 마지막 보스는 마스터입니다.',
};

function RunSetup() {
  const go = useAppStore((s) => s.go);
  const start = useRun((s) => s.start);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => go('title')}>
          ← 메뉴
        </button>
        <h1 className="font-serif-kr text-3xl font-bold text-gold-300">도전</h1>
      </div>
      <section className="panel flex flex-col gap-2 p-5 text-sm leading-relaxed text-ink-200">
        <p>
          갈림길이 있는 지도를 따라 {ACTS}막을 올라가며 AI와 대국합니다. 각 막의 끝에는 고유한 증강을 가진 <b className="text-blood-300">보스</b>가 기다립니다.
        </p>
        <p>
          대국에서 이기면 <b className="text-gold-300">증강 3장 중 1장</b>을 골라 가져갑니다. 모은 증강은 도전 내내 모든 대국에 적용되고, 상대도 막이 오를수록 더 많은 증강을 들고 나옵니다.
        </p>
        <p>
          지면 목숨을 하나 잃습니다(시작 {MAX_LIVES}개). 보스는 이길 때까지 다시 도전해야 합니다. 시작 골드 {START_GOLD}, 무르기 {START_UNDOS}회가 주어지며, 무르기는 도전 전체에서 함께
          씁니다.
        </p>
      </section>
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-bold text-ink-100">난이도</h2>
        {([0, 1, 2] as Difficulty[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDifficulty(d)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
              difficulty === d ? 'border-gold-400 bg-gold-500/15' : 'border-ink-600 bg-ink-850 hover:border-ink-400'
            }`}
          >
            <span className="w-14 shrink-0 font-bold text-ink-100">{DIFFICULTY_NAME[d]}</span>
            <span className="text-xs text-ink-300">{DIFF_TEXT[d]}</span>
          </button>
        ))}
        <button type="button" className="btn btn-gold py-3 text-base" onClick={() => start(difficulty)}>
          도전 시작
        </button>
      </section>
    </div>
  );
}

export function RunScreen() {
  const run = useRun((s) => s.run);
  const go = useAppStore((s) => s.go);
  const match = useGame((s) => s.match);
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 p-3 py-5 sm:p-5">
      {!run ? (
        <RunSetup />
      ) : (
        <>
          <RunHud run={run} />
          {run.phase === 'map' || run.phase === 'prebattle' ? <Notice run={run} /> : null}
          {run.phase === 'start' || run.phase === 'reward' || run.phase === 'treasure' ? <RewardView key={`${run.counter}`} run={run} /> : null}
          {run.phase === 'map' ? <MapView run={run} /> : null}
          {run.phase === 'prebattle' ? <PreBattleView run={run} /> : null}
          {run.phase === 'shop' ? <ShopView run={run} /> : null}
          {run.phase === 'rest' ? <RestView run={run} /> : null}
          {run.phase === 'event' ? <EventView key={run.event?.id} run={run} /> : null}
          {run.phase === 'victory' || run.phase === 'defeat' ? (
            <>
              <Notice run={run} />
              <EndView run={run} />
            </>
          ) : null}
          {run.phase === 'battle' ? (
            <section className="panel flex flex-col items-center gap-3 p-6">
              <p className="text-ink-200">{run.enemy?.name}와(과)의 대국이 진행 중입니다.</p>
              <button type="button" className="btn btn-gold" disabled={!match} onClick={() => go('game')}>
                대국으로 돌아가기
              </button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
