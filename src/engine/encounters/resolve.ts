import { fileOf, rankOf, sqName, sqOf } from '../core/coords';
import { patchPiece, relocatePiece, totalWards } from '../core/draft';
import { PIECE_NAME } from '../core/pieces';
import { attemptCapture, pieceLabel, promotePiece, reposition } from '../effects/primitives';
import { attackedOpponents, createGenContext, isAttackedBy, type Move } from '../moves/generate';
import type { Resolver } from '../rules/resolver';
import { evaluateObjective } from './objectives';

/**
 * Layer C — action resolution for one move (player action or enemy intent):
 *
 *   1. onBeforeMove
 *   2. movement: onSquareCrossed (path order) → onSquareEntered → onPieceMove
 *   3. capture attempt: Ward check → onCaptureBlocked | onCapture + onPieceDestroyed
 *   4. onPromotion
 *   5. landing-square effects (onPieceLanded, Knight Gate, Bishop Recall)
 *   6. derived detections: onFork, onCheck (onCastle / onEnPassant on the move)
 *   7. objective and loss evaluation
 *   8. onAfterAction
 *
 * Each step drains the trigger queue before the next one starts.
 */

export function moveHeadline(r: Resolver, m: Move): string {
  const d = r.d;
  const mover = d.pieces[m.pieceId];
  const name = `${PIECE_NAME[mover.type]} ${sqName(m.from)}`;
  if (m.castle) return `${PIECE_NAME[mover.type]} castles ${sqName(m.from)} → ${sqName(m.to)} (Rook ${sqName(m.castle.rookFrom)} → ${sqName(m.castle.rookTo)})`;
  const dist = m.distance >= 2 && m.kind !== 'leap' ? ` (${m.distance} squares)` : '';
  const ep = m.kind === 'enPassant' ? ' en passant' : '';
  const pierce = m.pierced.length
    ? ` piercing ${m.pierced.map((id) => (d.pieces[id] ? pieceLabel(d.pieces[id]) : id)).join(', ')}`
    : '';
  return `${name} → ${sqName(m.to)}${dist}${ep}${pierce}`;
}

export interface MoveResult {
  captured: boolean;
  blocked: boolean;
}

