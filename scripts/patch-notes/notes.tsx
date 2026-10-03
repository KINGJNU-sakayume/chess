/* eslint-disable react-refresh/only-export-components -- a build script, never hot-reloaded */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardIcon } from '../../src/components/cards/CardIcon';
import { CATEGORY_NAME, RUN_CARDS, TIERS, TIER_NAME, cardById, conflictNames, type Tier } from '../../src/engine/augments/cards';
import { BOSSES, REWARD_WEIGHTS } from '../../src/engine/run/content';

/**
 * Player-facing patch notes for the 1.1 balance patch, rendered to HTML (and
 * from there to PDF by scripts/patch-notes.mjs). Card names, tiers, use counts
 * and rules text come from the card data, so the notes cannot drift from the
 * game; only the "before" values are written down here.
 */

export const VERSION = '1.1';
const DATE = '2026년 10월 2일';

type Tag = 'buff' | 'nerf' | 'adjust' | 'tier' | 'rework';
const TAG: Record<Tag, { label: string; color: string }> = {
  buff: { label: '상향', color: '#7ed6a5' },
  nerf: { label: '하향', color: '#f2958c' },
  adjust: { label: '조정', color: '#9fe6f0' },
  tier: { label: '등급 이동', color: '#f3d98f' },
  rework: { label: '재설계', color: '#c9a7ff' },
};

const ACCENT: Record<Tier, string> = { silver: '#e3e8f0', gold: '#f3d98f', prism: '#dccbff' };
const BADGE: Record<Tier, { bg: string; fg: string }> = {
  silver: { bg: '#cfd6e0', fg: '#1d2330' },
  gold: { bg: '#e8c46a', fg: '#2a1d05' },
  prism: { bg: 'linear-gradient(120deg,#9fe6f0,#b48cff,#f2958c,#f3d98f)', fg: '#1b1230' },
};

const uses = (id: string): string => `${cardById(id).uses}회`;

interface Change {
  id: string;
  tags: Tag[];
  /** [what, before, after] */
  rows: [string, string, string][];
  note: string;
  /** Tier before the patch, if it moved. */
  from?: Tier;
}

