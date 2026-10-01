import { describe, expect, it } from 'vitest';
import { makeMove, parseFen, pseudoLegalMoves, START_FEN, type Position } from '../src/engine/chess';
import { sqOf } from '../src/engine/core/coords';
import type { EncounterState, Piece } from '../src/engine/core/state';
import { blankState } from '../src/engine/encounters/setup';
import { createGenContext, pieceMoves } from '../src/engine/moves/generate';
import { Rng } from '../src/engine/rng';
import { config } from './helpers';

/** Convert a reference position into a gameplay state with no upgrades (White = player). */
function toEncounter(pos: Position): EncounterState {
  const s = blankState({ config: config(), rules: { upgrades: [], affixes: [] } });
  let n = 0;
  pos.board.forEach((p, sq) => {
    if (!p) return;
    const side = p.color === 'w' ? 'player' : 'enemy';
    let moved = true;
    if (p.type === 'king') moved = p.color === 'w' ? !(pos.castling.wK || pos.castling.wQ) : true;
    if (p.type === 'rook' && p.color === 'w') moved = !((sq === 0 && pos.castling.wQ) || (sq === 7 && pos.castling.wK));
    const piece: Piece = { id: `x${n++}`, type: p.type, side, sq, moved, wards: 0, tempWards: [], statuses: [], captures: 0, tags: [], counters: {} };
    s.pieces[piece.id] = piece;
    s.board[sq] = piece.id;
  });
  if (pos.ep !== null && pos.turn === 'w') {
    const victimSq = sqOf(pos.ep & 7, 4);
    const id = s.board[victimSq];
    if (id) s.enPassant = { sq: pos.ep, pawnId: id };
  }
  return s;
}

const key = (from: number, to: number, promo: string | null | undefined) => `${from}-${to}-${promo ?? ''}`;

describe('gameplay MoveGenerator (king-capture mode, no upgrades)', () => {
  it('matches the reference pseudo-legal generator on random positions', () => {
    const rng = Rng.fromSeed('movegen-crosscheck');
    let positions = 0;
    for (let game = 0; game < 60; game++) {
      let pos = parseFen(START_FEN);
      for (let ply = 0; ply < 60; ply++) {
        const moves = pseudoLegalMoves(pos, 'kingCapture');
        if (!moves.length || moves.some((m) => m.captured === 'king')) break;
        const s = toEncounter(pos);
        const ctx = createGenContext(s);
        const side = pos.turn === 'w' ? 'player' : 'enemy';
        const ours = new Set<string>();
        for (const id of Object.keys(s.pieces)) {
          if (s.pieces[id].side !== side) continue;
          for (const m of pieceMoves(ctx, id)) ours.add(key(m.from, m.to, m.promotion));
        }
        const theirs = new Set<string>();
        for (const m of moves) {
          // The enemy never castles, never captures en passant and always promotes to a Queen.
          if (side === 'enemy' && (m.castle || m.ep || (m.promotion && m.promotion !== 'queen'))) continue;
          theirs.add(key(m.from, m.to, m.promotion));
        }
        expect([...ours].sort()).toEqual([...theirs].sort());
        positions++;
        pos = makeMove(pos, rng.pick(moves));
      }
    }
    expect(positions).toBeGreaterThan(1000);
  });

  it('allows moves that leave the own King attacked (king-capture mode)', () => {
    const s = toEncounter(parseFen('4k3/8/8/q7/8/8/3B4/4K3 w - - 0 1'));
    const ctx = createGenContext(s);
    const bishop = Object.values(s.pieces).find((p) => p.type === 'bishop')!;
    expect(pieceMoves(ctx, bishop.id).length).toBe(8); // c1, e3–h6, c3, b4, xa5
  });
});