export function resolveMove(r: Resolver, m: Move): MoveResult {
  const d = r.d;
  const mover = d.pieces[m.pieceId];
  const side = mover.side;
  const ev = { actorId: mover.id, actorType: mover.type, side, from: m.from, to: m.to };

  r.log(side === 'player' ? 'move' : 'enemy', moveHeadline(r, m), 0, [m.from, m.to]);
  if (side === 'player' && !m.free) {
    d.stats.playerMoves += 1;
    d.stats.movesByType[mover.type] = (d.stats.movesByType[mover.type] ?? 0) + 1;
  }
  if (side === 'player' && mover.type === 'bishop') {
    d.stats.longestBishopMove = Math.max(d.stats.longestBishopMove, m.distance);
    if (m.distance >= 4) d.stats.bishopLongMoves += 1;
  }

  // 1. onBeforeMove
  r.emit({ ...ev, type: 'onBeforeMove' });
  r.drain();

  // 2. Movement events.
  for (const sq of m.path) r.emit({ ...ev, type: 'onSquareCrossed', sq });
  const target = m.captureId ? d.pieces[m.captureId] : undefined;
  const willBlock = !!target && totalWards(target) > 0;
  if (!willBlock) r.emit({ ...ev, type: 'onSquareEntered', sq: m.to });
  r.emit({
    ...ev,
    type: 'onPieceMove',
    distance: m.distance,
    path: m.path,
    free: m.free,
    capture: !!target && !willBlock,
    meta: { pierced: m.pierced, kind: m.kind },
  });
  r.drain();

  // 3. Capture attempt.
  let captured = false;
  let blocked = false;
  if (target && d.pieces[target.id]) {
    captured = attemptCapture(r, target.id, mover.id, 'move');
    blocked = !captured;
  }
  if (m.rubble) {
    d.terrain[m.to] = null;
    r.log('trigger', `cleared rubble on ${sqName(m.to)}`, 1, [m.to]);
  }
  if (blocked) {
    r.log('blocked', `${PIECE_NAME[mover.type]} is repelled and stays on ${sqName(m.from)} (action spent)`, 1, [m.from]);
  } else if (d.pieces[mover.id]) {
    relocatePiece(d, mover.id, m.to);
    patchPiece(d, mover.id, { moved: true });
    if (m.castle && d.pieces[m.castle.rookId]) {
      relocatePiece(d, m.castle.rookId, m.castle.rookTo);
      patchPiece(d, m.castle.rookId, { moved: true });
      r.emit({ ...ev, type: 'onCastle', targetId: m.castle.rookId, meta: { rookFrom: m.castle.rookFrom, rookTo: m.castle.rookTo } });
    }
    if (m.kind === 'enPassant') r.emit({ ...ev, type: 'onEnPassant', targetId: m.captureId ?? undefined });
    // Enemy two-square advances can be taken en passant during the following Player Turn.
    if (m.doubleStep && side === 'enemy') {
      d.enPassant = { sq: sqOf(fileOf(m.from), (rankOf(m.from) + rankOf(m.to)) / 2), pawnId: mover.id };
    }
  }
  if (side === 'player' && !d.movedThisTurn.includes(mover.id)) d.movedThisTurn.push(mover.id);
  r.drain();
  r.frame();

  // 4. Promotion.
  if (!blocked && m.promotion && d.pieces[mover.id]) {
    promotePiece(r, mover.id, m.promotion, 'move');
    r.drain();
  }

  // 5. Landing-square effects.
  if (!blocked && d.pieces[mover.id]) {
    r.emit({ ...ev, type: 'onPieceLanded', sq: m.to, capture: captured });
    r.drain();
    const now = d.pieces[mover.id];
    if (m.gate && now) {
      const gate = d.marks.find((mk) => mk.sq === now.sq && mk.type === 'KNIGHT_GATE' && !mk.suppressed);
      if (gate?.linkSq !== undefined && !d.board[gate.linkSq]) {
        reposition(r, now.id, gate.linkSq, 'square:KNIGHT_GATE', `Knight Gate: ${PIECE_NAME[now.type]} steps through to ${sqName(gate.linkSq)}`);
        r.drain();
        r.frame();
      }
    }
    if (m.recall && captured && d.pieces[mover.id] && !d.turnFlags[`recall:${mover.id}`]) {
      d.turnFlags[`recall:${mover.id}`] = 1;
      if (reposition(r, mover.id, m.from, 'bishop_recall', `Bishop Recall: returns to ${sqName(m.from)}`)) {
        r.drain();
        r.frame();
      }
    }
  }

  // 6. Derived detections.
  detect(r, mover.id);

  // 7. Objectives.
  evaluateObjective(r, 'action');

  // 8. onAfterAction.
  r.emit({ ...ev, type: 'onAfterAction', capture: captured });
  r.drain();
  if (!d.outcome) evaluateObjective(r, 'action');
  return { captured, blocked };
}

function detect(r: Resolver, moverId: string) {
  const d = r.d;
  const mover = d.pieces[moverId];
  if (!mover || d.outcome) return;
  const wantFork = !!r.rules.hooks.onFork?.length;
  const wantCheck = !r.silent || !!r.rules.hooks.onCheck?.length;
  if (!wantFork && !wantCheck) return;
  const ctx = createGenContext(d);
  if (wantFork) {
    const attacked = attackedOpponents(ctx, moverId);
    if (attacked.length >= 2) {
      r.emit({ type: 'onFork', actorId: moverId, actorType: mover.type, side: mover.side, sq: mover.sq, attackedIds: attacked });
    }
  }
  if (wantCheck) {
    const king = Object.values(d.pieces).find((p) => p.side !== mover.side && p.type === 'king');
    if (king && isAttackedBy(ctx, king.sq, mover.side)) {
      if (mover.side === 'player') r.log('trigger', `Check: the enemy King on ${sqName(king.sq)} is attacked`, 1, [king.sq]);
      else r.log('trigger', `Check: your King on ${sqName(king.sq)} is attacked`, 1, [king.sq]);
      r.emit({ type: 'onCheck', actorId: moverId, actorType: mover.type, side: mover.side, targetId: king.id, targetType: 'king', targetSide: king.side });
    }
  }
  r.drain();
}