/** Every changed card, grouped by its tier after the patch. */
const CHANGES: Change[] = [
  // Silver
  {
    id: 'conscript',
    tags: ['tier'],
    from: 'gold',
    rows: [['등급', '골드', TIER_NAME[cardById('conscript').tier]]],
    note: '첫째 줄에 빈 칸이 생겨야 쓸 수 있고, 소환된 나이트가 전장에 닿기까지 두 수가 더 걸립니다. 골드 중에서는 가장 약했고, 실버에서는 중상위권입니다.',
  },
  {
    id: 'early_promotion',
    tags: ['tier', 'adjust'],
    from: 'gold',
    rows: [
      ['등급', '골드', TIER_NAME[cardById('early_promotion').tier]],
      ['함께 가질 수 없음', '없음', '돌파'],
    ],
    note: '혼자서는 골드 값을 하지 못했지만(골드 중 최하위권), 돌격 행군·보병의 투지와 묶으면 폰 빌드의 엔진이 됩니다. 돌파와 함께면 두 수 만에 이겼으므로 둘은 함께 가질 수 없습니다.',
  },
  {
    id: 'minefield',
    tags: ['tier', 'buff'],
    from: 'gold',
    rows: [
      ['등급', '골드', TIER_NAME[cardById('minefield').tier]],
      ['사용 횟수', '2회', uses('minefield')],
    ],
    note: '함정은 양쪽에 보이기 때문에 상대가 쉽게 피해 갑니다. 한 장을 더 깔게 하고 실버로 옮겼습니다.',
  },
  {
    id: 'pawn_sidestep',
    tags: ['buff'],
    rows: [['좌우 이동', '이동만', '이동 + 잡기']],
    note: '이 증강을 든 쪽의 승률이 거의 오르지 않았습니다(아무 증강 없는 상대에게 52%). 옆으로 잡을 수 있게 되면서 폰 사슬이 옆구리를 지킵니다.',
  },
  {
    id: 'pawn_retreat',
    tags: ['buff'],
    rows: [['뒤로', '한 칸 이동', '한 칸 이동 + 대각선 뒤로 잡기']],
    note: '물러나기만 하는 폰은 승부에 거의 영향이 없었습니다(55%). 이제 뒤로 빠지면서 파고든 기물을 잡을 수 있습니다.',
  },
  {
    id: 'sniper',
    tags: ['buff'],
    rows: [['사용 횟수', '1회', uses('sniper')]],
    note: '같은 실버끼리 붙였을 때 세 번의 측정 모두 최하위권이었습니다. 폰 하나로는 판을 흔들기 어려웠습니다.',
  },
  {
    id: 'shield',
    tags: ['nerf'],
    rows: [['대상', '킹이 아닌 기물', '킹과 퀸이 아닌 기물']],
    note: '아래 「규칙 변경: 퀸과 보호막」을 확인하세요. 측정에서 실버 1위였습니다.',
  },
  {
    id: 'barricade',
    tags: ['buff'],
    rows: [['사용 횟수', '2회', uses('barricade')]],
    note: '아무 기물이나 한 수를 들여 부술 수 있어, 두 장으로는 길을 막는 효과가 짧았습니다.',
  },
  {
    id: 'bishop_step',
    tags: ['buff'],
    rows: [['적용 대상', '비숍', '비숍 + 대주교']],
    note: '기마 기사단이나 대주교 서품으로 비숍이 대주교가 되면 이 증강이 통째로 쓸모없어졌습니다. 이제는 오히려 좋은 짝이 됩니다.',
  },
  {
    id: 'rook_step',
    tags: ['buff'],
    rows: [['적용 대상', '룩', '룩 + 재상']],
    note: '재상 임명과 함께 써도 효과가 사라지지 않습니다.',
  },
  // Gold
  {
    id: 'knight_oath',
    tags: ['tier'],
    from: 'silver',
    rows: [['등급', '실버', TIER_NAME[cardById('knight_oath').tier]]],
    note: '잡을 때마다 보호막이 다시 생겨, 나이트가 지켜진 기물을 잡고도 되튕겨 살아남는 일이 반복됐습니다. 모든 측정에서 실버 최상위였습니다.',
  },
  {
    id: 'royal_guard',
    tags: ['nerf'],
    rows: [['보호막 대상', '킹 옆 기물 모두', '킹 옆 기물 모두(퀸 제외)']],
    note: '시작 국면에서 퀸에게도 보호막이 씌워져, 측정한 모든 판에서 골드 1위(승률 97~100%)였습니다.',
  },
  {
    id: 'resurrect',
    tags: ['buff'],
    rows: [['사용 횟수', '1회', uses('resurrect')]],
    note: '기물을 잃어야만 쓸 수 있는 카드라 골드 중 최하위권이었습니다.',
  },
  {
    id: 'ordain',
    tags: ['adjust'],
    rows: [['함께 가질 수 없음', '없음', '기마 기사단']],
    note: '기마 기사단을 가지면 승격할 비숍이 남지 않아 이 카드가 아무 일도 하지 않았습니다.',
  },
  // Prism
  {
    id: 'coronation',
    tags: ['rework', 'nerf'],
    rows: [
      ['종류', '패시브', `액티브 · ${uses('coronation')}`],
      ['효과', '폰이 5번째 줄에서 승진', '상대 진영의 폰 하나를 퀸으로'],
    ],
    note: '폰이 5번째 줄에서 승진하면 d4–d5 두 수 만에 퀸이 나왔고, 폰 여덟 개가 모두 퀸 후보였습니다. 이제는 대국마다 한 번, 상대 진영까지 밀고 들어간 폰에게 왕관을 씌웁니다. 새 퀸은 그 턴에는 움직일 수 없습니다.',
  },
  {
    id: 'breakthrough',
    tags: ['nerf', 'buff'],
    rows: [
      ['함께 가질 수 없음', '없음', '조기 승진'],
      ['승리 조건', '폰이 승진하면', '폰이 수를 두어 승진하면'],
      ['추가 효과', '없음', '창병(바로 앞의 기물 잡기)'],
    ],
    note: '조기 승진과 겹치면 막을 방법이 없었지만, 혼자서는 승률이 거의 오르지 않았습니다(52%). 조합은 막고, 대신 막아선 기물을 뚫고 나갈 힘을 줍니다. 대관식의 왕관은 수를 둔 승진이 아니므로 돌파를 발동시키지 않습니다.',
  },
  {
    id: 'king_of_the_hill',
    tags: ['nerf'],
    rows: [['승리 시점', '중앙에 들어서는 순간', '들어선 뒤 상대 턴을 버티면']],
    note: '아래 「규칙 변경: 언덕의 왕」을 확인하세요.',
  },
  {
    id: 'divine_aegis',
    tags: ['rework', 'nerf'],
    rows: [
      ['보호막 대상', '킹을 뺀 모든 기물(폰 포함)', '룩·비숍·나이트(대주교·재상 포함)'],
      ['대가', '없음', '잡기를 한 기물은 보호막을 잃음'],
    ],
    note: '측정한 모든 판에서 프리즘 1위(90~100%)였고, 보호막 개수만 줄여서는 1위에서 내려오지 않았습니다. 문제는 "보호막을 두르고 지켜진 기물을 잡으러 가는" 공격이었습니다. 이제 보호막은 지키는 동안만 유지되고 공격에 나서는 순간 사라지며, 같은 프리즘끼리 승점이 95%에서 72%로 내려와 상위권에 자리 잡았습니다.'
  },
  {
    id: 'revival',
    tags: ['buff'],
    rows: [['되살린 기물', '그대로', '보호막을 두르고 등장(퀸 제외)']],
    note: '기물을 잃어야만 쓸 수 있는 카드치고는 프리즘다운 한 방이 부족했습니다.',
  },
  {
    id: 'cavalry_order',
    tags: ['adjust'],
    rows: [['함께 가질 수 없음', '없음', '대주교 서품']],
    note: '성직자의 발걸음과는 이제 잘 어울립니다.',
  },
];

