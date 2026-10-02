import { useEffect, useRef, useState } from 'react';
import { cardById } from '../../engine/augments/cards';
import { COLOR_NAME, KIND_POINTS, KING, sqName, type Color } from '../../engine/game/types';
import { cardTargets, nextDraftPly, type MatchState } from '../../engine/match/match';
import { humanControls, useGame } from '../../state/gameStore';
import { PieceSvg } from '../board/PieceSvg';
import { CardArt, KindBadge, TierBadge } from '../cards/CardView';
import { uiType } from './boardModel';
import { resultDetail, resultTitle, sideName } from './labels';

const VALUE_ORDER = [5, 8, 7, 4, 3, 2, 1];

function material(m: MatchState, c: Color): number {
  let v = 0;
  for (let sq = 0; sq < 64; sq++) {
    const code = m.pos.board[sq];
    if (code && code >> 4 === c && (code & 15) !== KING) v += KIND_POINTS[code & 15];
  }
  return v;
}

/** Name, turn marker, pieces taken from the opponent, victory-condition counters. */
export function PlayerBar({ m, color }: { m: MatchState; color: Color }) {
  const thinking = useGame((s) => s.thinking);
  const toMove = m.phase === 'play' && m.pos.side === color;
  const opp = (color ^ 1) as Color;
  const taken: number[] = [];
  for (const k of VALUE_ORDER) for (let i = 0; i < m.pos.lost[opp * 16 + k]; i++) taken.push(k);
  const diff = material(m, color) - material(m, opp);
  const r = m.pos.rules[color];
  const aiTurn = toMove && !humanControls(m, color);
  return (
    <div className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-1.5 ${toMove ? 'bg-ink-800/90 ring-1 ring-gold-500/40' : 'bg-ink-900/50'}`}>
      <span
        className={`h-4 w-4 shrink-0 rounded-full border ${color === 0 ? 'border-[#2a2018] bg-[#f4ecdc]' : 'border-[#e9dcc8] bg-[#2a2230]'} ${toMove ? 'pulse-gold' : ''}`}
      />
      <span className="font-bold text-ink-100">{sideName(m, color)}</span>
      {m.setup.mode === 'ai' ? <span className="text-xs text-ink-400">({COLOR_NAME[color]})</span> : null}
      {aiTurn && thinking ? <span className="animate-pulse text-xs text-gold-300">생각 중…</span> : null}
      <div className="ml-auto flex items-center gap-1.5">
        {r.threeCheck ? (
          <span className="rounded-full bg-blood-600/40 px-2 py-[1px] text-[11px] font-bold text-blood-300" title="세 번의 체크">
            체크 {Math.min(3, m.pos.checks[color])}/3
          </span>
        ) : null}
        {r.kingOfTheHill ? (
          <span className="rounded-full bg-gold-600/40 px-2 py-[1px] text-[11px] font-bold text-gold-300" title="언덕의 왕">
            언덕
          </span>
        ) : null}
        {r.breakthrough ? (
          <span className="rounded-full bg-arcane-500/30 px-2 py-[1px] text-[11px] font-bold text-arcane-300" title="돌파">
            돌파
          </span>
        ) : null}
        <div className="flex items-center">
          {taken.slice(0, 15).map((k, i) => (
            <PieceSvg key={i} type={uiType(k)} side={opp === 0 ? 'white' : 'black'} className="-ml-1 h-5 w-5 first:ml-0" />
          ))}
        </div>
        {diff > 0 ? <span className="text-xs font-bold text-ink-200">+{diff}</span> : null}
      </div>
    </div>
  );
}

/** A side's augments; active cards get a use button on that side's turn. */
export function AugmentPanel({ m, color }: { m: MatchState; color: Color }) {
  const targeting = useGame((s) => s.targeting);
  const thinking = useGame((s) => s.thinking);
  const beginCard = useGame((s) => s.beginCard);
  const cancel = useGame((s) => s.cancel);
  const [open, setOpen] = useState<string | null>(null);
  const side = m.sides[color];
  const mine = m.setup.mode === 'ai' && color === m.setup.human;
  const title = m.setup.mode === 'ai' ? (mine ? '나의 증강' : '상대의 증강') : `${COLOR_NAME[color]}의 증강`;
  const human = humanControls(m, color);
  return (
    <section className="panel p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-200">
        <span className={`h-3 w-3 rounded-full border ${color === 0 ? 'border-[#2a2018] bg-[#f4ecdc]' : 'border-[#e9dcc8] bg-[#2a2230]'}`} />
        {title}
        <span className="ml-auto text-xs font-normal text-ink-400">{m.setup.drafts === false ? `${side.cards.length}개` : `${side.cards.length}/3`}</span>
      </h3>
      {side.cards.length === 0 ? <p className="text-xs text-ink-400">{m.setup.drafts === false ? '증강이 없습니다.' : '아직 고른 증강이 없습니다.'}</p> : null}
      <ul className="flex flex-col gap-2">
        {side.cards.map((c) => {
          const def = cardById(c.id);
          const usable = human && !thinking && cardTargets(m, color, c.id).length > 0;
          const isTargeting = targeting === c.id;
          return (
            <li key={c.id} className="rounded-lg bg-ink-900/60 p-2">
              <div className="flex items-center gap-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <CardArt id={c.id} size="h-10 w-10" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink-100">{def.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <TierBadge tier={def.tier} />
                      <KindBadge id={c.id} uses={def.kind === 'active' ? c.uses : undefined} />
                    </div>
                  </div>
                </button>
                {def.kind === 'active' && human ? (
                  isTargeting ? (
                    <button type="button" className="btn px-3 py-1.5 text-xs" onClick={cancel}>
                      취소
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn px-3 py-1.5 text-xs ${usable ? 'btn-gold' : ''}`}
                      disabled={!usable}
                      onClick={() => beginCard(c.id)}
                      title={usable ? '자기 턴에 수를 두기 전에 사용합니다(턴을 쓰지 않음, 한 턴에 한 장)' : '지금은 사용할 수 없습니다'}
                    >
                      사용
                    </button>
                  )
                ) : null}
              </div>
              {open === c.id || isTargeting ? <p className="mt-2 text-xs leading-relaxed text-ink-200">{def.text}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What is going on, what to do next, and when the next draft opens. */
export function StatusCard({ m }: { m: MatchState }) {
  const thinking = useGame((s) => s.thinking);
  const targeting = useGame((s) => s.targeting);
  const cancel = useGame((s) => s.cancel);
  let text: string;
  let tone = 'text-ink-100';
  if (m.phase === 'over') {
    text = `${resultTitle(m)} — ${resultDetail(m)}`;
    tone = 'text-gold-300';
  } else if (m.phase === 'draft') {
    text = '증강을 고르는 중입니다';
  } else if (targeting) {
    text = cardById(targeting).targetHint ?? '대상을 고르세요';
    tone = 'text-arcane-300';
  } else {
    const us = m.pos.side as Color;
    const check = m.pos.inCheck(us);
    if (humanControls(m, us)) {
      text = m.setup.mode === 'ai' ? '당신의 차례입니다' : `${COLOR_NAME[us]}의 차례입니다`;
      if (check) {
        text += ' — 킹이 공격받고 있습니다!';
        tone = 'text-blood-300';
      }
    } else {
      text = thinking ? 'AI가 수를 읽고 있습니다…' : 'AI의 차례입니다';
    }
  }
  const next = nextDraftPly(m);
  return (
    <section className="panel flex flex-col gap-1 p-3">
      <div className={`text-base font-bold ${tone}`}>{text}</div>
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span>{m.pos.fullmove}수째</span>
        <span>·</span>
        {m.setup.drafts === false ? null : <span>{next === null ? '증강 선택 3회 모두 완료' : `${(next >> 1) + 1}수째에 다음 증강 선택`}</span>}
        {targeting ? (
          <button type="button" className="btn ml-auto px-2 py-1 text-xs" onClick={cancel}>
            취소
          </button>
        ) : null}
      </div>
    </section>
  );
}

interface Cell {
  san: string;
  cards: { card: string; sq: number }[];
}
type Row = { kind: 'move'; n: number; white?: Cell; black?: Cell } | { kind: 'pick'; round: number; picks: { color: Color; card: string }[] };

function CellView({ cell }: { cell?: Cell }) {
  if (!cell) return <span className="text-ink-500">…</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {cell.cards.map((c, i) => (
        <span key={i} className="rounded bg-violet-glow/20 px-1 text-[10px] text-violet-glow" title={cardById(c.card).text}>
          {cardById(c.card).name} {sqName(c.sq)}
        </span>
      ))}
      <span>{cell.san}</span>
    </span>
  );
}

