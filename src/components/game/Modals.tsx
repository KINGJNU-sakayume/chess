import { useState } from 'react';
import { cardById } from '../../engine/augments/cards';
import { DRAFT_PLIES } from '../../engine/augments/draft';
import { COLOR_NAME, KIND_NAME, movePromo, type Color } from '../../engine/game/types';
import type { MatchState } from '../../engine/match/match';
import { humanControls, useGame } from '../../state/gameStore';
import { PieceSvg } from '../board/PieceSvg';
import { CardArt, CardView, TierBadge } from '../cards/CardView';
import { resultDetail, resultTitle, sideName } from './labels';
import { uiType } from './boardModel';

const ROUND_LABEL = ['게임 시작', `${(DRAFT_PLIES[1] >> 1) + 1}수째`, `${(DRAFT_PLIES[2] >> 1) + 1}수째`];

function OwnedList({ m, color }: { m: MatchState; color: Color }) {
  const cards = m.sides[color].cards;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs text-ink-400">{sideName(m, color)}:</span>
      {cards.length === 0 ? <span className="text-xs text-ink-500">없음</span> : null}
      {cards.map((c) => (
        <span key={c.id} className="flex items-center gap-1 rounded-full bg-ink-800 py-0.5 pl-0.5 pr-2 text-xs text-ink-200" title={cardById(c.id).text}>
          <CardArt id={c.id} size="h-5 w-5" />
          {cardById(c.id).name}
        </span>
      ))}
    </div>
  );
}

/** Choose one of three augments. Shown to whichever human has an open offer. */
export function DraftModal({ m }: { m: MatchState }) {
  const pick = useGame((s) => s.pick);
  const reroll = useGame((s) => s.reroll);
  const [chosen, setChosen] = useState<string | null>(null);
  if (m.phase !== 'draft') return null;
  const color = ([0, 1] as Color[]).find((c) => m.sides[c].offer && humanControls(m, c));
  if (color === undefined) {
    return (
      <div className="modal-enter fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
        <div className="panel animate-pulse px-6 py-4 text-ink-200">상대가 증강을 고르고 있습니다…</div>
      </div>
    );
  }
  const side = m.sides[color];
  const offer = side.offer!;
  const tier = side.offerTier!;
  const opp = (color ^ 1) as Color;
  return (
    <div className="modal-enter fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-[3px]">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-5 p-4 py-8">
        <div className="text-center">
          <div className="text-sm text-ink-300">
            {m.round}/3 라운드 · {ROUND_LABEL[m.round - 1]}
          </div>
          <h2 className="mt-1 font-serif-kr text-3xl font-bold text-gold-300">
            {m.setup.mode === 'local' ? `${COLOR_NAME[color]}의 증강 선택` : '증강을 하나 고르세요'}
          </h2>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-200">
            <TierBadge tier={tier} /> 등급 증강이 제시되었습니다
          </div>
        </div>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {offer.map((id, i) => (
            <div key={`${id}-${side.rerollCount}`} className="card-enter" style={{ animationDelay: `${i * 80}ms` }}>
              <CardView id={id} selected={chosen === id} onClick={() => setChosen(id)} />
            </div>
          ))}
        </div>
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={side.rerolls <= 0}
              onClick={() => {
                setChosen(null);
                reroll();
              }}
            >
              새로고침 ({side.rerolls}회 남음)
            </button>
            <button
              type="button"
              className="btn btn-gold min-w-48"
              disabled={!chosen || !offer.includes(chosen)}
              onClick={() => {
                if (chosen) pick(chosen);
                setChosen(null);
              }}
            >
              {chosen && offer.includes(chosen) ? `「${cardById(chosen).name}」 선택` : '카드를 고르세요'}
            </button>
          </div>
          <div className="panel flex w-full max-w-3xl flex-col gap-1.5 p-3">
            <OwnedList m={m} color={color} />
            <OwnedList m={m} color={opp} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Both picks of a finished draft round, side by side. */
export function RevealModal({ m }: { m: MatchState }) {
  const reveal = useGame((s) => s.reveal);
  const close = useGame((s) => s.closeReveal);
  if (!reveal || m.phase === 'over') return null;
  const order: Color[] = m.setup.mode === 'ai' ? [m.setup.human, (m.setup.human ^ 1) as Color] : [0, 1];
  return (
    <div className="modal-enter fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-[2px]" onClick={close}>
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-4 p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif-kr text-2xl font-bold text-gold-300">{reveal.round}라운드 증강 공개</h2>
        <div className="grid w-full gap-4 sm:grid-cols-2">
          {order.map((c) => (
            <div key={c} className="card-enter flex flex-col gap-2">
              <div className="text-center text-sm font-bold text-ink-200">
                {sideName(m, c)} ({COLOR_NAME[c]})
              </div>
              {reveal.picks[c] ? <CardView id={reveal.picks[c]!} /> : <div className="panel p-4 text-center text-ink-400">선택 없음</div>}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-gold min-w-48" onClick={close} autoFocus>
          대국 계속
        </button>
      </div>
    </div>
  );
}

/** Game over: result, reason, next steps. */
export function ResultModal({ m, onRematch, onNew, onClose }: { m: MatchState; onRematch: () => void; onNew: () => void; onClose: () => void }) {
  if (m.phase !== 'over') return null;
  const win = m.result?.winner;
  const good = m.setup.mode === 'local' || win === -1 || win === m.setup.human;
  return (
    <div className="modal-enter absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
      <div className="panel flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center">
        <div className={`font-serif-kr text-4xl font-bold ${good ? 'text-gold-300' : 'text-blood-300'}`}>{resultTitle(m)}</div>
        <p className="text-sm text-ink-200">{resultDetail(m)}</p>
        <p className="text-xs text-ink-400">
          {m.pos.fullmove}수 · 사용한 증강: {m.sides[0].cards.length + m.sides[1].cards.length}장
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <button type="button" className="btn btn-gold" onClick={onRematch}>
            같은 설정으로 다시 하기
          </button>
          <button type="button" className="btn" onClick={onNew}>
            새 대국 설정
          </button>
          <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
            보드 살펴보기
          </button>
        </div>
      </div>
    </div>
  );
}

/** Promotion choice over the board. */
export function PromotionPicker({ moves, color, onPick, onCancel }: { moves: number[]; color: Color; onPick: (m: number) => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="panel flex flex-col items-center gap-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold text-gold-300">승진할 기물을 고르세요</div>
        <div className="flex gap-2">
          {moves.map((mv) => {
            const kind = movePromo(mv);
            return (
              <button key={mv} type="button" className="btn h-20 w-20 flex-col gap-0 p-1" onClick={() => onPick(mv)}>
                <PieceSvg type={uiType(kind)} side={color === 0 ? 'white' : 'black'} className="h-12 w-12" />
                <span className="text-[11px] text-ink-200">{KIND_NAME[kind]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

