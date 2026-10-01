import { sqName, type Sq } from '../core/coords';
import { consumeWard, newId, patchPiece, placePiece, relocatePiece, removePiece, totalWards } from '../core/draft';
import { PIECE_NAME, type PieceType, type Side } from '../core/pieces';
import type { ActionToken, Expiry, Piece, SquareMark, SquareType } from '../core/state';
import type { Resolver } from '../rules/resolver';

/**
 * Effect primitive implementations (Part B1). Every upgrade, square, boss and
 * affix effect bottoms out in one of these functions; none of them introduce
 * hidden stats. Functions that move or remove pieces enqueue the resulting
 * events (breadth-first, D4) instead of resolving them recursively.
 */

export const pieceLabel = (p: Pick<Piece, 'type' | 'sq'>): string => `${PIECE_NAME[p.type]} ${sqName(p.sq)}`;

// --- EXTRA_ACTION ---------------------------------------------------------

export function grantAction(r: Resolver, token: Omit<ActionToken, 'id'>, logText?: string): ActionToken {
  const d = r.d;
  const full: ActionToken = { ...token, id: newId(d, 'act') };
  d.actions.push(full);
  d.stats.extraActionsGranted += 1;
  if (logText) r.log('trigger', logText);
  return full;
}

// --- WARD -----------------------------------------------------------------

export function addWard(r: Resolver, pieceId: string, count: number, source: string, until?: Expiry): void {
  const p = r.d.pieces[pieceId];
  if (!p || count <= 0) return;
  if (until) {
    patchPiece(r.d, pieceId, { tempWards: [...p.tempWards, { count, expires: until, source }] });
  } else {
    patchPiece(r.d, pieceId, { wards: p.wards + count });
  }
}

// --- STATUS ---------------------------------------------------------------

/** Expiry for "its next N enemy phases", relative to the current moment. */
export function nextEnemyPhasesExpiry(r: Resolver, phases: number): Expiry {
  const base = r.d.phase === 'enemy' ? r.d.turn + 1 : r.d.turn;
  return { at: 'phaseEnd', turn: base + Math.max(1, phases) - 1 };
}

export function immobilize(r: Resolver, pieceId: string, phases: number, source: string): void {
  const p = r.d.pieces[pieceId];
  if (!p) return;
  const expires = nextEnemyPhasesExpiry(r, phases);
  const others = p.statuses.filter((s) => s.type !== 'IMMOBILIZED');
  const existing = p.statuses.find((s) => s.type === 'IMMOBILIZED');
  // Never shorten an existing immobilization.
  const keep = existing && existing.expires.turn >= expires.turn ? existing : { type: 'IMMOBILIZED' as const, expires, source };
  patchPiece(r.d, pieceId, { statuses: [...others, keep] });
}

// --- MARK_SQUARE ----------------------------------------------------------

export function markSquare(
  r: Resolver,
  sq: Sq,
  type: SquareType,
  side: Side,
  source: string,
  expires?: Expiry,
  extra?: Partial<SquareMark>,
): SquareMark {
  const d = r.d;
  // Refresh an identical temporary mark instead of stacking duplicates.
  const existing = d.marks.findIndex((m) => m.sq === sq && m.type === type && m.side === side && m.source === source);
  const mark: SquareMark = { id: newId(d, 'mk'), sq, type, side, source, expires, suppressed: !!d.terrain[sq], ...extra };
  if (existing >= 0) d.marks[existing] = { ...d.marks[existing], expires };
  else d.marks.push(mark);
  return mark;
}

// --- SPAWN ----------------------------------------------------------------

export function spawnPiece(
  r: Resolver,
  spec: { type: PieceType; side: Side; sq: Sq; tags?: Piece['tags']; wards?: number; rosterId?: string },
  source: string,
): Piece | null {
  const d = r.d;
  if (d.board[spec.sq] || d.terrain[spec.sq]) return null;
  const piece: Piece = {
    id: newId(d, spec.side === 'player' ? 'P' : 'E'),
    type: spec.type,
    side: spec.side,
    sq: spec.sq,
    rosterId: spec.rosterId,
    moved: false,
    wards: spec.wards ?? 0,
    tempWards: [],
    statuses: [],
    captures: 0,
    tags: spec.tags ?? [],
    counters: {},
    spawned: true,
  };
  placePiece(d, piece);
  r.emit({ type: 'onPieceAdded', actorId: piece.id, actorType: piece.type, side: piece.side, sq: piece.sq, meta: { source } });
  return piece;
}

