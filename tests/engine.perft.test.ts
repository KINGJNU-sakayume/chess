import { describe, expect, it } from 'vitest';
import { Position, START_FEN } from '../src/engine/game/position';
import { parseFen, pseudoLegalMoves, makeMove as refMake, toFen as refToFen, type Position as RefPosition } from '../src/engine/chess';
import { Rng } from '../src/engine/rng';
import { moveFrom, moveTo, movePromo, KIND_LETTER, type Color } from '../src/engine/game/types';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

/** Orthodox perft: pseudo-legal moves filtered by "own King not attacked afterwards". */
function perft(pos: Position, depth: number): number {
  const buf = new Int32Array(256);
  const n = pos.generateMoves(buf, 0);
  let total = 0;
  const us = pos.side;
  for (let i = 0; i < n; i++) {
    pos.makeMove(buf[i]);
    if (!pos.inCheck(us as Color)) total += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return total;
}

describe('augment engine: orthodox perft', () => {
  it('start position', () => {
    const pos = Position.fromFen(START_FEN);
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
    expect(perft(pos, 4)).toBe(197281);
  });
  it('Kiwipete', () => {
    const pos = Position.fromFen(KIWIPETE);
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });
  it('position 3', () => {
    const pos = Position.fromFen(POSITION_3);
    expect(perft(pos, 4)).toBe(43238);
  });
  it('position 4', () => {
    const pos = Position.fromFen(POSITION_4);
    expect(perft(pos, 3)).toBe(9467);
  });
  it('position 5', () => {
    const pos = Position.fromFen(POSITION_5);
    expect(perft(pos, 3)).toBe(62379);
  });
  it('restores board and hash after make/unmake', () => {
    const pos = Position.fromFen(KIWIPETE);
    const before = pos.toFen();
    const [lo, hi] = pos.computeHash();
    perft(pos, 3);
    expect(pos.toFen()).toBe(before);
    expect([pos.hashLo, pos.hashHi]).toEqual([lo, hi]);
  });
});

const PROMO_LETTER: Record<string, string> = { queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' };
const refKey = (m: ReturnType<typeof pseudoLegalMoves>[number]) =>
  `${m.from}-${m.to}-${m.promotion ? PROMO_LETTER[m.promotion] : ''}`;
const key = (m: number) => `${moveFrom(m)}-${moveTo(m)}-${movePromo(m) ? KIND_LETTER[movePromo(m)] : ''}`;

describe('augment engine: differential check against the reference generator', () => {
  it('matches strict pseudo-legal moves on random games', () => {
    const rng = Rng.fromSeed('engine-diff');
    let checked = 0;
    for (let game = 0; game < 40; game++) {
      let ref: RefPosition = parseFen(START_FEN);
      const pos = Position.fromFen(START_FEN);
      for (let ply = 0; ply < 80; ply++) {
        const refMoves = pseudoLegalMoves(ref, 'strict');
        const mine = pos.moves();
        expect(new Set(mine.map(key))).toEqual(new Set(refMoves.map(refKey)));
        // Incremental hash equals a fresh one.
        expect([pos.hashLo, pos.hashHi]).toEqual(pos.computeHash());
        checked++;
        if (refMoves.length === 0) break;
        const pick = refMoves[rng.int(refMoves.length)];
        if (pick.captured === 'king') break;
        ref = refMake(ref, pick);
        const m = mine.find((x) => key(x) === refKey(pick))!;
        pos.makeMove(m);
        pos.commit();
        expect(pos.toFen()).toBe(refToFen(ref));
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
