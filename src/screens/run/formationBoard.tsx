import type { Sq } from '../../engine/core/coords';
import { zoneOf } from '../../engine/run/acquire';
import type { RunState } from '../../engine/run/types';
import { SQUARE_INFO } from '../../data/squares';
import type { BoardPieceView, BoardSquareView } from '../../components/board/Board';
import { MarkIcon } from '../../components/encounter/SquareArt';

/** Formation + mutations as board view models (used by placement and the formation editor). */
export function formationBoard(run: RunState, highlight: Sq[] = [], selected: Sq[] = []) {
  const pieces: BoardPieceView[] = run.roster
    .filter((r) => r.sq !== null)
    .map((r) => ({
      id: r.id,
      type: r.type,
      side: 'player' as const,
      sq: r.sq as Sq,
      overlay: r.locked ? <span className="absolute right-[4%] top-[2%] text-[10px] text-gold-300">🔒</span> : null,
    }));
  const squares: Partial<Record<Sq, BoardSquareView>> = {};
  for (const sq of zoneOf(run)) squares[sq] = { tint: 'rgba(94, 200, 214, 0.12)' };
  for (const m of run.mutations) {
    const sqs = m.rail ? Array.from({ length: 8 }, (_, i) => (m.rail!.axis === 'rank' ? m.rail!.index * 8 + i : i * 8 + m.rail!.index)) : [m.sq];
    for (const sq of sqs) {
      const v = (squares[sq] ??= {});
      v.decor = (
        <>
          {v.decor}
          <MarkIcon key={`${m.id}${sq}`} type={m.type} />
        </>
      );
      v.title = SQUARE_INFO[m.type].name;
    }
  }
  for (const sq of highlight) (squares[sq] ??= {}).dot = 'place';
  for (const sq of selected) (squares[sq] ??= {}).tone = 'selected';
  return { pieces, squares };
}
