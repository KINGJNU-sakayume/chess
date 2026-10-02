import type { Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import { BASE_PATTERNS } from '../chess/patterns';

/** Minimum number of moves for a piece type to reach `to` from `from` on an open board (walls ignored). */
export function openBoardDistance(type: PieceType, from: Sq, to: Sq): number {
  if (from === to) return 0;
  const df = Math.abs((from & 7) - (to & 7));
  const dr = Math.abs((from >> 3) - (to >> 3));
  switch (type) {
    case 'king':
      return Math.max(df, dr);
    case 'queen':
      return df === 0 || dr === 0 || df === dr ? 1 : 2;
    case 'rook':
      return df === 0 || dr === 0 ? 1 : 2;
    case 'bishop':
      if ((df + dr) % 2 !== 0) return 99;
      return df === dr ? 1 : 2;
    case 'knight': {
      // BFS on the empty board.
      const dist = new Array(64).fill(-1);
      dist[from] = 0;
      const queue = [from];
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur === to) return dist[cur];
        for (const [a, b] of BASE_PATTERNS.knight.leaps) {
          const f = (cur & 7) + a;
          const r = (cur >> 3) + b;
          if (f < 0 || f > 7 || r < 0 || r > 7) continue;
          const nxt = r * 8 + f;
          if (dist[nxt] < 0) {
            dist[nxt] = dist[cur] + 1;
            queue.push(nxt);
          }
        }
      }
      return 99;
    }
    case 'pawn': {
      const forward = (to >> 3) - (from >> 3);
      return forward > 0 && df <= forward ? forward : 99;
    }
  }
}
