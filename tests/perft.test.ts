import { describe, expect, it } from 'vitest';
import { parseFen, START_FEN, toFen } from '../src/engine/chess/position';
import { perft } from '../src/engine/chess/perft';
import { chessStatus, legalMoves, makeMove, pseudoLegalMoves } from '../src/engine/chess/movegen';
import { parseSq } from '../src/engine/core/coords';

// Reference values from the Chess Programming Wiki "Perft Results" page.
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

describe('perft (strict standard mode)', () => {
  it('start position depth 1-3', () => {
    const pos = parseFen(START_FEN);
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
  });

  it('Kiwipete depth 1-3', () => {
    const pos = parseFen(KIWIPETE);
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });

  it('position 3 depth 1-4', () => {
    const pos = parseFen(POSITION_3);
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });

  it('position 4 depth 1-3', () => {
    const pos = parseFen(POSITION_4);
    expect(perft(pos, 1)).toBe(6);
    expect(perft(pos, 2)).toBe(264);
    expect(perft(pos, 3)).toBe(9467);
  });

  it('position 5 depth 1-3', () => {
    const pos = parseFen(POSITION_5);
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1486);
    expect(perft(pos, 3)).toBe(62379);
  });

  it('round-trips FEN', () => {
    for (const fen of [START_FEN, KIWIPETE, POSITION_3, POSITION_4, POSITION_5]) {
      expect(toFen(parseFen(fen))).toBe(fen);
    }
  });
});

describe('king-capture reference mode', () => {
  it('allows moves that leave the own King attacked', () => {
    // White king e1 pinned bishop d2 by black queen a5: strict mode forbids moving the bishop off the pin line.
    const pos = parseFen('4k3/8/8/q7/8/8/3B4/4K3 w - - 0 1');
    const strict = legalMoves(pos).filter((m) => m.from === parseSq('d2'));
    const kc = pseudoLegalMoves(pos, 'kingCapture').filter((m) => m.from === parseSq('d2'));
    expect(kc.length).toBeGreaterThan(strict.length);
    expect(strict.every((m) => [parseSq('c3'), parseSq('b4'), parseSq('a5')].includes(m.to))).toBe(true);
  });

  it('castles through attacked squares and ends on king capture', () => {
    const pos = parseFen('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
    expect(legalMoves(pos).some((m) => m.castle)).toBe(false);
    expect(pseudoLegalMoves(pos, 'kingCapture').some((m) => m.castle === 'K')).toBe(true);
    // Black rook captures the white king in king-capture mode.
    const blackToMove = parseFen('4k3/8/8/8/8/8/8/4K2r b - - 0 1');
    const capture = pseudoLegalMoves(blackToMove, 'kingCapture').find((m) => m.to === parseSq('e1'));
    expect(capture?.captured).toBe('king');
    const after = makeMove(blackToMove, capture!);
    expect(chessStatus(after, 'kingCapture')).toEqual({ kind: 'kingCaptured', winner: 'b' });
  });

  it('detects checkmate in strict mode', () => {
    const pos = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(chessStatus(pos, 'strict')).toEqual({ kind: 'checkmate', winner: 'b' });
  });
});
