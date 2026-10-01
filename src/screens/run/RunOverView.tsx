import { PIECE_NAME, type PieceType } from '../../engine/core/pieces';
import type { RunState } from '../../engine/run/types';
import { Board } from '../../components/board/Board';
import { formationBoard } from './formationBoard';
import { BuildSummary } from './BuildSummary';

export function RunOverView({ run, onExit }: { run: RunState; onExit: () => void }) {
  const victory = run.result?.outcome === 'victory';
  const board = formationBoard(run);
  const st = run.stats;
  const moves = Object.entries(st.movesByType).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6">
      <div className="text-center">
        <h2 className={`font-display text-5xl ${victory ? 'text-gold-300' : 'text-blood-400'}`}>{victory ? 'You broke chess.' : 'The crown falls.'}</h2>
        <p className="mt-2 text-ink-300">
          {victory ? 'The final boss is defeated.' : `Your run ended in Act ${run.result?.act}.`} Seed <span className="font-mono text-ink-100">{run.seed}</span>
        </p>
      </div>
      <div className="flex w-full flex-col gap-5 lg:flex-row">
        <div className="w-full max-w-[460px]">
          <div className="mb-2 text-center font-display text-sm uppercase tracking-[0.25em] text-ink-300">This is your chess</div>
          <Board pieces={board.pieces} squares={board.squares} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="panel grid grid-cols-2 gap-2 p-4 text-sm">
            <div>Encounters won: <span className="text-gold-300">{st.encountersWon}</span></div>
            <div>Encounters lost: <span className="text-blood-300">{st.encountersLost}</span></div>
            <div>Captures: {st.captures}</div>
            <div>Promotions: {st.promotions}</div>
            <div>Extra actions: {st.extraActions}</div>
            <div>Long Bishop moves: {st.bishopLongMoves}</div>
            <div className="col-span-2 text-ink-300">
              Most moved: {moves.slice(0, 3).map(([t, n]) => `${PIECE_NAME[t as PieceType]} ×${n}`).join(', ') || '—'}
            </div>
          </div>
          <BuildSummary run={run} />
          <button type="button" className="btn btn-gold" onClick={onExit}>
            Back to title
          </button>
        </div>
      </div>
    </div>
  );
}
