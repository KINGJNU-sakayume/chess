import { describe, expect, it } from 'vitest';
import { compileRules } from '../src/engine/augments/draft';
import { Searcher } from '../src/engine/ai/search';
import { pickDraft, think } from '../src/engine/ai/think';
import { Position } from '../src/engine/game/position';
import { parseSquare as sq, sqName, WHITE } from '../src/engine/game/types';

const uci = (m: number) => sqName(m & 63) + sqName((m >> 6) & 63);

function best(fen: string, depth = 4, white: string[] = [], black: string[] = []): string {
  const pos = Position.fromFen(fen, [compileRules(white), compileRules(black)]);
  const r = new Searcher(pos, 16).search({ depth });
  return uci(r.move);
}

describe('search', () => {
  it('captures the King when it can', () => {
    expect(best('4k3/8/8/8/8/8/8/r3K3 b - - 0 1', 2)).toBe('a1e1');
  });

  it('wins a hanging queen', () => {
    expect(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 4)).toBe('d1d5');
  });

  it('does not leave its King en prise', () => {
    // The rook on e2 shields the King from the rook on e8; the only good move takes that rook.
    expect(best('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1', 4)).toBe('e2e8');
  });

  it('finds a back-rank mate (King capture) in two', () => {
    expect(best('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', 4)).toBe('d1d8');
  });

  it('walks onto the hill to win', () => {
    expect(best('4k3/8/8/8/8/4K3/8/8 w - - 0 1', 2, ['king_of_the_hill'])).toMatch(/^e3(d4|e4)$/);
  });

  it('respects shields: does not capture into a bounce when it loses material', () => {
    const pos = Position.fromFen('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1');
    pos.setFlags(sq('d5'), 1);
    const r = new Searcher(pos, 16).search({ depth: 3 });
    expect(r.score).toBeGreaterThan(0);
  });

  it('restores the position after searching', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const pos = Position.fromFen(fen, [compileRules(['amazon', 'pawn_pike']), compileRules(['martyr_pawns', 'camel_knight'])]);
    const hash = [pos.hashLo, pos.hashHi];
    new Searcher(pos, 16).search({ depth: 4 });
    expect(pos.toFen()).toBe(fen);
    expect([pos.hashLo, pos.hashHi]).toEqual(hash);
  });
});

describe('think', () => {
  it('uses a card when it saves material', () => {
    // Resurrect has no target (nothing was lost); Reinforce adds a pawn, which is worth spending.
    const pos = Position.fromFen('4k3/8/8/8/8/2p1p3/3Q4/4K3 w - - 0 1');
    const r = think({
      pos: pos.toData(),
      history: [],
      level: 4,
      cards: [{ id: 'resurrect', uses: 1 }, { id: 'reinforce', uses: 1 }],
      cardAllowed: true,
      seed: 't',
      timeMs: 300,
    });
    expect(r.move).not.toBe(0);
    expect(r.card?.id).toBe('reinforce');
  });

  it('every level returns a legal move', () => {
    const pos = Position.fromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    for (let level = 1; level <= 5; level++) {
      const r = think({ pos: pos.toData(), history: [], level, cards: [], cardAllowed: false, seed: 'x', timeMs: 150 });
      expect(pos.moves()).toContain(r.move);
    }
  });

  it('drafts a card from the offer', () => {
    const pos = Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const pick = pickDraft(pos.toData(), WHITE, ['pawn_retreat', 'camel_knight', 'barricade'], 5, 'seed');
    expect(['pawn_retreat', 'camel_knight', 'barricade']).toContain(pick);
  });
});
