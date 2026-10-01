import { fileOf, onBoard, rankOf, sqOf, sqName, step, type Sq } from '../core/coords';
import { PROMOTION_TYPES, type PieceType } from '../core/pieces';
import { BASE_PATTERNS } from './patterns';
import { opposite, type ChessPiece, type Color, type Position } from './position';

/**
 * Strict standard-chess move generation (reference mode) plus a king-capture
 * mode that mirrors the gameplay royalty rule (Part B3): moves that leave the
 * own King attacked are legal, castling only requires an unmoved King/Rook and
 * empty squares between them, and the game ends when a King is captured.
 */
export interface ChessMove {
  from: Sq;
  to: Sq;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  ep?: boolean;
  castle?: 'K' | 'Q';
  double?: boolean;
}

export type ChessMode = 'strict' | 'kingCapture';

const forward = (c: Color) => (c === 'w' ? 1 : -1);
const homeRank = (c: Color) => (c === 'w' ? 1 : 6);
const lastRank = (c: Color) => (c === 'w' ? 7 : 0);

export function findKing(pos: Position, color: Color): Sq {
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (p && p.color === color && p.type === 'king') return sq;
  }
  return -1;
}

/** True if any piece of `by` attacks `sq` (orthodox attack patterns). */
export function isSquareAttacked(pos: Position, sq: Sq, by: Color): boolean {
  const board = pos.board;
  const f = fileOf(sq);
  const r = rankOf(sq);
  // Pawns attack diagonally forward, so look one rank "behind" from their side.
  const pr = r - forward(by);
  for (const df of [-1, 1]) {
    if (onBoard(f + df, pr)) {
      const p = board[sqOf(f + df, pr)];
      if (p && p.color === by && p.type === 'pawn') return true;
    }
  }
  for (const [df, dr] of BASE_PATTERNS.knight.leaps) {
    if (!onBoard(f + df, r + dr)) continue;
    const p = board[sqOf(f + df, r + dr)];
    if (p && p.color === by && p.type === 'knight') return true;
  }
  for (const { dir } of BASE_PATTERNS.queen.rays) {
    const diagonal = dir[0] !== 0 && dir[1] !== 0;
    let cur = step(sq, dir);
    let dist = 1;
    while (cur !== -1) {
      const p = board[cur];
      if (p) {
        if (p.color === by) {
          if (p.type === 'queen') return true;
          if (p.type === (diagonal ? 'bishop' : 'rook')) return true;
          if (p.type === 'king' && dist === 1) return true;
        }
        break;
      }
      cur = step(cur, dir);
      dist++;
    }
  }
  return false;
}

export function inCheck(pos: Position, color: Color): boolean {
  const k = findKing(pos, color);
  return k !== -1 && isSquareAttacked(pos, k, opposite(color));
}

function pushPawnMove(out: ChessMove[], from: Sq, to: Sq, color: Color, captured?: PieceType) {
  if (rankOf(to) === lastRank(color)) {
    for (const promotion of PROMOTION_TYPES) out.push({ from, to, piece: 'pawn', captured, promotion });
  } else {
    out.push({ from, to, piece: 'pawn', captured });
  }
}

export function pseudoLegalMoves(pos: Position, mode: ChessMode = 'strict'): ChessMove[] {
  const out: ChessMove[] = [];
  const us = pos.turn;
  const them = opposite(us);
  const board = pos.board;
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== us) continue;
    if (piece.type === 'pawn') {
      genPawn(pos, from, us, out);
      continue;
    }
    const pattern = BASE_PATTERNS[piece.type];
    for (const [df, dr] of pattern.leaps) {
      const f = fileOf(from) + df;
      const r = rankOf(from) + dr;
      if (!onBoard(f, r)) continue;
      const to = sqOf(f, r);
      const target = board[to];
      if (!target) out.push({ from, to, piece: piece.type });
      else if (target.color === them) out.push({ from, to, piece: piece.type, captured: target.type });
    }
    for (const { dir, range } of pattern.rays) {
      let to = step(from, dir);
      let dist = 1;
      while (to !== -1 && dist <= range) {
        const target = board[to];
        if (!target) {
          out.push({ from, to, piece: piece.type });
        } else {
          if (target.color === them) out.push({ from, to, piece: piece.type, captured: target.type });
          break;
        }
        to = step(to, dir);
        dist++;
      }
    }
    if (piece.type === 'king') genCastles(pos, from, us, mode, out);
  }
  return out;
}

