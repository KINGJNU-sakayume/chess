import { fileOf, type Sq } from '../core/coords';
import type { EncounterState, Piece } from '../core/state';
import type { GenContext, Move } from './generate';

/**
 * Cheap make/unmake of moves on a private hypothetical state, for the planner
 * and bot policies. No triggers, no logging — just piece placement.
 */
export interface HypoUndo {
  pieceId: string;
  from: Sq;
  to: Sq;
  moverBefore: Piece;
  captured?: Piece;
  rook?: Piece;
  rookTo?: Sq;
}

/** A private copy whose board and piece map may be mutated in place. */
export function mutableCopy(state: EncounterState): EncounterState {
  return { ...state, board: state.board.slice(), pieces: { ...state.pieces } };
}

export function makeHypo(h: EncounterState, m: Move): HypoUndo {
  const mover = h.pieces[m.pieceId];
  const u: HypoUndo = { pieceId: m.pieceId, from: m.from, to: m.to, moverBefore: mover };
  if (m.captureId && h.pieces[m.captureId]) {
    const c = h.pieces[m.captureId];
    u.captured = c;
    if (h.board[c.sq] === c.id) h.board[c.sq] = null;
    delete h.pieces[c.id];
  }
  h.board[mover.sq] = null;
  h.board[m.to] = mover.id;
  h.pieces[mover.id] = { ...mover, sq: m.to, type: m.promotion ?? mover.type };
  if (m.castle && h.pieces[m.castle.rookId]) {
    const rook = h.pieces[m.castle.rookId];
    u.rook = rook;
    u.rookTo = m.castle.rookTo;
    h.board[rook.sq] = null;
    h.board[m.castle.rookTo] = rook.id;
    h.pieces[rook.id] = { ...rook, sq: m.castle.rookTo };
  }
  return u;
}

export function unmakeHypo(h: EncounterState, u: HypoUndo): void {
  if (u.rook && u.rookTo !== undefined) {
    h.board[u.rookTo] = null;
    h.board[u.rook.sq] = u.rook.id;
    h.pieces[u.rook.id] = u.rook;
  }
  h.board[u.to] = null;
  h.board[u.from] = u.pieceId;
  h.pieces[u.pieceId] = u.moverBefore;
  if (u.captured) {
    h.board[u.captured.sq] = u.captured.id;
    h.pieces[u.captured.id] = u.captured;
  }
}

/** Point a generation context at a (possibly mutated) hypothetical state. */
export function retarget(ctx: GenContext, h: EncounterState): GenContext {
  if (!ctx.needsPawnFiles) return ctx.state === h ? ctx : { ...ctx, state: h };
  const pawnFiles = new Array<boolean>(8).fill(false);
  for (const id in h.pieces) {
    const p = h.pieces[id];
    if (p.type === 'pawn') pawnFiles[fileOf(p.sq)] = true;
  }
  return { ...ctx, state: h, pawnFiles };
}
