import { useState } from 'react';
import { sqName, type Sq } from '../../engine/core/coords';
import { PIECE_NAME } from '../../engine/core/pieces';
import { validateFormation, zoneOf } from '../../engine/run/acquire';
import type { RosterPiece } from '../../engine/run/roster';
import type { RunState } from '../../engine/run/types';
import { Board } from '../../components/board/Board';
import { PieceSvg } from '../../components/board/PieceSvg';
import { formationBoard } from './formationBoard';

/**
 * Formation editor (B6): rearrange pieces inside the deployment zone or move
 * them to Reserve. Pieces locked by starting-position upgrades stay put.
 */
export function FormationEditor({ run, onSave, onClose }: { run: RunState; onSave: (roster: RosterPiece[]) => void; onClose: () => void }) {
  const [roster, setRoster] = useState<RosterPiece[]>(run.roster);
  const [selected, setSelected] = useState<string | null>(null);
  const zone = zoneOf(run);
  const draft: RunState = { ...run, roster };
  const error = validateFormation(run, roster);
  const sel = roster.find((r) => r.id === selected) ?? null;
  const board = formationBoard(draft, sel ? zone.filter((sq) => sq !== sel.sq) : [], sel?.sq !== null && sel ? [sel.sq] : []);

  const place = (target: Sq | null) => {
    if (!sel || sel.locked) return;
    const occupant = target === null ? null : roster.find((r) => r.sq === target);
    if (occupant?.locked) return;
    setRoster(roster.map((r) => (r.id === sel.id ? { ...r, sq: target } : occupant && r.id === occupant.id ? { ...r, sq: sel.sq } : r)));
    setSelected(null);
  };

  const onSquare = (sq: Sq) => {
    const occupant = roster.find((r) => r.sq === sq);
    if (sel && zone.includes(sq) && sel.id !== occupant?.id) return place(sq);
    if (occupant) setSelected(occupant.locked ? null : occupant.id === selected ? null : occupant.id);
  };

  const reserve = roster.filter((r) => r.sq === null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="panel flex w-full max-w-5xl flex-col gap-4 p-5 lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-[520px]">
          <Board pieces={board.pieces} squares={board.squares} onSquareClick={onSquare} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <h2 className="font-display text-2xl text-gold-300">Formation</h2>
          <p className="text-sm text-ink-200">
            Click a piece, then a square in your deployment zone to move or swap it. Pieces that don't fit wait in Reserve and can be deployed
            for free on rank 1 during encounters. 🔒 pieces are fixed by starting-position upgrades.
          </p>
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-ink-300">Reserve ({reserve.length})</div>
            <div className="flex min-h-12 flex-wrap gap-1 rounded-lg border border-dashed border-ink-600 p-1">
              {reserve.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  title={PIECE_NAME[r.type]}
                  className={`relative h-11 w-11 rounded-md border ${selected === r.id ? 'border-arcane-300 bg-arcane-500/30' : 'border-ink-600 bg-ink-800'}`}
                  onClick={() => setSelected(selected === r.id ? null : r.id)}
                >
                  <PieceSvg type={r.type} side="player" className="absolute inset-1" />
                </button>
              ))}
              {sel && sel.sq !== null && !sel.locked && sel.type !== 'king' ? (
                <button type="button" className="btn h-11 text-xs" onClick={() => place(null)}>
                  Send {PIECE_NAME[sel.type]} {sqName(sel.sq)} to Reserve
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p className="text-sm text-blood-300">{error}</p> : null}
          <div className="mt-auto flex gap-2">
            <button type="button" className="btn btn-gold flex-1" disabled={!!error} onClick={() => onSave(roster)}>
              Save formation
            </button>
            <button type="button" className="btn" onClick={() => setRoster(run.roster)}>
              Reset
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
