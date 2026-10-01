import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/engine/core/coords';
import { deploymentZone, rosterWithUpgrades } from '../src/engine/run/rosterOps';
import { standardRoster } from '../src/engine/run/roster';
import { at, encounter, endTurn, logText, mutation, play, targets, withIntents, type BoardSpec } from './helpers';

const quiet = { enemyActions: 0, turnLimit: 20 };

describe('Ordination', () => {
  it('adds a Bishop per stack', () => {
    const r = rosterWithUpgrades(standardRoster(), [{ id: 'bishop_ordination', stacks: 2, order: 0 }], deploymentZone(true));
    expect(r.filter((p) => p.type === 'bishop')).toHaveLength(4);
  });
});

describe('Long Cathedral', () => {
  const spec = (stacks = 1): BoardSpec => ({
    player: [['king', 'e1'], ['bishop', 'c1'], ['bishop', 'f1']],
    enemy: [['king', 'e8']],
    upgrades: [['bishop_long_cathedral', stacks]],
    config: quiet,
  });

  it('a 4+ square Bishop move grants an extra action for a different Bishop', () => {
    const s = play(encounter(spec()), 'c1', 'g5'); // 4 squares
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]).toMatchObject({ pieceTypes: ['bishop'], excludePieceId: s.board[parseSq('g5')] });
    expect(targets(s, 'g5')).toEqual([]); // the same Bishop cannot use it
    expect(targets(s, 'f1').length).toBeGreaterThan(0);
  });

  it('short moves do not trigger; stacks lower the threshold', () => {
    expect(play(encounter(spec()), 'c1', 'e3').actions).toHaveLength(0);
    expect(play(encounter(spec(2)), 'c1', 'f4').actions).toHaveLength(1); // 3 squares
  });

  it('triggers once per Bishop per turn (D4 loop safety)', () => {
    let s = play(encounter(spec()), 'c1', 'g5'); // token for f1
    s = play(s, 'f1', 'b5'); // 4 squares: token for g5
    expect(s.actions).toHaveLength(1);
    s = play(s, 'g5', 'c1'); // g5 already triggered this turn: no new token
    expect(s.actions).toHaveLength(0);
  });
});

describe('Consecrated Diagonal', () => {
  it('crossed squares become Consecrated; intents ending there fizzle', () => {
    let s = encounter({
      player: [['king', 'h1'], ['bishop', 'a1']],
      enemy: [['king', 'h8'], ['rook', 'c8']],
      upgrades: ['bishop_consecrated_diagonal'],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = play(s, 'a1', 'e5'); // crosses b2, c3, d4
    expect(s.marks.filter((m) => m.type === 'CONSECRATED').map((m) => m.sq)).toEqual(['b2', 'c3', 'd4'].map(parseSq));
    s = withIntents(s, [['c8', 'c3']]);
    const after = endTurn(s);
    expect(logText(after).some((t) => t.includes('destination consecrated'))).toBe(true);
    // Lasts until the end of the next turn.
    expect(after.marks.some((m) => m.type === 'CONSECRATED')).toBe(true);
    expect(endTurn(after).marks.some((m) => m.type === 'CONSECRATED')).toBe(false);
  });
});

describe('Twin Bishops', () => {
  it('Bishops on both colours start with Wards (per stack)', () => {
    const both = encounter({ player: [['king', 'e1'], ['bishop', 'c1'], ['bishop', 'f1']], enemy: [['king', 'e8']], upgrades: [['bishop_twin', 2]], config: quiet });
    expect(at(both, 'c1').wards).toBe(2);
    expect(at(both, 'f1').wards).toBe(2);
    const same = encounter({ player: [['king', 'e1'], ['bishop', 'c1'], ['bishop', 'e3']], enemy: [['king', 'e8']], upgrades: ['bishop_twin'], config: quiet });
    expect(at(same, 'c1').wards).toBe(0);
  });
});

describe('Bishop Battery', () => {
  const spec = (stacks: number): BoardSpec => ({
    player: [['king', 'h1'], ['bishop', 'a1'], ['bishop', 'g1']],
    enemy: [['king', 'h8'], ['knight', 'd4'], ['pawn', 'b6']],
    upgrades: [['bishop_battery', stacks]],
    config: quiet,
  });

  it('capturing a piece another Bishop also attacked grants a Bishop-only action', () => {
    const s = play(encounter(spec(1)), 'a1', 'd4');
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0].pieceTypes).toEqual(['bishop']);
  });

  it('stack 2+: the extra action is unrestricted (+1 per further stack)', () => {
    const s2 = play(encounter(spec(2)), 'a1', 'd4');
    expect(s2.actions).toHaveLength(1);
    expect(s2.actions[0].pieceTypes).toBeUndefined();
    expect(play(encounter(spec(3)), 'a1', 'd4').actions).toHaveLength(2);
  });

  it('no trigger when no other Bishop attacked the target', () => {
    const s = encounter({ ...spec(1), enemy: [['king', 'h8'], ['knight', 'c3']] });
    expect(play(s, 'a1', 'c3').actions).toHaveLength(0);
  });
});