const NEW_CARDS: { id: string; note: string }[] = [
  { id: 'knighting', note: '폰 빌드에 기동력을 더하는 카드입니다. 막힌 폰을 나이트로 바꿔 돌파구를 엽니다.' },
  { id: 'shield_breaker', note: '보호막을 두른 상대(성채의 군주, 철벽 수문장, 신성한 가호)를 위한 대답입니다. 킹의 보호막은 깨지 못합니다.' },
  { id: 'pawn_grit', note: '기사의 맹세의 폰 버전입니다. 순교자·조기 승진과 함께 폰 빌드의 중심이 됩니다.' },
  { id: 'demote', note: '대주교 서품의 반대편 카드입니다. 상대의 핵심 기물 하나를 폰으로 끌어내립니다.' },
  { id: 'thorns', note: '보호막을 모으는 빌드의 마무리 카드입니다. 보호막이 있는 증강을 하나 이상 가지고 있어야 제시됩니다.' },
  { id: 'ice_age', note: '한 턴 동안 상대는 폰과 킹으로만 대응할 수 있습니다. 그 사이에 무엇을 할지가 실력입니다.' },
];

const FIXES: string[] = [
  '도전 보상 화면에 이번 제시의 등급 배지가 표시됩니다.',
  '함께 가질 수 없는 증강이 있는 카드에 「함께 가질 수 없음」이 표시됩니다.',
  '이미 가진 증강과 부딪히거나 효과가 없는 카드는 보상·상점·이벤트에 나오지 않습니다. 적의 증강 구성도 같은 규칙을 따릅니다.',
  '패치 전에 저장된 대국이 새 규칙으로 이어지지 않으면, 도전 기록을 지우지 않고 그 대국만 처음부터 다시 시작합니다.',
  'AI가 새 언덕의 왕 규칙을 이해합니다. 중앙에 오른 킹은 반드시 잡으려 하고, 잡힐 칸으로는 올라가지 않습니다.',
  '가시 갑옷과 보병의 투지에 효과 연출(「가시!」, 「보호막!」)이 추가되었습니다.',
  '대주교·재상에 마우스를 올리면 성직자의 발걸음·망루 계단으로 늘어난 행마가 함께 표시됩니다.',
];

const NEXT: [string, string][] = [
  ['왕위 계승 (프리즘)', '처음으로 킹이 잡히면 패배하는 대신, 가장 강한 아군 기물이 새 킹이 됩니다.'],
  ['공성 포격 (골드)', '킹과 퀸을 제외한 상대 기물 하나를 제거합니다. 저격의 상위 카드입니다.'],
  ['피의 계약 (프리즘)', '즉시 퀸을 하나 더 얻지만 a·h 파일 폰을 잃습니다. 대가가 붙은 강력한 증강의 시험작입니다.'],
  ['점령 (프리즘, 승리 조건)', '내 차례가 끝날 때 상대 진영 마지막 두 줄에 아군 기물이 셋 있으면 승리합니다.'],
  ['3막 보스 「폰 황제」 강화', '측정에서 플레이어 봇에게 매번 졌습니다. 이번에 강해진 폰 증강들로 다시 구성할 예정입니다.'],
  ['관찰 중인 증강', '아마존의 각성·언덕의 왕(프리즘 하위권), 측면 행군(상향 후 실버 상위권). 측정을 더 모은 뒤 조정합니다.'],
  ['도전 새로고침', '막마다 한 번, 보상 제시를 새로 뽑을 수 있게 합니다.'],
  ['건너뛰기 보상', '보상 증강을 건너뛰면 골드를 조금 받습니다.'],
];

