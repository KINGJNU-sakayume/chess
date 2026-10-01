import type { Sq } from './coords';
import type { EncounterState, Expiry, LogKind, Piece } from './state';
import { hasExpired } from './time';

/**
 * Copy-on-write drafts. An engine operation copies every mutable container of
 * the input state once (`beginDraft`), mutates the copy freely, and returns
 * it. Pieces themselves are always *replaced*, never mutated, so a draft never
 * writes into objects shared with older states (undo snapshots stay valid).
 */
export type Draft = EncounterState;

export function beginDraft(s: EncounterState): Draft {
  return {
    ...s,
    board: s.board.slice(),
    pieces: { ...s.pieces },
    terrain: s.terrain.slice(),
    marks: s.marks.slice(),
    reserve: s.reserve.slice(),
    arrivals: s.arrivals.slice(),
    captured: s.captured.slice(),
    actions: s.actions.slice(),
    intents: s.intents.slice(),
    telegraphs: s.telegraphs.slice(),
    counters: { ...s.counters },
    turnFlags: { ...s.turnFlags },
    movedThisTurn: s.movedThisTurn.slice(),
    movedLastTurn: s.movedLastTurn.slice(),
    objective: { ...s.objective },
    log: s.log.slice(),
    stats: { ...s.stats, movesByType: { ...s.stats.movesByType }, capturesByType: { ...s.stats.capturesByType } },
  };
}

/** An independent copy of a draft at this instant (used for animation frames). */
export const snapshot = (d: Draft): EncounterState => beginDraft(d);

export function patchPiece(d: Draft, id: string, patch: Partial<Piece>): Piece {
  const next = { ...d.pieces[id], ...patch };
  d.pieces[id] = next;
  return next;
}

export function placePiece(d: Draft, p: Piece): void {
  d.pieces[p.id] = p;
  d.board[p.sq] = p.id;
}

/** Remove a piece from the board (it is not recorded as captured). */
export function removePiece(d: Draft, id: string): Piece | undefined {
  const p = d.pieces[id];
  if (!p) return undefined;
  if (d.board[p.sq] === id) d.board[p.sq] = null;
  delete d.pieces[id];
  return p;
}

export function relocatePiece(d: Draft, id: string, to: Sq): Piece {
  const p = d.pieces[id];
  if (d.board[p.sq] === id) d.board[p.sq] = null;
  d.board[to] = id;
  return patchPiece(d, id, { sq: to });
}

export const totalWards = (p: Piece): number => p.wards + p.tempWards.reduce((n, w) => n + w.count, 0);

export const isImmobilized = (p: Piece): boolean => p.statuses.some((s) => s.type === 'IMMOBILIZED');

/**
 * Consume one Ward, preferring temporary Wards (they would expire anyway).
 * Returns the consumed Ward's source ('permanent' for persistent Wards).
 */
export function consumeWard(d: Draft, id: string): string | null {
  const p = d.pieces[id];
  if (p.tempWards.length > 0) {
    const temp = p.tempWards.slice();
    const source = temp[0].source;
    const first = { ...temp[0], count: temp[0].count - 1 };
    if (first.count <= 0) temp.shift();
    else temp[0] = first;
    patchPiece(d, id, { tempWards: temp });
    return source;
  }
  if (p.wards > 0) {
    patchPiece(d, id, { wards: p.wards - 1 });
    return 'permanent';
  }
  return null;
}

export interface LogSink {
  silent: boolean;
}

export function pushLog(d: Draft, sink: LogSink, kind: LogKind, text: string, depth = 0, sqs?: Sq[]): void {
  if (sink.silent) return;
  d.log.push({ id: d.logSeq, turn: d.turn, depth, kind, text, sqs });
  d.logSeq += 1;
}

/** Remove statuses, temporary Wards and square marks whose expiry point has been reached. */
export function expireAt(d: Draft, now: Expiry): { statuses: string[]; marks: number } {
  const freed: string[] = [];
  for (const id of Object.keys(d.pieces)) {
    const p = d.pieces[id];
    const statuses = p.statuses.filter((s) => !hasExpired(s.expires, now));
    const tempWards = p.tempWards.filter((w) => !hasExpired(w.expires, now));
    if (statuses.length !== p.statuses.length || tempWards.length !== p.tempWards.length) {
      if (statuses.length !== p.statuses.length) freed.push(id);
      patchPiece(d, id, { statuses, tempWards });
    }
  }
  const before = d.marks.length;
  d.marks = d.marks.filter((m) => !m.expires || !hasExpired(m.expires, now));
  return { statuses: freed, marks: before - d.marks.length };
}

export function newId(d: Draft, prefix: string): string {
  const id = `${prefix}${d.nextId}`;
  d.nextId += 1;
  return id;
}
