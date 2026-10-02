import { useState } from 'react';
import { PieceSvg, type UiPieceType } from '../../components/board/PieceSvg';
import { CardIcon } from '../../components/cards/CardIcon';
import { CardArt, CardView, KindBadge, TierBadge } from '../../components/cards/CardView';
import { CoinIcon, HeartIcon, UndoIcon } from '../../components/run/NodeIcon';
import { levelOf } from '../../engine/ai/think';
import { cardById, type CardIcon as IconKey } from '../../engine/augments/cards';
import { UNDOS_PER_PURCHASE } from '../../engine/run/content';
import { eventById } from '../../engine/run/events';
import { DIFFICULTY_NAME, type EnemyDef, type RunState } from '../../engine/run/types';
import { useAppStore } from '../../state/appStore';
import { useRun } from '../../state/runStore';

const LOOK: Record<string, UiPieceType> = {
  knights: 'knight',
  clergy: 'bishop',
  wall: 'rook',
  pawns: 'pawn',
  duelist: 'king',
  trickster: 'queen',
  fortress_lord: 'chancellor',
  knight_captain: 'knight',
  tyrant_queen: 'queen',
  red_archbishop: 'archbishop',
  pawn_emperor: 'pawn',
  hill_king: 'king',
};

const KIND_LABEL: Record<EnemyDef['kind'], { text: string; cls: string; glow: string }> = {
  battle: { text: '일반 대국', cls: 'bg-ink-700 text-ink-100', glow: 'rgba(203,193,216,0.25)' },
  elite: { text: '정예', cls: 'bg-blood-600/70 text-blood-300', glow: 'rgba(229,103,93,0.35)' },
  boss: { text: '보스', cls: 'bg-blood-500 text-white', glow: 'rgba(242,149,140,0.5)' },
};

export function Notice({ run }: { run: RunState }) {
  if (!run.notice) return null;
  const tone = run.notice.tone === 'good' ? 'text-gold-300 ring-gold-500/40' : run.notice.tone === 'bad' ? 'text-blood-300 ring-blood-500/40' : 'text-arcane-300 ring-arcane-500/30';
  return <div className={`panel toast-enter px-4 py-2 text-sm font-bold ring-1 ${tone}`}>{run.notice.text}</div>;
}

function LevelDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < level ? 'bg-blood-400' : 'bg-ink-600'}`} />
      ))}
    </span>
  );
}

/** Who you are about to face, with all of their augments. */
export function PreBattleView({ run }: { run: RunState }) {
  const launch = useRun((s) => s.launchBattle);
  const go = useAppStore((s) => s.go);
  const enemy = run.enemy!;
  const k = KIND_LABEL[enemy.kind];
  return (
    <div className="flex flex-col gap-4">
      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${k.cls}`}>
          {k.text}
          {run.attempts ? ` · ${run.attempts + 1}번째 도전` : ''}
        </span>
        <div className="flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `radial-gradient(circle, ${k.glow}, transparent 70%)` }}>
          <PieceSvg type={LOOK[enemy.look] ?? 'king'} side="black" className="h-24 w-24" />
        </div>
        <h2 className="font-serif-kr text-3xl font-bold text-ink-100">{enemy.name}</h2>
        <div className="flex items-center gap-2 text-sm text-ink-300">
          AI {levelOf(enemy.level).name} <LevelDots level={enemy.level} />
        </div>
        <p className="max-w-lg text-sm text-ink-200">{enemy.blurb}</p>
        <p className="text-xs text-ink-400">당신은 백, 상대는 흑입니다. 양쪽 모두 가진 증강을 모두 들고 대국을 시작합니다.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-ink-200">상대의 증강 ({enemy.augments.length})</h3>
        {enemy.augments.length === 0 ? <p className="panel p-3 text-sm text-ink-400">증강 없이 정통 체스로 덤빕니다.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {enemy.augments.map((id) => (
            <CardView key={id} id={id} inRun />
          ))}
        </div>
      </section>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="btn btn-gold min-w-56 py-3 text-base"
          onClick={() => {
            launch();
            go('game');
          }}
        >
          대국 시작
        </button>
      </div>
    </div>
  );
}