function genPawn(pos: Position, from: Sq, us: Color, out: ChessMove[]) {
  const board = pos.board;
  const fw = forward(us);
  const f = fileOf(from);
  const r = rankOf(from);
  if (onBoard(f, r + fw)) {
    const one = sqOf(f, r + fw);
    if (!board[one]) {
      pushPawnMove(out, from, one, us);
      if (r === homeRank(us)) {
        const two = sqOf(f, r + 2 * fw);
        if (!board[two]) out.push({ from, to: two, piece: 'pawn', double: true });
      }
    }
  }
  for (const df of [-1, 1]) {
    if (!onBoard(f + df, r + fw)) continue;
    const to = sqOf(f + df, r + fw);
    const target = board[to];
    if (target && target.color !== us) pushPawnMove(out, from, to, us, target.type);
    else if (!target && pos.ep === to) out.push({ from, to, piece: 'pawn', captured: 'pawn', ep: true });
  }
}

function genCastles(pos: Position, from: Sq, us: Color, mode: ChessMode, out: ChessMove[]) {
  const rank = us === 'w' ? 0 : 7;
  if (from !== sqOf(4, rank)) return;
  const rights = pos.castling;
  const them = opposite(us);
  const sides: { flag: 'K' | 'Q'; allowed: boolean; rookFile: number; empty: number[]; transit: number[] }[] = [
    { flag: 'K', allowed: us === 'w' ? rights.wK : rights.bK, rookFile: 7, empty: [5, 6], transit: [4, 5, 6] },
    { flag: 'Q', allowed: us === 'w' ? rights.wQ : rights.bQ, rookFile: 0, empty: [1, 2, 3], transit: [4, 3, 2] },
  ];
  for (const s of sides) {
    if (!s.allowed) continue;
    const rook = pos.board[sqOf(s.rookFile, rank)];
    if (!rook || rook.type !== 'rook' || rook.color !== us) continue;
    if (s.empty.some((file) => pos.board[sqOf(file, rank)])) continue;
    if (mode === 'strict' && s.transit.some((file) => isSquareAttacked(pos, sqOf(file, rank), them))) continue;
    out.push({ from, to: sqOf(s.flag === 'K' ? 6 : 2, rank), piece: 'king', castle: s.flag });
  }
}

export function makeMove(pos: Position, m: ChessMove): Position {
  const board = pos.board.slice();
  const us = pos.turn;
  const moving = board[m.from] as ChessPiece;
  board[m.from] = null;
  if (m.ep) {
    board[sqOf(fileOf(m.to), rankOf(m.from))] = null;
  }
  board[m.to] = m.promotion ? { color: us, type: m.promotion } : moving;
  if (m.castle) {
    const rank = rankOf(m.from);
    const [rf, rt] = m.castle === 'K' ? [7, 5] : [0, 3];
    board[sqOf(rt, rank)] = board[sqOf(rf, rank)];
    board[sqOf(rf, rank)] = null;
  }
  const castling = { ...pos.castling };
  const touch = (sq: Sq) => {
    if (sq === 0) castling.wQ = false;
    if (sq === 7) castling.wK = false;
    if (sq === 56) castling.bQ = false;
    if (sq === 63) castling.bK = false;
    if (sq === 4) castling.wK = castling.wQ = false;
    if (sq === 60) castling.bK = castling.bQ = false;
  };
  touch(m.from);
  touch(m.to);
  return {
    board,
    turn: opposite(us),
    castling,
    ep: m.double ? sqOf(fileOf(m.from), (rankOf(m.from) + rankOf(m.to)) / 2) : null,
    halfmove: m.piece === 'pawn' || m.captured ? 0 : pos.halfmove + 1,
    fullmove: us === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

/** Strict legal moves: pseudo-legal moves that do not leave the own King in check. */
export function legalMoves(pos: Position): ChessMove[] {
  const us = pos.turn;
  return pseudoLegalMoves(pos, 'strict').filter((m) => !inCheck(makeMove(pos, m), us));
}

/** Moves available in the given mode. King-capture mode never filters for check. */
export function movesFor(pos: Position, mode: ChessMode): ChessMove[] {
  return mode === 'strict' ? legalMoves(pos) : pseudoLegalMoves(pos, 'kingCapture');
}

export type ChessStatus =
  | { kind: 'ongoing'; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'kingCaptured'; winner: Color };

export function chessStatus(pos: Position, mode: ChessMode): ChessStatus {
  const us = pos.turn;
  if (findKing(pos, us) === -1) return { kind: 'kingCaptured', winner: opposite(us) };
  const check = inCheck(pos, us);
  if (mode === 'strict' && legalMoves(pos).length === 0) {
    return check ? { kind: 'checkmate', winner: opposite(us) } : { kind: 'stalemate' };
  }
  if (mode === 'kingCapture' && pseudoLegalMoves(pos, 'kingCapture').length === 0) return { kind: 'stalemate' };
  return { kind: 'ongoing', check };
}

export function moveToUci(m: ChessMove): string {
  const promo = m.promotion ? { queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: '', king: '' }[m.promotion] : '';
  return sqName(m.from) + sqName(m.to) + promo;
}