/** Measurements from `npm run sim:cards` before and after the patch (scripts/patch-notes/sim.json). */
export interface SimSummary {
  /** Games per card, games per tier-vs-tier matchup, AI level. */
  games: number;
  crossGames: number;
  level: number;
  /** Lower tier's score against the higher tier: [label, before, after]. */
  cross: [string, number, number][];
  /** Spread (standard deviation) of card scores inside each tier against the same tier: [before, after]. */
  spread: Record<Tier, [number, number]>;
  /** Score against a side with no augments: [label, before, after]. */
  combos: [string, number, number][];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="badge" style={{ background: BADGE[tier].bg, color: BADGE[tier].fg }}>
      {TIER_NAME[tier]}
    </span>
  );
}

function KindBadge({ id }: { id: string }) {
  const c = cardById(id);
  return <span className="badge kind">{c.kind === 'passive' ? '패시브' : `액티브 · ${c.uses}회`}</span>;
}

function Icon({ id, size = 56 }: { id: string; size?: number }) {
  const c = cardById(id);
  return (
    <div className="icon" style={{ width: size, height: size, padding: Math.round(size * 0.08), color: ACCENT[c.tier] }}>
      <CardIcon icon={c.icon} />
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2>
        <span className="num">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChangeCard({ ch }: { ch: Change }) {
  const c = cardById(ch.id);
  return (
    <div className={`change tier-${c.tier}`}>
      <Icon id={ch.id} />
      <div className="body">
        <div className="title">
          <span className="name" style={{ color: ACCENT[c.tier] }}>
            {c.name}
          </span>
          {ch.from ? (
            <>
              <TierBadge tier={ch.from} />
              <span className="arrow">→</span>
            </>
          ) : null}
          <TierBadge tier={c.tier} />
          <KindBadge id={ch.id} />
          {ch.tags.map((t) => (
            <span key={t} className="tag" style={{ color: TAG[t].color, borderColor: TAG[t].color }}>
              {TAG[t].label}
            </span>
          ))}
        </div>
        <table className="rows">
          <colgroup>
            <col className="c-what" />
            <col className="c-before" />
            <col className="c-to" />
            <col />
          </colgroup>
          <tbody>
            {ch.rows.map(([what, before, after]) => (
              <tr key={what}>
                <td className="what">{what}</td>
                <td className="before">{before}</td>
                <td className="to">▶</td>
                <td className="after">{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text">{c.text}</p>
        <p className="note">{ch.note}</p>
      </div>
    </div>
  );
}

function NewCard({ id, note }: { id: string; note: string }) {
  const c = cardById(id);
  const conflicts = conflictNames(id);
  return (
    <div className={`newcard tier-${c.tier}`}>
      <div className="head">
        <Icon id={id} size={64} />
        <div>
          <div className="name" style={{ color: ACCENT[c.tier] }}>
            {c.name} <span className="new">NEW</span>
          </div>
          <div className="badges">
            <TierBadge tier={c.tier} />
            <KindBadge id={id} />
            <span className="badge kind">{CATEGORY_NAME[c.category]}</span>
          </div>
        </div>
      </div>
      <p className="text">{c.text}</p>
      {conflicts.length ? <p className="conflict">함께 가질 수 없음: {conflicts.join(', ')}</p> : null}
      <p className="note">{note}</p>
    </div>
  );
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function Notes({ sim }: { sim: SimSummary | null }) {
  const conflictPairs = new Set<string>();
  for (const c of RUN_CARDS) for (const o of c.conflicts ?? []) conflictPairs.add([c.id, o].sort().join('|'));
  const hillBoss = BOSSES[3].find((b) => b.id === 'hill_king')!;
  return (
    <main>
      <header className="hero">
        <div className="kicker">BREAK CHESS · PATCH NOTES</div>
        <h1>
          {VERSION} 패치 <span>「균형의 왕관」</span>
        </h1>
        <div className="date">{DATE} · 밸런스 패치</div>
        <ul className="highlights">
          <li>도전 보상 3장이 이제 언제나 같은 등급으로 나옵니다</li>
          <li>언덕의 왕은 한 턴을 버텨야 승리, 퀸은 보호막을 얻지 않음</li>
          <li>증강 {CHANGES.length}종 조정(등급 이동 {CHANGES.filter((c) => c.from).length}종), 신규 증강 {NEW_CARDS.length}종</li>
          <li>함께 가질 수 없는 증강 조합 도입</li>
        </ul>
      </header>

      <Section n={1} title="개발자 코멘트">
        <div className="comment">
          <p>안녕하세요, 브레이크 체스 개발팀입니다. 1.1 패치는 증강 전체를 처음으로 다시 들여다본 밸런스 패치입니다. 플레이 기록과 시뮬레이션에서 세 가지 문제가 크게 보였습니다.</p>
          <p>
            <b>첫째, 고르는 재미가 없는 보상.</b> 도전 보상 세 장의 등급이 제각각 나와서, 프리즘이 한 장이라도 섞여 있으면 고민할 것 없이 그 카드를 가져가게 됐습니다. 증강은 많이 가질수록 손해가 없으니
            높은 등급이 언제나 정답이었고, 보상 화면은 선택이 아니라 확인 버튼이 되어 버렸습니다.
          </p>
          <p>
            <b>둘째, 막을 수 없는 조합.</b> 언덕의 왕과 전사왕은 세 수, 돌파와 조기 승진과 돌격 행군은 두 수 만에 상대가 무엇을 하든 승리했습니다. 대관식은 두 번째 수에 퀸을 만들었습니다. 3막 보스
            「언덕의 왕」이 바로 그 조합이었습니다.
          </p>
          <p>
            <b>셋째, 보호막을 두른 퀸.</b> 카드 하나씩의 힘을 측정했더니, 퀸에게 보호막을 씌우는 카드가 모든 등급에서 1위였습니다. 반대로 측면 행군·전술적 후퇴·돌파처럼 들고 있어도 승률이 거의 오르지 않는
            카드도 있었습니다.
          </p>
          <p>
            이번 패치의 목표는 한 문장입니다. <b className="gold">“등급은 운이 정하고, 고르는 건 실력이 정한다.”</b> 높은 등급은 여전히 더 강합니다. 그 대신 같은 등급끼리 겨루게 해서, 어떤 카드를
            고를지는 지금 내 빌드에 무엇이 어울리는지로 정해지게 했습니다.
          </p>
        </div>
      </Section>

      <Section n={2} title="시스템 변경">
        <h3>도전 보상은 한 번에 한 등급</h3>
        <p>
          대국·정예·보물·보스 보상과 이벤트에서 제시되는 세 장은 이제 <b>모두 같은 등급</b>입니다. 등급은 제시마다 한 번 정해지고, 칸이 위험할수록 높은 등급이 잘 나옵니다. 그 등급의 카드가 부족할 때만 가까운
          등급으로 채웁니다.
        </p>
        <table className="grid">
          <thead>
            <tr>
              <th>칸</th>
              <th>1막</th>
              <th>2막</th>
              <th>3막</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['대국', REWARD_WEIGHTS.battle],
                ['정예', REWARD_WEIGHTS.elite],
                ['보물', REWARD_WEIGHTS.treasure],
              ] as const
            ).map(([name, w]) => (
              <tr key={name}>
                <td>{name}</td>
                {w.map((row, i) => (
                  <td key={i}>{row.map((v, t) => `${TIER_NAME[TIERS[t]]} ${v}`).join(' · ')}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td>보스</td>
              <td colSpan={3}>언제나 프리즘</td>
            </tr>
          </tbody>
        </table>
        <p className="small">
          상점은 그대로 실버 2 · 골드 2 · 프리즘 1장을 진열합니다. 상점에서는 가격이 등급의 대가이기 때문입니다. 자유 대전의 드래프트는 원래부터 라운드마다 양쪽이 같은 등급을 받습니다.
        </p>

        <h3>함께 가질 수 없는 증강</h3>
        <p>서로 만나면 막을 수 없거나, 한쪽이 아무 일도 하지 않게 되는 조합은 함께 가질 수 없습니다. 이미 가진 증강과 부딪히는 카드는 아예 제시되지 않습니다.</p>
        <ul className="pairs">
          {[...conflictPairs].map((pair) => {
            const [a, b] = pair.split('|');
            return (
              <li key={pair}>
                <b style={{ color: ACCENT[cardById(a).tier] }}>{cardById(a).name}</b> × <b style={{ color: ACCENT[cardById(b).tier] }}>{cardById(b).name}</b>
              </li>
            );
          })}
        </ul>
        <h3>쓸모없는 카드는 제시하지 않음</h3>
        <p>도전에서도 카드의 제시 조건을 확인합니다. 예를 들어 보호막을 얻을 방법이 없으면 「가시 갑옷」이 나오지 않습니다. 적의 증강 구성도 같은 규칙을 따릅니다.</p>
      </Section>

      <Section n={3} title="규칙 변경">
        <h3>언덕의 왕</h3>
        <div className="rule">
          <div>
            <div className="label">변경 전</div>
            <p>킹이 중앙 네 칸(d4·e4·d5·e5)에 <b>들어서는 순간</b> 승리했습니다. 상대 기물이 노리는 칸이어도 상관없었습니다.</p>
          </div>
          <div className="to">▶</div>
          <div>
            <div className="label">변경 후</div>
            <p>{cardById('king_of_the_hill').text}</p>
          </div>
        </div>
        <ul>
          <li>중앙의 킹은 상대가 잡을 수 있는 마지막 기회입니다. 보호막(「왕관의 가호」)이 있으면 한 번은 버팁니다.</li>
          <li>킹 포획 규칙과 같은 원리입니다. 원래 언덕의 왕 변형에서 체크인 칸으로 들어갈 수 없는 것처럼, 이제 노려지는 언덕에 오르면 잡힙니다.</li>
          <li>
            3막 보스 「{hillBoss.name}」의 고유 증강 중 왕관의 가호를 근위대로 바꿨습니다. {hillBoss.blurb}
          </li>
          <li>AI도 새 규칙에 맞춰, 상대 기물이 많이 남은 중반에는 킹을 중앙으로 서둘러 내보내지 않습니다.</li>
        </ul>
        <h3>퀸과 보호막</h3>
        <div className="rule">
          <div>
            <div className="label">변경 전</div>
            <p>보호막 카드가 퀸에게도 보호막을 씌웠습니다.</p>
          </div>
          <div className="to">▶</div>
          <div>
            <div className="label">변경 후</div>
            <p>
              <b>퀸은 카드로 보호막을 얻지 않습니다.</b> (보호막, 근위대, 신성한 가호, 부활의 성배, 보병의 투지)
            </p>
          </div>
        </div>
        <p>
          보호막을 두른 퀸은 지켜진 기물을 잡아도 상대의 반격이 보호막에 막혀 그대로 살아남았습니다. 사실상 기물을 공짜로 빼앗는 셈이라, 측정해 보니 퀸에게 보호막을 씌우는 카드가 실버·골드·프리즘 세 등급 모두에서 1위였습니다.
          다른 기물의 보호막은 그대로입니다.
        </p>
      </Section>

      <Section n={4} title="증강 조정">
        {TIERS.map((t) => {
          const list = CHANGES.filter((c) => cardById(c.id).tier === t);
          if (!list.length) return null;
          return (
            <div key={t} className="tier-group">
              <h3 style={{ color: ACCENT[t] }}>{TIER_NAME[t]}</h3>
              {list.map((ch) => (
                <ChangeCard key={ch.id} ch={ch} />
              ))}
            </div>
          );
        })}
      </Section>

      <Section n={5} title={`신규 증강 ${NEW_CARDS.length}종`}>
        <div className="newgrid">
          {NEW_CARDS.map((n) => (
            <NewCard key={n.id} id={n.id} note={n.note} />
          ))}
        </div>
      </Section>

      <Section n={6} title="버그 수정 및 개선">
        <ul>
          {FIXES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </Section>

      {sim ? (
        <Section n={7} title="개발 노트: 숫자로 본 이번 패치">
          <p>
            AI(레벨 {sim.level}) 두 명에게 증강을 쥐여 주고 색을 바꿔 가며 카드마다 {sim.games}판씩 둔 결과입니다. 승점은 이긴 판 1, 비긴 판 0.5로 셉니다. 판 수가 많지 않아 카드 하나하나의 숫자는 오차가
            크므로, 여러 번의 측정에서 같은 방향으로 나온 결과만 패치에 반영했습니다.
          </p>
          <h3>등급의 무게: 낮은 등급 카드가 높은 등급 카드를 상대로 낸 승점 ({sim.crossGames}판씩)</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>대결</th>
                <th>패치 전</th>
                <th>패치 후</th>
              </tr>
            </thead>
            <tbody>
              {sim.cross.map(([name, before, after]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{pct(before)}</td>
                  <td>{pct(after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            두 대결 모두 50%보다 분명히 낮아, 높은 등급은 여전히 더 강합니다. 실버와 골드의 차이가 조금 좁혀진 것은 약하던 실버 카드(측면 행군, 전술적 후퇴)를 끌어올리고 퀸의 보호막을 막은 결과입니다.
          </p>
          <h3>등급 안의 고른 정도: 같은 등급끼리 붙였을 때 승점의 표준편차</h3>
          <table className="grid">
            <thead>
              <tr>
                <th></th>
                {TIERS.map((t) => (
                  <th key={t}>{TIER_NAME[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>패치 전</td>
                {TIERS.map((t) => (
                  <td key={t}>{sim.spread[t][0].toFixed(2)}</td>
                ))}
              </tr>
              <tr>
                <td>패치 후</td>
                {TIERS.map((t) => (
                  <td key={t}>{sim.spread[t][1].toFixed(2)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="small">낮을수록 같은 등급의 카드들이 비슷한 힘을 가집니다. 한 제시의 세 장이 모두 같은 등급이 된 만큼, 이 숫자가 곧 "고를 맛"입니다.</p>
          <h3>눈여겨볼 카드와 조합: 증강이 없는 상대에게 낸 승점</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>증강</th>
                <th>패치 전</th>
                <th>패치 후</th>
              </tr>
            </thead>
            <tbody>
              {sim.combos.map(([name, before, after]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{pct(before)}</td>
                  <td>{after < 0 ? '함께 가질 수 없음' : pct(after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section n={sim ? 8 : 7} title="다음 패치 예고 (개발 중)">
        <p className="small">아래는 아직 실험 중인 아이디어입니다. 실제 출시 내용은 달라질 수 있습니다.</p>
        <ul className="next">
          {NEXT.map(([name, text]) => (
            <li key={name}>
              <b>{name}</b> — {text}
            </li>
          ))}
        </ul>
      </Section>

      <Section n={sim ? 9 : 8} title="부록: 1.1 기준 증강 목록">
        {TIERS.map((t) => (
          <div key={t} className="appendix">
            <h3 style={{ color: ACCENT[t] }}>
              {TIER_NAME[t]} <span className="count">{RUN_CARDS.filter((c) => c.tier === t).length}종</span>
            </h3>
            <div className="mini-grid">
              {RUN_CARDS.filter((c) => c.tier === t).map((c) => (
                <div key={c.id} className="mini">
                  <Icon id={c.id} size={30} />
                  <div>
                    <div className="mini-name">{c.name}</div>
                    <div className="mini-kind">{c.kind === 'passive' ? '패시브' : `액티브 ${c.uses}회`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="small">자유 대전 전용: 투자(실버), 총동원령(프리즘).</p>
      </Section>

      <footer>브레이크 체스 개발팀 · 즐거운 대국 되세요!</footer>
    </main>
  );
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #0e0b12; color: #e9e3f0; }
body { font-family: 'Noto Sans KR', sans-serif; font-size: 10.5pt; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
main { padding: 12mm 15mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
b { color: #fff; }
b.gold, .gold { color: #f3d98f; }
.hero { border-radius: 14px; padding: 12mm 10mm 9mm; margin-bottom: 8mm;
  background: radial-gradient(circle at 85% 0%, rgba(180,140,255,.35), transparent 55%), radial-gradient(circle at 0% 100%, rgba(232,196,106,.25), transparent 55%), #1b1622;
  border: 1px solid #3d3349; }
.kicker { font-family: 'Cinzel', serif; letter-spacing: .3em; font-size: 9pt; color: #a497b6; }
h1 { font-family: 'Noto Serif KR', serif; font-size: 30pt; margin: 2mm 0 1mm; color: #f3d98f; line-height: 1.2; }
h1 span { font-size: 18pt; color: #dccbff; }
.date { color: #a497b6; }
.highlights { margin: 5mm 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; }
.highlights li { padding-left: 5mm; position: relative; }
.highlights li::before { content: '◆'; position: absolute; left: 0; color: #e8c46a; font-size: 8pt; top: 1px; }
section { margin-bottom: 7mm; }
h2 { font-family: 'Noto Serif KR', serif; font-size: 17pt; color: #f3d98f; border-bottom: 1px solid #3d3349; padding-bottom: 2mm; margin: 0 0 4mm; break-after: avoid; }
h2 .num { font-family: 'Cinzel', serif; color: #7a6c8f; margin-right: 3mm; font-size: 13pt; }
h3 { font-size: 12.5pt; margin: 5mm 0 2mm; color: #e9e3f0; break-after: avoid; }
p { margin: 0 0 2.5mm; }
ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1.5mm; }
.small { font-size: 9pt; color: #a497b6; }
.comment { background: #1b1622; border-left: 3px solid #e8c46a; padding: 4mm 5mm; border-radius: 0 10px 10px 0; }
.badge { display: inline-block; border-radius: 999px; padding: 0 2.4mm; font-size: 8pt; font-weight: 700; line-height: 1.7; margin-right: 1.2mm; }
.badge.kind { background: #2e2639; color: #cbc1d8; font-weight: 500; }
.tag { display: inline-block; border: 1px solid; border-radius: 4px; padding: 0 1.6mm; font-size: 8pt; font-weight: 700; margin-left: 1mm; line-height: 1.6; }
.arrow { color: #a497b6; margin-right: 1.2mm; font-size: 9pt; }
.icon { flex: none; border-radius: 12px; background: radial-gradient(circle at 50% 40%, rgba(255,255,255,.12), transparent 70%), #15111b; }
.icon svg { width: 100%; height: 100%; display: block; }
.grid { width: 100%; border-collapse: collapse; margin: 2mm 0 3mm; font-size: 9pt; }
.grid th, .grid td { border: 1px solid #3d3349; padding: 1.5mm 2mm; text-align: center; }
.grid th { background: #221c2b; color: #f3d98f; font-weight: 700; }
.grid td:first-child { font-weight: 700; color: #e9e3f0; }
.pairs { list-style: none; padding: 0; display: flex; gap: 3mm; flex-wrap: wrap; }
.pairs li { background: #1b1622; border: 1px solid #3d3349; border-radius: 8px; padding: 1.5mm 3mm; }
.rule { display: grid; grid-template-columns: 1fr 8mm 1fr; align-items: center; gap: 2mm; background: #1b1622; border: 1px solid #3d3349; border-radius: 10px; padding: 4mm; margin-bottom: 3mm; }
.rule .label { font-size: 8.5pt; color: #a497b6; font-weight: 700; margin-bottom: 1mm; }
.rule .to { color: #e8c46a; text-align: center; font-size: 14pt; }
.tier-group { margin-bottom: 2mm; }
.change { display: flex; gap: 4mm; background: #1b1622; border: 1px solid #3d3349; border-radius: 12px; padding: 3.5mm 4mm; margin-bottom: 3mm; break-inside: avoid; }
.change.tier-gold { border-color: #6b5626; }
.change.tier-prism { border-color: #4f3f7a; }
.change .body { flex: 1; min-width: 0; }
.change .title { display: flex; align-items: center; flex-wrap: wrap; gap: 1mm 0; margin-bottom: 1.5mm; }
.change .name { font-size: 12.5pt; font-weight: 700; margin-right: 2.5mm; }
.rows { border-collapse: collapse; margin-bottom: 1.5mm; font-size: 9.5pt; width: 100%; table-layout: fixed; }
.rows col.c-what { width: 27mm; } .rows col.c-before { width: 42mm; } .rows col.c-to { width: 5mm; }
.rows td { padding: .4mm 2mm .4mm 0; vertical-align: top; }
.rows .what { color: #a497b6; min-width: 24mm; }
.rows .before { color: #a497b6; text-decoration: line-through; text-decoration-color: rgba(242,149,140,.7); }
.rows .to { color: #e8c46a; }
.rows .after { color: #fff; font-weight: 700; }
.text { color: #cbc1d8; font-size: 9.5pt; }
.note { color: #a497b6; font-size: 9pt; font-style: italic; margin: 0; }
.note::before { content: '개발 노트 · '; font-style: normal; color: #7a6c8f; font-weight: 700; }
.newgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.newcard { background: #1b1622; border: 1px solid #3d3349; border-radius: 12px; padding: 4mm; break-inside: avoid; }
.newcard.tier-gold { border-color: #6b5626; }
.newcard.tier-prism { border-color: #4f3f7a; }
.newcard .head { display: flex; gap: 3mm; align-items: center; margin-bottom: 2mm; }
.newcard .name { font-size: 13pt; font-weight: 700; }
.newcard .new { font-family: 'Cinzel', serif; font-size: 7.5pt; background: #e5675d; color: #fff; border-radius: 4px; padding: 0 1.4mm; vertical-align: middle; }
.conflict { color: #f2958c; font-size: 9pt; }
.next li { margin-bottom: 2mm; }
.appendix { break-inside: avoid; }
.appendix .count { font-size: 9pt; color: #a497b6; font-weight: 400; }
.mini-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; }
.mini { display: flex; gap: 2mm; align-items: center; background: #1b1622; border-radius: 8px; padding: 1.5mm 2mm; }
.mini .icon { border-radius: 6px; }
.mini-name { font-size: 9pt; font-weight: 700; line-height: 1.3; }
.mini-kind { font-size: 7.5pt; color: #a497b6; line-height: 1.3; }
footer { text-align: center; color: #7a6c8f; font-size: 9pt; margin-top: 8mm; font-family: 'Noto Serif KR', serif; }
`;

/** The full HTML page. `fontBase` is the path from the HTML file to node_modules/@fontsource. */
export function renderPatchNotes(sim: SimSummary | null, fontBase: string): string {
  const fonts = ['noto-sans-kr/400.css', 'noto-sans-kr/700.css', 'noto-serif-kr/700.css', 'cinzel/600.css']
    .map((f) => `<link rel="stylesheet" href="${fontBase}/${f}">`)
    .join('\n');
  const body = renderToStaticMarkup(<Notes sim={sim} />);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>브레이크 체스 ${VERSION} 패치 노트</title>
${fonts}
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}