describe('Bishop Recall', () => {
  it('after capturing, the Bishop may return to its origin for free, once per Bishop per turn', () => {
    const s = encounter({
      player: [['king', 'h1'], ['bishop', 'c1']],
      enemy: [['king', 'h8'], ['knight', 'f4']],
      upgrades: ['bishop_recall'],
      config: quiet,
    });
    const after = play(s, 'c1', 'f4', { recall: true });
    expect(at(after, 'c1').type).toBe('bishop');
    expect(after.board[parseSq('f4')]).toBeNull();
    expect(after.captured).toHaveLength(1);
    expect(logText(after).some((t) => t.includes('Bishop Recall'))).toBe(true);
  });
});

describe('Crusade', () => {
  const spec = (stacks: number): BoardSpec => ({
    player: [['king', 'h1'], ['bishop', 'c1']],
    enemy: [['king', 'h8'], ['pawn', 'd2'], ['pawn', 'e3'], ['pawn', 'f4'], ['pawn', 'b6'], ['knight', 'a7']],
    upgrades: [['bishop_crusade', stacks]],
    config: quiet,
  });

  it('builds Zeal per capture; 3 Zeal unlocks an orthogonal step', () => {
    let s = encounter(spec(1));
    s = endTurn(play(s, 'c1', 'd2'));
    s = endTurn(play(s, 'd2', 'e3'));
    expect(s.counters.zeal).toBe(2);
    expect(targets(s, 'e3')).not.toContain('e4');
    s = endTurn(play(s, 'e3', 'f4'));
    expect(s.counters.zeal).toBe(3);
    expect(targets(s, 'f4')).toEqual(expect.arrayContaining(['f5', 'e4', 'g4', 'f3']));
  });

  it('stacks add Zeal faster; 6 Zeal makes Bishops pierce 1 enemy', () => {
    let s = encounter(spec(3));
    s = endTurn(play(s, 'c1', 'd2'));
    expect(s.counters.zeal).toBe(3);
    s = endTurn(play(s, 'd2', 'e3'));
    expect(s.counters.zeal).toBe(6);
    // From e3, the a7 knight sits behind the b6 pawn: piercing lets the Bishop capture it.
    expect(targets(s, 'e3')).toContain('a7');
  });
});

describe('Piercing Bishop', () => {
  it('passes through enemy pieces (stacks add more)', () => {
    const base: BoardSpec = {
      player: [['king', 'h1'], ['bishop', 'a1']],
      enemy: [['king', 'h8'], ['pawn', 'c3'], ['pawn', 'e5'], ['rook', 'g7']],
      config: quiet,
    };
    expect(targets(encounter(base), 'a1')).toEqual(['b2', 'c3']);
    const one = targets(encounter({ ...base, upgrades: ['bishop_piercing'] }), 'a1');
    expect(one).toEqual(['b2', 'c3', 'd4', 'e5']);
    const two = targets(encounter({ ...base, upgrades: [['bishop_piercing', 2]] }), 'a1');
    expect(two).toEqual(['b2', 'c3', 'd4', 'e5', 'f6', 'g7']);
    const after = play(encounter({ ...base, upgrades: [['bishop_piercing', 2]] }), 'a1', 'g7');
    expect(after.captured.map((c) => c.piece.type)).toEqual(['rook']);
    expect(at(after, 'c3').type).toBe('pawn');
  });

  it('does not pierce allied pieces', () => {
    const s = encounter({ player: [['king', 'h1'], ['bishop', 'a1'], ['pawn', 'b2']], enemy: [['king', 'h8']], upgrades: ['bishop_piercing'], config: quiet });
    expect(targets(s, 'a1')).toEqual([]);
  });
});

describe('Diagonal Dominion', () => {
  it('turns empty squares attacked by 2+ Bishops Crimson until your next turn', () => {
    let s = encounter({
      player: [['king', 'h1'], ['bishop', 'c1'], ['bishop', 'g1']],
      enemy: [['king', 'a8'], ['rook', 'e8']],
      upgrades: ['bishop_diagonal_dominion'],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = withIntents(s, [['e8', 'e3']]);
    const after = endTurn(s);
    // c1 and g1 both attack e3: it was Crimson during the enemy phase, so the rook is Immobilized.
    expect(at(after, 'e3').statuses.some((st) => st.type === 'IMMOBILIZED')).toBe(true);
    // The Crimson squares expired at the start of the new turn.
    expect(after.marks.some((m) => m.source === 'bishop_diagonal_dominion')).toBe(false);
  });

  it('stack 2: squares attacked by a Bishop on an Altar also qualify', () => {
    const s = encounter({
      player: [['king', 'h1'], ['bishop', 'c1']],
      enemy: [['king', 'a8']],
      upgrades: [['bishop_diagonal_dominion', 2]],
      mutations: [mutation('m1', 'BISHOP_ALTAR', 'c1')],
      config: quiet,
    });
    const r = endTurn(s);
    // Inspect the turn-end log: the lone Bishop on its Altar turned d2 (and the rest of its diagonals) Crimson.
    expect(logText(r).some((t) => t.startsWith('Diagonal Dominion II') && t.includes('d2'))).toBe(true);
  });
});