/** The game record, with card uses and draft picks inline. */
export function MoveList({ m }: { m: MatchState }) {
  const ref = useRef<HTMLDivElement>(null);
  const rows: Row[] = [];
  const cardsByPly = new Map<number, { card: string; sq: number }[]>();
  for (const l of m.log) if (l.kind === 'card') cardsByPly.set(l.ply, [...(cardsByPly.get(l.ply) ?? []), { card: l.card, sq: l.sq }]);
  for (const l of m.log) {
    if (l.kind === 'pick') {
      const last = rows[rows.length - 1];
      if (last && last.kind === 'pick' && last.round === l.round) last.picks.push({ color: l.color, card: l.card });
      else rows.push({ kind: 'pick', round: l.round, picks: [{ color: l.color, card: l.card }] });
    } else if (l.kind === 'move') {
      const cell: Cell = { san: l.san, cards: cardsByPly.get(l.ply) ?? [] };
      const n = (l.ply >> 1) + 1;
      const last = rows[rows.length - 1];
      if (l.color === 1 && last && last.kind === 'move' && last.n === n && !last.black) {
        last.black = cell;
      } else {
        const row: Extract<Row, { kind: 'move' }> = { kind: 'move', n };
        if (l.color === 0) row.white = cell;
        else row.black = cell;
        rows.push(row);
      }
    }
  }
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [m.log.length]);
  return (
    <section className="panel flex min-h-0 flex-col p-3">
      <h3 className="mb-2 text-sm font-bold text-ink-200">기보</h3>
      <div ref={ref} className="max-h-56 overflow-y-auto rounded-lg bg-ink-900/60 p-2 font-mono text-xs text-ink-200 lg:max-h-72">
        {rows.length === 0 ? <p className="font-sans text-ink-400">아직 둔 수가 없습니다.</p> : null}
        {rows.map((r, i) =>
          r.kind === 'pick' ? (
            <div key={i} className="my-1 rounded bg-gold-600/15 px-2 py-1 font-sans text-[11px] text-gold-300">
              {r.round}라운드 증강 —{' '}
              {r.picks
                .slice()
                .sort((a, b) => a.color - b.color)
                .map((p) => `${COLOR_NAME[p.color]}: ${cardById(p.card).name}`)
                .join(' · ')}
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[2.2rem_1fr_1fr] items-start gap-1 py-[2px]">
              <span className="text-ink-500">{r.n}.</span>
              <CellView cell={r.white} />
              {r.black || r.white ? <CellView cell={r.black} /> : null}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
