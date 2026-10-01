import { legalMoves, makeMove, pseudoLegalMoves, type ChessMode } from './movegen';
import type { Position } from './position';

/** Count leaf nodes of the move tree to `depth` plies (strict mode = standard perft). */
export function perft(pos: Position, depth: number, mode: ChessMode = 'strict'): number {
  if (depth === 0) return 1;
  const moves = mode === 'strict' ? legalMoves(pos) : pseudoLegalMoves(pos, 'kingCapture');
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) total += perft(makeMove(pos, m), depth - 1, mode);
  return total;
}
