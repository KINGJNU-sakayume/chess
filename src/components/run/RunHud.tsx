import { useState } from 'react';
import { cardById } from '../../engine/augments/cards';
import { DIFFICULTY_NAME, type RunState } from '../../engine/run/types';
import { useAppStore } from '../../state/appStore';
import { CardArt, KindBadge, TierBadge } from '../cards/CardView';
import { CoinIcon, HeartIcon, UndoIcon } from './NodeIcon';

/** Lives, gold, undos and the augment collection, shown on every run screen. */
export function RunHud({ run }: { run: RunState }) {
  const go = useAppStore((s) => s.go);
  const [open, setOpen] = useState(false);
  const floor = run.current ? (run.current === run.map.bossId ? run.map.rows + 1 : run.map.nodes[run.current].row + 1) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => go('title')}>
          ← 메뉴
        </button>
        <span className="font-bold text-gold-300">
          {run.act}막{floor ? ` · ${floor}층` : ''}
        </span>
        <span className="text-xs text-ink-400">{DIFFICULTY_NAME[run.difficulty]}</span>
        <span className="flex items-center gap-0.5" title={`목숨 ${run.lives}/${run.maxLives}`}>
          {Array.from({ length: run.maxLives }, (_, i) => (
            <HeartIcon key={i} filled={i < run.lives} className="h-5 w-5" />
          ))}
        </span>
        <span className="flex items-center gap-1 font-bold text-gold-300" title="골드">
          <CoinIcon className="h-5 w-5" />
          {run.gold}
        </span>
        <span className="flex items-center gap-1 font-bold text-arcane-300" title="무르기: 대국 중 한 수를 물릴 수 있는 횟수">
          <UndoIcon className="h-5 w-5" />
          {run.undos}
        </span>
        <button type="button" className={`btn ml-auto px-3 py-1 text-xs ${open ? 'btn-gold' : ''}`} onClick={() => setOpen((v) => !v)}>
          증강 {run.augments.length}개 {open ? '▴' : '▾'}
        </button>
      </div>
      {open ? (
        <div className="panel grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {run.augments.length === 0 ? <p className="text-sm text-ink-400">아직 증강이 없습니다.</p> : null}
          {run.augments.map((a) => {
            const def = cardById(a.id);
            return (
              <div key={a.id} className="flex gap-2 rounded-lg bg-ink-900/60 p-2">
                <CardArt id={a.id} size="h-10 w-10" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-sm font-bold text-ink-100">{def.name}</span>
                    <TierBadge tier={def.tier} />
                    <KindBadge id={a.id} />
                    {a.bonus ? <span className="text-[11px] font-bold text-arcane-300">연마 +{a.bonus}</span> : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-300">{def.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
