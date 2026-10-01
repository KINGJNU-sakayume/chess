import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/engine/core/coords';
import type { EncounterState } from '../src/engine/core/state';
import { at, encounter, endTurn, logText, mutation, play, targets } from './helpers';

/**
 * Interaction regression tests (G2): multi-upgrade combos are the highest
 * stacking bug risk. These pin down exact resolution order and outcomes.
 */

const quiet = { enemyActions: 0, turnLimit: 20 };
const linesAfter = (s: EncounterState, from: number) => s.log.slice(from).map((l) => (l.depth ? '→ ' : '') + l.text);

describe('Long Cathedral + Bishop Battery + Crusade + Bishop Altar', () => {
  const setup = () => {
    const s = encounter({
      player: [['king', 'h1'], ['bishop', 'c1'], ['bishop', 'f8'], ['bishop', 'a2']],
      enemy: [['king', 'a8'], ['knight', 'h6'], ['pawn', 'd6'], ['rook', 'b4']],
      mutations: [mutation('altar', 'BISHOP_ALTAR', 'e3')],
      upgrades: [['bishop_long_cathedral', 2], ['bishop_battery', 1], ['bishop_crusade', 3]],
      config: quiet,
    });
    return { ...s, counters: { ...s.counters, zeal: 3 } };
  };

  it('resolves in documented order with the expected log', () => {
    const s = setup();
    const mark = s.log.length;
    const after = play(s, 'c1', 'h6');
    expect(linesAfter(after, mark)).toEqual([
      'Bishop c1 → h6 (5 squares)',
      '→ crossed Bishop Altar e3: +1 Ward',
      '→ Long Cathedral II: extra action (a different Bishop)',
      '→ captured Knight h6',
      '→ Bishop Battery: extra action (Bishop)',
      '→ Crusade III: Zeal 3 → 6',
    ]);
    expect(at(after, 'h6').wards).toBe(1);
    expect(after.counters.zeal).toBe(6);
    expect(after.actions.map((t) => t.label)).toEqual(['Long Cathedral II: a different Bishop', 'Bishop Battery: Bishop']);
  });

  it('the granted actions chain into further Bishop moves (pierce unlocked at 6 Zeal)', () => {
    let s = play(setup(), 'c1', 'h6');
    const hBishop = s.board[parseSq('h6')]!;
    // Long Cathedral's token excludes the Bishop that earned it.
    expect(s.actions[0].excludePieceId).toBe(hBishop);
    // Zeal 6: f8 pierces the d6 pawn and captures the b4 rook (4 squares → Long Cathedral again).
    expect(targets(s, 'f8')).toEqual(expect.arrayContaining(['c5', 'b4']));
    s = play(s, 'f8', 'b4');
    expect(at(s, 'd6').type).toBe('pawn');
    expect(s.counters.zeal).toBe(9);
    expect(s.actions.map((t) => t.label)).toEqual(['Bishop Battery: Bishop', 'Long Cathedral II: a different Bishop']);
    // Zeal ≥ 3: Bishops also step orthogonally.
    expect(targets(s, 'a2')).toEqual(expect.arrayContaining(['a1', 'b2', 'a3']));
    expect(s.captured.map((c) => c.piece.type)).toEqual(['knight', 'rook']);
  });

  it('wards from the Altar do not repeat within a turn but return next turn', () => {
    let s = play(setup(), 'c1', 'h6');
    s = play(s, 'h6', 'c1'); // crosses e3 again with the Battery token: once per Bishop per turn
    expect(at(s, 'c1').wards).toBe(1);
    s = endTurn(s);
    s = play(s, 'c1', 'g5');
    expect(at(s, 'g5').wards).toBe(2);
  });
});

describe('Double March + Early Promotion + Chain Promotion + Promotion Square', () => {
  it('a long push promotes and chains through the Promotion Square', () => {
    const s = encounter({
      player: [['king', 'h1'], ['pawn', 'a5'], ['pawn', 'c6'], ['pawn', 'e4'], ['pawn', 'g2']],
      enemy: [['king', 'h8']],
      mutations: [mutation('promo', 'PROMOTION', 'e5')],
      upgrades: ['pawn_double_march', 'pawn_early_promotion', 'pawn_chain_promotion'],
      config: quiet,
    });
    expect(targets(s, 'a5')).toEqual(['a6', 'a7']);
    const mark = s.log.length;
    const after = play(s, 'a5', 'a7', { promotion: 'queen' });
    expect(at(after, 'a7').type).toBe('queen');
    expect(at(after, 'c7').type).toBe('queen');
    expect(at(after, 'e5').type).toBe('queen');
    expect(at(after, 'g3').type).toBe('pawn');
    expect(after.stats.promotions).toBe(3);
    expect(linesAfter(after, mark)).toEqual([
      'Pawn a5 → a7 (2 squares)',
      '→ Pawn a7 promotes to Queen',
      '→ Chain Promotion: Pawn c6 advances to c7',
      '→ Pawn c7 promotes to Queen',
      '→ Chain Promotion: Pawn e4 advances to e5',
      '→ Pawn e5 promotes to Queen',
      '→ Chain Promotion: Pawn g2 advances to g3',
      '→ Check: the enemy King on h8 is attacked',
    ]);
  });

  it('stacked Double March reaches the lowered promotion rank in one move', () => {
    const s = encounter({
      player: [['king', 'h1'], ['pawn', 'b3']],
      enemy: [['king', 'h8']],
      upgrades: [['pawn_double_march', 2], ['pawn_early_promotion', 2]],
      config: quiet,
    });
    // Promotion on rank 6: b3 → b6 is a 3-square advance that promotes.
    const after = play(s, 'b3', 'b6', { promotion: 'rook' });
    expect(at(after, 'b6').type).toBe('rook');
    expect(logText(after).some((t) => t.includes('promotes to Rook'))).toBe(true);
  });
});
