import { useState } from 'react';
import { CardView } from '../components/cards/CardView';
import { CARDS, TIERS, TIER_NAME, type Tier } from '../engine/augments/cards';
import { ROUND_TIER_WEIGHTS } from '../engine/augments/draft';
import { useAppStore } from '../state/appStore';

type KindFilter = 'all' | 'passive' | 'active';

export function CodexScreen() {
  const go = useAppStore((s) => s.go);
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const cards = CARDS.filter((c) => (tier === 'all' || c.tier === tier) && (kind === 'all' || c.kind === kind));
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 p-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => go('title')}>
          ← 메뉴
        </button>
        <h1 className="font-serif-kr text-3xl font-bold text-gold-300">증강 도감</h1>
        <span className="text-sm text-ink-400">{CARDS.length}종</span>
      </div>
      <div className="panel flex flex-col gap-3 p-4 text-sm text-ink-200">
        <p>
          증강은 게임 시작, 10수째, 20수째에 세 장 중 한 장을 고릅니다. 같은 라운드에서는 양쪽 모두 같은 등급의 카드를 받습니다. 라운드별 등급 확률(실버 / 골드 / 프리즘):{' '}
          {ROUND_TIER_WEIGHTS.map((w, i) => `${i + 1}라운드 ${w.join('/')}%`).join(', ')}.
        </p>
        <p>
          <b className="text-ink-100">패시브</b>는 고르는 즉시 효과가 생깁니다. <b className="text-arcane-300">액티브</b>는 자기 턴에 수를 두기 전에 사용하며, 턴을 소모하지 않습니다. 한 턴에 한 장까지 쓸 수 있고, 카드는 기물을 움직이지 않습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', ...TIERS] as const).map((t) => (
          <button key={t} type="button" className={`btn px-3 py-1.5 text-xs ${tier === t ? 'btn-gold' : ''}`} onClick={() => setTier(t)}>
            {t === 'all' ? '전체 등급' : TIER_NAME[t]}
          </button>
        ))}
        <span className="w-2" />
        {(
          [
            ['all', '전체'],
            ['passive', '패시브'],
            ['active', '액티브'],
          ] as [KindFilter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" className={`btn px-3 py-1.5 text-xs ${kind === k ? 'btn-gold' : ''}`} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <CardView key={c.id} id={c.id} />
        ))}
      </div>
    </div>
  );
}
