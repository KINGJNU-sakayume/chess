import type { Position } from './position';
import { KIND_LETTER, KING, M_CASTLE, M_EP, M_WALL, PAWN, movePromo, sqName, type Color } from './types';

/**
 * Standard algebraic notation for a move about to be played in `pos`.
 * `+` marks a move after which the enemy King is attacked, `#` a move that
 * wins the game outright. A, C are the Archbishop and Chancellor.
 */
export function toSan(pos: Position, m: number): string {
  const from = m & 63;
  const to = (m >> 6) & 63;
  const code = pos.board[from];
  const kind = code & 15;
  let san: string;
  if (m & M_CASTLE) {
    san = to > from ? 'O-O' : 'O-O-O';
  } else {
    const capture = pos.board[to] !== 0 || (m & M_EP) !== 0 || (m & M_WALL) !== 0;
    if (kind === PAWN) {
      san = capture ? `${'abcdefgh'[from & 7]}x${sqName(to)}` : sqName(to);
    } else {
      let disambig = '';
      const others = pos.moves().filter((o) => o !== m && ((o >> 6) & 63) === to && pos.board[o & 63] === code && (o & 63) !== from);
      if (others.length) {
        const sameFile = others.some((o) => ((o & 63) & 7) === (from & 7));
        const sameRank = others.some((o) => (o & 63) >> 3 === from >> 3);
        if (!sameFile) disambig = 'abcdefgh'[from & 7];
        else if (!sameRank) disambig = String((from >> 3) + 1);
        else disambig = sqName(from);
      }
      san = `${KIND_LETTER[kind]}${disambig}${capture ? 'x' : ''}${sqName(to)}`;
    }
    const promo = movePromo(m);
    if (promo) san += `=${KIND_LETTER[promo]}`;
  }
  const us = pos.side;
  pos.makeMove(m);
  if (pos.winner === us) san += '#';
  else if (pos.kingSq[us ^ 1] >= 0 && pos.inCheck((us ^ 1) as Color)) san += '+';
  pos.unmakeMove();
  return san;
}

/** Find the move matching from/to/promotion among the legal moves. */
export function findMove(pos: Position, from: number, to: number, promo = 0): number | null {
  for (const m of pos.moves()) {
    if ((m & 63) === from && ((m >> 6) & 63) === to && movePromo(m) === promo) return m;
  }
  return null;
}

export const isKingMove = (pos: Position, m: number): boolean => (pos.board[m & 63] & 15) === KING;