// --- REPOSITION -----------------------------------------------------------

/**
 * Move a piece without spending an action. Emits movement events flagged
 * `free`. Never captures: the destination must be empty.
 */
export function reposition(r: Resolver, pieceId: string, to: Sq, source: string, logText?: string): boolean {
  const d = r.d;
  const p = d.pieces[pieceId];
  if (!p || d.board[to] || d.terrain[to]) return false;
  const from = p.sq;
  relocatePiece(d, pieceId, to);
  patchPiece(d, pieceId, { moved: true });
  if (logText) r.log('trigger', logText, 1, [from, to]);
  const base = { actorId: p.id, actorType: p.type, side: p.side, from, to, free: true, meta: { source } };
  r.emit({ ...base, type: 'onSquareEntered', sq: to });
  r.emit({ ...base, type: 'onPieceMove', distance: Math.max(Math.abs((to & 7) - (from & 7)), Math.abs((to >> 3) - (from >> 3))), path: [] });
  r.emit({ ...base, type: 'onPieceLanded', sq: to });
  return true;
}

// --- Capture (shared by moves and capture effects) ------------------------

/**
 * Attempt to capture `targetId`. Ward check first (B1): a Ward makes the
 * capture fail and is consumed. Returns true if the piece was captured.
 */
export function attemptCapture(r: Resolver, targetId: string, byId: string | null, source: string): boolean {
  const d = r.d;
  const target = d.pieces[targetId];
  if (!target) return false;
  const attacker = byId ? d.pieces[byId] : undefined;
  if (totalWards(target) > 0) {
    const wardSource = consumeWard(d, targetId);
    d.stats.wardsBlocked += 1;
    r.log('blocked', `Ward blocks the capture of ${pieceLabel(target)} (${totalWards(d.pieces[targetId])} left)`, 1, [target.sq]);
    r.emit({
      type: 'onCaptureBlocked',
      actorId: byId ?? undefined,
      actorType: attacker?.type,
      side: attacker?.side,
      targetId,
      targetType: target.type,
      targetSide: target.side,
      sq: target.sq,
      meta: { source, wardSource },
    });
    return false;
  }
  removePiece(d, targetId);
  d.captured.push({ piece: target, byId, turn: d.turn });
  if (target.side === 'player') d.stats.piecesLost += 1;
  if (attacker) {
    patchPiece(d, attacker.id, { captures: attacker.captures + 1 });
    if (attacker.side === 'player') {
      d.stats.captures += 1;
      d.stats.capturesByType[attacker.type] = (d.stats.capturesByType[attacker.type] ?? 0) + 1;
    }
  }
  if (d.enPassant?.pawnId === targetId) d.enPassant = null;
  r.log('capture', `captured ${pieceLabel(target)}`, 1, [target.sq]);
  const ev = {
    actorId: byId ?? undefined,
    actorType: attacker?.type,
    side: attacker?.side,
    targetId,
    targetType: target.type,
    targetSide: target.side,
    sq: target.sq,
    meta: { source },
  };
  r.emit({ ...ev, type: 'onCapture' });
  r.emit({ ...ev, type: 'onPieceDestroyed' });
  return true;
}

// --- PROMOTION_RULE -------------------------------------------------------

export function promotePiece(r: Resolver, pieceId: string, to: PieceType, source: string): void {
  const d = r.d;
  const p = d.pieces[pieceId];
  if (!p || p.type !== 'pawn') return;
  patchPiece(d, pieceId, { type: to, promotedFrom: 'pawn' });
  if (p.side === 'player') {
    d.stats.promotions += 1;
    d.objective.promotions += 1;
  } else {
    d.objective.enemyPromoted = true;
  }
  r.log('trigger', `${PIECE_NAME.pawn} ${sqName(p.sq)} promotes to ${PIECE_NAME[to]}`, 1, [p.sq]);
  r.emit({ type: 'onPromotion', actorId: pieceId, actorType: to, side: p.side, sq: p.sq, promotedTo: to, meta: { source } });
}
