import { useEffect, useMemo, useState } from 'react';
import { Board } from '../components/board/Board';
import { CardArt } from '../components/cards/CardView';
import { buildBoard } from '../components/game/boardModel';
import { Fx } from '../components/game/Fx';
import { DraftModal, PromotionPicker, ResultModal, RevealModal } from '../components/game/Modals';
import { AugmentPanel, MoveList, PlayerBar, StatusCard } from '../components/game/Panels';
import { sideName } from '../components/game/labels';
import { cardById } from '../engine/augments/cards';
import { COLOR_NAME, sqName, type Color } from '../engine/game/types';
import { useAppStore } from '../state/appStore';
import { humanControls, useGame } from '../state/gameStore';
import { useRun } from '../state/runStore';
import { moveMs, useSettings, type AnimSpeed } from '../state/settingsStore';

function newSeed(): string {
  return `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Transient banner when the AI uses a card. */
function CardNotice() {
  const notice = useGame((s) => s.notice);
  const match = useGame((s) => s.match);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice.key);
    const t = setTimeout(() => setShown((k) => (k === notice.key ? null : k)), 3200);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice || shown !== notice.key || !match) return null;
  const def = cardById(notice.card);
  return (
    <div className="toast-enter pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
      <div className="panel flex items-center gap-3 px-4 py-2 shadow-xl ring-1 ring-violet-glow/50">
        <CardArt id={notice.card} size="h-9 w-9" />
        <div className="text-sm">
          <b className="text-violet-glow">{sideName(match, notice.color)}</b>
          <span className="text-ink-200">이(가) 「{def.name}」을(를) 사용했습니다 → </span>
          <b className="text-ink-100">{sqName(notice.sq)}</b>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const s = useSettings();
  const speeds: [AnimSpeed, string][] = [
    [1, '보통'],
    [2, '빠르게'],
    [0, '끄기'],
  ];
  return (
    <div className="flex flex-col gap-2 text-xs text-ink-200">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0">애니메이션</span>
        {speeds.map(([v, label]) => (
          <button key={v} type="button" className={`btn px-2 py-1 text-xs ${s.animSpeed === v ? 'btn-gold' : ''}`} onClick={() => s.set({ animSpeed: v })}>
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.dangerHints} onChange={(e) => s.set({ dangerHints: e.target.checked })} />
        킹을 내주는 수를 빨갛게 표시
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.showCoords} onChange={(e) => s.set({ showCoords: e.target.checked })} />
        좌표 표시
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.autoFlip} onChange={(e) => s.set({ autoFlip: e.target.checked })} />
        2인 대전에서 차례마다 보드 돌리기
      </label>
    </div>
  );
}

export function GameScreen() {
  const go = useAppStore((s) => s.go);
  const m = useGame((s) => s.match);
  const selected = useGame((s) => s.selected);
  const targeting = useGame((s) => s.targeting);
  const promotion = useGame((s) => s.promotion);
  const thinking = useGame((s) => s.thinking);
  const game = useGame();
  const settings = useSettings();
  const [flipOverride, setFlipOverride] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const run = useRun((s) => s.run);
  const finishBattle = useRun((s) => s.finishBattle);
  const spendUndo = useRun((s) => s.spendUndo);
  const inRun = m?.setup.context === 'run';

  useEffect(() => {
    if (!m) go(run ? 'run' : 'title');
  }, [m, go, run]);

  useEffect(() => {
    if (m?.phase === 'over') setShowResult(true);
  }, [m?.phase]);

  useEffect(() => {
    if (!confirmResign) return;
    const t = setTimeout(() => setConfirmResign(false), 3000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') game.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const interactive = !!m && m.phase === 'play' && humanControls(m, m.pos.side as Color) && !thinking;
  const board = useMemo(
    () => (m ? buildBoard(m, { selected, targeting, dangerHints: settings.dangerHints, interactive }) : null),
    [m, selected, targeting, settings.dangerHints, interactive],
  );

  if (!m || !board) return null;

  const baseBottom: Color = m.setup.mode === 'ai' ? m.setup.human : settings.autoFlip && m.phase === 'play' ? (m.pos.side as Color) : 0;
  const bottom: Color = flipOverride ? ((baseBottom ^ 1) as Color) : baseBottom;
  const top = (bottom ^ 1) as Color;
  const flipped = bottom === 1;
  const speed = settings.animSpeed;
  const hasUndoableMove = m.actions.some((a) => a.type === 'move' && (m.setup.mode === 'local' || a.color === m.setup.human)) && m.phase !== 'draft';
  const canUndo = hasUndoableMove && (!inRun || (m.phase !== 'over' && (run?.undos ?? 0) > 0));
  const undo = () => {
    if (inRun && !spendUndo()) return;
    game.undo();
  };
  const outcome = (): 'win' | 'loss' | 'draw' => (!m.result || m.result.winner === -1 ? 'draw' : m.result.winner === m.setup.human ? 'win' : 'loss');
  const panelOrder: Color[] = m.setup.mode === 'ai' ? [m.setup.human, (m.setup.human ^ 1) as Color] : [bottom, top];

  return (
    <div className="mx-auto flex min-h-full max-w-[1280px] flex-col gap-3 p-3 lg:flex-row lg:items-start lg:gap-5 lg:p-5">
      <div className="flex w-full flex-col gap-2 lg:max-w-[min(84vh,800px)] lg:flex-1">
        <PlayerBar m={m} color={top} />
        <div className="relative">
          <Board
            pieces={board.pieces}
            squares={board.squares}
            onSquareClick={game.clickSquare}
            flipped={flipped}
            showCoords={settings.showCoords}
            moveMs={moveMs(speed)}
            fx={<Fx events={m.events} stamp={m.actions.length} flipped={flipped} durationMs={moveMs(speed)} />}
          />
          {promotion ? (
            <PromotionPicker moves={promotion} color={m.pos.side as Color} onPick={game.choosePromotion} onCancel={game.cancel} />
          ) : null}
          {showResult ? (
            <ResultModal
              m={m}
              run={inRun}
              onContinue={() => {
                finishBattle(outcome());
                go('run');
              }}
              onRematch={() => game.start({ ...m.setup, seed: newSeed(), human: m.setup.mode === 'ai' ? m.setup.human : 0 })}
              onNew={() => go('setup')}
              onClose={() => setShowResult(false)}
            />
          ) : null}
        </div>
        <PlayerBar m={m} color={bottom} />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-[380px] lg:shrink-0">
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => go(inRun ? 'run' : 'title')}>
            {inRun ? '← 지도' : '← 메뉴'}
          </button>
          <div className="min-w-0 truncate text-sm text-ink-300">
            {inRun && run
              ? `도전 ${run.act}막 · ${run.enemy?.kind === 'boss' ? '보스' : run.enemy?.kind === 'elite' ? '정예' : '대국'} · 목숨 ${run.lives}`
              : m.setup.mode === 'ai'
                ? `AI 대전 · 나는 ${COLOR_NAME[m.setup.human]}`
                : '2인 대전 (한 화면)'}
          </div>
          <button type="button" className="btn btn-ghost ml-auto px-2 text-xs" onClick={() => setShowSettings((v) => !v)}>
            설정
          </button>
        </div>
        {showSettings ? (
          <section className="panel p-3">
            <Settings />
          </section>
        ) : null}
        <StatusCard m={m} />
        {panelOrder.map((c) => (
          <AugmentPanel key={c} m={m} color={c} />
        ))}
        <MoveList m={m} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          <button type="button" className="btn text-xs" disabled={!canUndo} onClick={undo}>
            {inRun ? `무르기 (${run?.undos ?? 0})` : '무르기'}
          </button>
          <button type="button" className="btn text-xs" onClick={() => setFlipOverride((v) => !v)}>
            보드 뒤집기
          </button>
          {m.phase === 'over' ? (
            <button type="button" className="btn btn-gold text-xs" onClick={() => setShowResult(true)}>
              결과 보기
            </button>
          ) : (
            <button
              type="button"
              className={`btn text-xs ${confirmResign ? 'btn-danger' : ''}`}
              onClick={() => {
                if (confirmResign) {
                  setConfirmResign(false);
                  game.resign();
                } else setConfirmResign(true);
              }}
            >
              {confirmResign ? (inRun ? '기권하면 패배합니다. 정말?' : '정말 기권할까요?') : '기권'}
            </button>
          )}
          {inRun ? (
            <button type="button" className="btn text-xs" onClick={() => go('run')}>
              지도 보기
            </button>
          ) : (
            <button type="button" className="btn text-xs" onClick={() => go('setup')}>
              새 대국
            </button>
          )}
        </div>
      </aside>

      <DraftModal key={`${m.round}-${m.sides[0].offer ? 'w' : ''}${m.sides[1].offer ? 'b' : ''}`} m={m} />
      <RevealModal m={m} />
      <CardNotice />
    </div>
  );
}