/** Pick one of three augments (start gift, battle rewards, treasure, event offers). */
export function RewardView({ run }: { run: RunState }) {
  const act = useRun((s) => s.act);
  const [chosen, setChosen] = useState<string | null>(null);
  const reward = run.reward!;
  const isStart = run.phase === 'start';
  const take = (card: string | null) => act(isStart ? { type: 'start-pick', card } : { type: 'take-reward', card });
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <h2 className="font-serif-kr text-3xl font-bold text-gold-300">{reward.title}</h2>
        {reward.gold ? (
          <div className="mt-2 flex items-center justify-center gap-1 text-sm font-bold text-gold-300">
            <CoinIcon className="h-5 w-5" /> +{reward.gold}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-ink-300">
          {reward.cards.length
            ? isStart
              ? '첫 증강을 하나 고르고 출발하세요. 증강은 도전 내내 모든 대국에 적용됩니다.'
              : '증강을 하나 고르세요. 고른 증강은 앞으로의 모든 대국에 적용됩니다.'
            : '이번에는 고를 증강이 없습니다.'}
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-3">
        {reward.cards.map((id, i) => (
          <div key={id} className="card-enter" style={{ animationDelay: `${i * 80}ms` }}>
            <CardView id={id} selected={chosen === id} onClick={() => setChosen(id)} inRun />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {reward.cards.length ? (
          <button type="button" className="btn btn-gold min-w-48" disabled={!chosen} onClick={() => take(chosen)}>
            {chosen ? `「${cardById(chosen).name}」 받기` : '카드를 고르세요'}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => take(null)}>
          {reward.cards.length ? '건너뛰기' : '계속'}
        </button>
      </div>
    </div>
  );
}

export function ShopView({ run }: { run: RunState }) {
  const act = useRun((s) => s.act);
  const items = run.shop ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="font-serif-kr text-3xl font-bold text-gold-300">상점</h2>
        <p className="mt-1 text-sm text-ink-300">골드로 증강과 물자를 살 수 있습니다.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => {
          if (it.kind !== 'card' || !it.card) return null;
          const afford = run.gold >= it.price;
          return (
            <CardView
              key={i}
              id={it.card}
              inRun
              className={it.sold ? 'opacity-40' : ''}
              footer={
                <button
                  type="button"
                  className={`btn mt-auto ${afford && !it.sold ? 'btn-gold' : ''}`}
                  disabled={it.sold || !afford}
                  onClick={() => act({ type: 'buy', index: i })}
                >
                  {it.sold ? '판매 완료' : (
                    <span className="flex items-center gap-1">
                      <CoinIcon className="h-4 w-4" /> {it.price}
                    </span>
                  )}
                </button>
              }
            />
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => {
          if (it.kind === 'card') return null;
          const heal = it.kind === 'heal';
          const full = heal && run.lives >= run.maxLives;
          const disabled = it.sold || run.gold < it.price || full;
          return (
            <div key={i} className="panel flex items-center gap-3 p-3">
              {heal ? <HeartIcon filled className="h-9 w-9" /> : <UndoIcon className="h-9 w-9" />}
              <div className="flex-1">
                <div className="font-bold text-ink-100">{heal ? '목숨 회복' : `무르기 +${UNDOS_PER_PURCHASE}`}</div>
                <div className="text-xs text-ink-300">{heal ? (full ? '목숨이 가득합니다' : '목숨을 1 회복합니다') : '대국 중 수를 물릴 수 있는 횟수'}</div>
              </div>
              <button type="button" className={`btn ${disabled ? '' : 'btn-gold'}`} disabled={disabled} onClick={() => act({ type: 'buy', index: i })}>
                {it.sold ? '판매 완료' : (
                  <span className="flex items-center gap-1">
                    <CoinIcon className="h-4 w-4" /> {it.price}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center">
        <button type="button" className="btn min-w-48" onClick={() => act({ type: 'leave' })}>
          상점을 떠난다
        </button>
      </div>
    </div>
  );
}

function ActiveList({ run, onPick, label }: { run: RunState; onPick: (id: string) => void; label: string }) {
  const actives = run.augments.filter((a) => cardById(a.id).kind === 'active');
  if (!actives.length) return <p className="text-sm text-ink-400">액티브 증강이 없습니다.</p>;
  return (
    <div className="flex flex-col gap-2">
      {actives.map((a) => {
        const def = cardById(a.id);
        return (
          <div key={a.id} className="flex items-center gap-2 rounded-lg bg-ink-900/60 p-2">
            <CardArt id={a.id} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-ink-100">{def.name}</div>
              <div className="mt-0.5 flex gap-1">
                <TierBadge tier={def.tier} />
                <span className="text-[11px] text-arcane-300">
                  대국당 {(def.uses ?? 1) + a.bonus}회 → {(def.uses ?? 1) + a.bonus + 1}회
                </span>
              </div>
            </div>
            <button type="button" className="btn btn-gold px-3 py-1.5 text-xs" onClick={() => onPick(a.id)}>
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function RestView({ run }: { run: RunState }) {
  const act = useRun((s) => s.act);
  const full = run.lives >= run.maxLives;
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="font-serif-kr text-3xl font-bold text-[#9be0a3]">휴식처</h2>
        <p className="mt-1 text-sm text-ink-300">모닥불 앞에서 한 가지를 할 수 있습니다.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <HeartIcon filled className="h-8 w-8" />
            <h3 className="text-lg font-bold text-ink-100">휴식</h3>
          </div>
          <p className="text-sm text-ink-300">{full ? '목숨이 가득합니다. 그래도 쉬어 갈 수 있습니다.' : '목숨을 1 회복합니다.'}</p>
          <button type="button" className="btn btn-gold mt-auto" onClick={() => act({ type: 'rest', choice: 'heal' })}>
            {full ? '그냥 쉬어 간다' : '쉬어 간다 (목숨 +1)'}
          </button>
        </section>
        <section className="panel flex flex-col gap-3 p-5">
          <h3 className="text-lg font-bold text-ink-100">연마</h3>
          <p className="text-sm text-ink-300">액티브 증강 하나를 골라 대국마다 한 번 더 쓸 수 있게 합니다.</p>
          <ActiveList run={run} label="연마" onPick={(id) => act({ type: 'rest', choice: 'forge', card: id })} />
        </section>
      </div>
    </div>
  );
}

export function EventView({ run }: { run: RunState }) {
  const act = useRun((s) => s.act);
  const [forging, setForging] = useState<number | null>(null);
  const ev = eventById(run.event!.id);
  const result = run.event!.result;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-ink-900/70 text-arcane-300">
          <CardIcon icon={ev.icon as IconKey} className="h-16 w-16" />
        </div>
        <h2 className="font-serif-kr text-3xl font-bold text-arcane-300">{ev.title}</h2>
        <p className="text-sm leading-relaxed text-ink-200">{ev.text}</p>
      </section>
      {result ? (
        <section className="panel flex flex-col items-center gap-3 p-5 text-center">
          <p className="font-bold text-gold-300">{result}</p>
          <button type="button" className="btn btn-gold min-w-48" onClick={() => act({ type: 'leave' })}>
            계속
          </button>
        </section>
      ) : forging !== null ? (
        <section className="panel flex flex-col gap-3 p-4">
          <h3 className="text-sm font-bold text-ink-200">연마할 액티브 증강을 고르세요</h3>
          <ActiveList run={run} label="연마" onPick={(id) => act({ type: 'event', choice: forging, card: id })} />
          <button type="button" className="btn" onClick={() => setForging(null)}>
            돌아가기
          </button>
        </section>
      ) : (
        <div className="flex flex-col gap-2">
          {ev.choices.map((c, i) => {
            const why = c.blocked?.(run) ?? null;
            return (
              <button
                key={i}
                type="button"
                className="btn justify-start py-3 text-left"
                disabled={!!why}
                onClick={() => (c.needsActive ? setForging(i) : act({ type: 'event', choice: i }))}
              >
                <span className="flex flex-col items-start">
                  <span>{c.label}</span>
                  {why ? <span className="text-xs font-normal text-blood-300">{why}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EndView({ run }: { run: RunState }) {
  const go = useAppStore((s) => s.go);
  const abandon = useRun((s) => s.abandon);
  const win = run.phase === 'victory';
  const s = run.stats;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="panel flex flex-col items-center gap-2 p-6 text-center">
        <h2 className={`font-serif-kr text-5xl font-bold ${win ? 'text-gold-300' : 'text-blood-300'}`}>{win ? '도전 성공!' : '도전 실패'}</h2>
        <p className="text-sm text-ink-200">
          {win ? '세 명의 보스를 모두 쓰러뜨렸습니다.' : `${run.act}막에서 여정이 끝났습니다.`} ({DIFFICULTY_NAME[run.difficulty]})
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
          {[
            ['승리', s.wins],
            ['패배', s.losses],
            ['무승부', s.draws],
            ['정예', s.elites],
            ['보스', s.bosses],
            ['층', s.floors],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-ink-900/60 px-3 py-2">
              <div className="text-lg font-bold text-ink-100">{v}</div>
              <div className="text-xs text-ink-400">{k}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel p-4">
        <h3 className="mb-2 text-sm font-bold text-ink-200">모은 증강 ({run.augments.length})</h3>
        <div className="flex flex-wrap gap-2">
          {run.augments.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full bg-ink-800 py-0.5 pl-0.5 pr-2 text-xs text-ink-200" title={cardById(a.id).text}>
              <CardArt id={a.id} size="h-6 w-6" />
              {cardById(a.id).name}
              <KindBadge id={a.id} />
            </span>
          ))}
        </div>
      </section>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          className="btn btn-gold min-w-40"
          onClick={() => {
            abandon();
            go('run');
          }}
        >
          새 도전
        </button>
        <button
          type="button"
          className="btn min-w-40"
          onClick={() => {
            abandon();
            go('title');
          }}
        >
          메뉴로
        </button>
      </div>
    </div>
  );
}
