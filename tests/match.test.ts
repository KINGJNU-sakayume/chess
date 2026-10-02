import { describe, expect, it } from 'vitest';
import { pickDraft, think } from '../src/engine/ai/think';
import { DRAFT_PLIES } from '../src/engine/augments/draft';
import { findMove } from '../src/engine/game/notation';
import { BLACK, WHITE, parseSquare as sq, type Color } from '../src/engine/game/types';
import {
  applyAction,
  cardTargets,
  createMatch,
  replay,
  undoActions,
  type MatchSetup,
  type MatchState,
} from '../src/engine/match/match';

const setup = (seed: string): MatchSetup => ({ mode: 'local', human: WHITE, level: 2, seed });

/** One AI step for whoever has to act. */
function step(s: MatchState, level = 1): MatchState {
  if (s.phase === 'draft') {
    for (const color of [WHITE, BLACK] as Color[]) {
      const offer = s.sides[color].offer;
      if (offer) return applyAction(s, { type: 'pick', color, card: pickDraft(s.pos.toData(), color, offer, level, s.setup.seed) });
    }
  }
  const color = s.pos.side as Color;
  const side = s.sides[color];
  const r = think({
    pos: s.pos.toData(),
    history: s.hashes,
    level,
    cards: side.cards.filter((c) => c.uses > 0),
    cardAllowed: !side.cardUsedThisTurn,
    seed: s.setup.seed,
  });
  let next = s;
  if (r.card) next = applyAction(next, { type: 'card', color, card: r.card.id, sq: r.card.sq });
  if (next.phase === 'play') next = applyAction(next, { type: 'move', color, move: r.move });
  return next;
}

describe('match flow', () => {
  it('opens drafts at the start, move 10 and move 20 for both sides', () => {
    let s = createMatch(setup('draft-flow'));
    expect(s.phase).toBe('draft');
    expect(s.round).toBe(1);
    expect(s.sides[WHITE].offer).toHaveLength(3);
    expect(s.sides[BLACK].offer).toHaveLength(3);
    expect(s.sides[WHITE].offerTier).toBe(s.sides[BLACK].offerTier);
    // Moves are refused during the draft.
    expect(() => applyAction(s, { type: 'move', color: WHITE, move: findMove(s.pos, sq('e2'), sq('e4'))! })).toThrow();
    let guard = 0;
    while (s.phase !== 'over' && s.round < 3 && guard++ < 200) s = step(s);
    if (s.phase !== 'over') {
      expect(s.round).toBe(3);
      expect(s.pos.ply).toBe(DRAFT_PLIES[2]);
    }
  });

  it('reroll gives a fresh offer once', () => {
    const s = createMatch(setup('reroll'));
    const before = s.sides[WHITE].offer!;
    const after = applyAction(s, { type: 'reroll', color: WHITE });
    expect(after.sides[WHITE].offer).not.toEqual(before);
    expect(after.sides[WHITE].rerolls).toBe(0);
    expect(() => applyAction(after, { type: 'reroll', color: WHITE })).toThrow();
  });

  it('active cards: one per turn, targets enforced, uses spent', () => {
    let s = createMatch(setup('cards'));
    // Force-feed a card through the draft by picking whatever is offered, then grant the card directly for the test.
    s = applyAction(s, { type: 'pick', color: WHITE, card: s.sides[WHITE].offer![0] });
    s = applyAction(s, { type: 'pick', color: BLACK, card: s.sides[BLACK].offer![0] });
    s.sides[WHITE].cards.push({ id: 'shield', uses: 1 }, { id: 'freeze', uses: 2 });
    expect(cardTargets(s, WHITE, 'shield')).toContain(sq('d1'));
    expect(cardTargets(s, BLACK, 'shield')).toEqual([]);
    s = applyAction(s, { type: 'card', color: WHITE, card: 'shield', sq: sq('d1') });
    expect(s.pos.flags[sq('d1')] & 1).toBe(1);
    expect(cardTargets(s, WHITE, 'freeze')).toEqual([]);
    expect(() => applyAction(s, { type: 'card', color: WHITE, card: 'freeze', sq: sq('d8') })).toThrow();
    s = applyAction(s, { type: 'move', color: WHITE, move: findMove(s.pos, sq('e2'), sq('e4'))! });
    s = applyAction(s, { type: 'move', color: BLACK, move: findMove(s.pos, sq('e7'), sq('e5'))! });
    expect(cardTargets(s, WHITE, 'freeze')).toContain(sq('d8'));
    expect(s.sides[WHITE].cards.find((c) => c.id === 'shield')!.uses).toBe(0);
  });

  it('ai games finish and replay identically', () => {
    for (const seed of ['g1', 'g2', 'g3', 'g4']) {
      let s = createMatch(setup(seed));
      let guard = 0;
      while (s.phase !== 'over' && guard++ < 400) s = step(s, 2);
      const again = replay(s.setup, s.actions);
      expect(again.pos.toFen()).toBe(s.pos.toFen());
      expect(again.result).toEqual(s.result);
      expect(s.log.filter((l) => l.kind === 'pick').length).toBeGreaterThanOrEqual(2);
      // Piece ids stay in sync with the board.
      for (let i = 0; i < 64; i++) expect(s.ids[i] === null).toBe(s.pos.board[i] === 0);
    }
  });

  it('undo takes back the last own move and the reply', () => {
    let s = createMatch({ ...setup('undo'), mode: 'ai' });
    s = applyAction(s, { type: 'pick', color: WHITE, card: s.sides[WHITE].offer![0] });
    s = applyAction(s, { type: 'pick', color: BLACK, card: s.sides[BLACK].offer![0] });
    const start = s.pos.toFen();
    s = applyAction(s, { type: 'move', color: WHITE, move: findMove(s.pos, sq('d2'), sq('d4'))! });
    s = applyAction(s, { type: 'move', color: BLACK, move: findMove(s.pos, sq('d7'), sq('d5'))! });
    const back = replay(s.setup, undoActions(s.actions, WHITE));
    expect(back.pos.toFen()).toBe(start);
  });

  it('resignation and King capture end the game', () => {
    let s = createMatch(setup('end'));
    s = applyAction(s, { type: 'pick', color: WHITE, card: s.sides[WHITE].offer![0] });
    s = applyAction(s, { type: 'pick', color: BLACK, card: s.sides[BLACK].offer![0] });
    const r = applyAction(s, { type: 'resign', color: WHITE });
    expect(r.result).toEqual({ winner: BLACK, reason: 'resign' });
    // Fool's mate shape, finished by capturing the King.
    const play = (st: MatchState, c: Color, a: string, b: string) =>
      applyAction(st, { type: 'move', color: c, move: findMove(st.pos, sq(a), sq(b))! });
    s = play(s, WHITE, 'f2', 'f3');
    s = play(s, BLACK, 'e7', 'e5');
    s = play(s, WHITE, 'g2', 'g4');
    s = play(s, BLACK, 'd8', 'h4');
    if (s.phase === 'play') {
      s = play(s, WHITE, 'a2', 'a3');
      if (s.phase === 'play' && findMove(s.pos, sq('h4'), sq('e1')) !== null) {
        s = play(s, BLACK, 'h4', 'e1');
        expect(s.result?.winner).toBe(BLACK);
      }
    }
  });
});
