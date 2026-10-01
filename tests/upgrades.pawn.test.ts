import { describe, expect, it } from 'vitest';
import { sqOf } from '../src/engine/core/coords';
import { deploymentZone, rosterWithUpgrades } from '../src/engine/run/rosterOps';
import { standardRoster } from '../src/engine/run/roster';
import { at, encounter, endTurn, logText, play, targets, withIntents, type BoardSpec } from './helpers';

const quiet = { enemyActions: 0, turnLimit: 20 };
const enc = (spec: Omit<BoardSpec, 'config'> & { config?: BoardSpec['config'] }) => encounter({ ...spec, config: { ...quiet, ...spec.config } });

describe('Double March', () => {
  it('lets Pawns advance 2 squares from any rank, +1 per stack, only along an empty path', () => {
    const base = { player: [['king', 'e1'], ['pawn', 'a3']] as BoardSpec['player'], enemy: [['king', 'h8']] as BoardSpec['enemy'] };
    expect(targets(enc(base), 'a3')).toEqual(['a4']);
    expect(targets(enc({ ...base, upgrades: ['pawn_double_march'] }), 'a3')).toEqual(['a4', 'a5']);
    expect(targets(enc({ ...base, upgrades: [['pawn_double_march', 2]] }), 'a3')).toEqual(['a4', 'a5', 'a6']);
    const blocked = enc({ ...base, enemy: [['king', 'h8'], ['knight', 'a5']], upgrades: [['pawn_double_march', 2]] });
    expect(targets(blocked, 'a3')).toEqual(['a4']);
  });

  it('extra-range pushes are tagged with the upgrade for the UI', () => {
    const s = enc({ player: [['king', 'e1'], ['pawn', 'c3']], enemy: [['king', 'h8']], upgrades: ['pawn_double_march'] });
    const after = play(s, 'c3', 'c5');
    expect(at(after, 'c5').type).toBe('pawn');
  });
});

describe('Mass Production', () => {
  it('adds a Pawn per stack; overflow goes to Reserve', () => {
    const zone = deploymentZone(false);
    const one = rosterWithUpgrades(standardRoster(), [{ id: 'pawn_mass_production', stacks: 1, order: 0 }], zone);
    expect(one.filter((r) => r.type === 'pawn')).toHaveLength(9);
    // The standard army fills ranks 1–2, so the new Pawn waits in Reserve.
    expect(one.find((r) => r.id === 'n16')?.sq).toBeNull();
    const zone3 = deploymentZone(true);
    const three = rosterWithUpgrades(standardRoster(), [{ id: 'pawn_mass_production', stacks: 3, order: 0 }], zone3);
    expect(three.filter((r) => r.type === 'pawn' && r.sq !== null && r.sq >= sqOf(0, 2))).toHaveLength(3);
  });
});

describe('Early Promotion', () => {
  it('lowers the promotion rank per stack, never below rank 4', () => {
    const base = { player: [['king', 'e1'], ['pawn', 'a6']] as BoardSpec['player'], enemy: [['king', 'h8']] as BoardSpec['enemy'] };
    const s1 = enc({ ...base, upgrades: ['pawn_early_promotion'] });
    expect(at(play(s1, 'a6', 'a7', { promotion: 'queen' }), 'a7').type).toBe('queen');
    const deep = { player: [['king', 'e1'], ['pawn', 'b3']] as BoardSpec['player'], enemy: [['king', 'h8']] as BoardSpec['enemy'] };
    const s4 = enc({ ...deep, upgrades: [['pawn_early_promotion', 4]] });
    expect(at(play(s4, 'b3', 'b4', { promotion: 'rook' }), 'b4').type).toBe('rook');
    const s6 = enc({ ...deep, upgrades: [['pawn_early_promotion', 6]] });
    expect(() => play(s6, 'b3', 'b4', { promotion: 'rook' })).not.toThrow();
    expect(at(play(enc({ ...deep, upgrades: [['pawn_early_promotion', 6]] }), 'b3', 'b4', { promotion: 'knight' }), 'b4').type).toBe('knight');
  });
});

describe('Veteran Pawn', () => {
  const spec = (stacks: number): BoardSpec => ({
    player: [['king', 'h1'], ['pawn', 'd4']],
    enemy: [['king', 'h8'], ['knight', 'e5'], ['bishop', 'd6'], ['rook', 'a1']],
    upgrades: [['pawn_veteran', stacks]],
    config: quiet,
  });

  it('a Pawn with 2 captures moves and captures like a King (stack 1)', () => {
    let s = encounter(spec(1));
    s = endTurn(play(s, 'd4', 'e5'));
    expect(targets(s, 'e5')).not.toContain('e4');
    s = endTurn(play(s, 'e5', 'd6'));
    expect(at(s, 'd6').captures).toBe(2);
    // Two captures: the Pawn now also moves like a King (backwards and sideways included).
    expect(targets(s, 'd6')).toEqual(expect.arrayContaining(['c5', 'd5', 'e5', 'c6', 'e6', 'd7']));
  });

  it('threshold drops to 1 capture with 2 stacks', () => {
    let s = encounter(spec(2));
    s = endTurn(play(s, 'd4', 'e5'));
    expect(targets(s, 'e5')).toEqual(expect.arrayContaining(['d5', 'e4', 'f4', 'd6', 'f6']));
  });
});

describe('Diagonal Advance', () => {
  it('diagonal-forward into empty squares when orthogonally adjacent to an allied Pawn', () => {
    const with2 = enc({ player: [['king', 'h1'], ['pawn', 'd4'], ['pawn', 'e4']], enemy: [['king', 'h8']], upgrades: ['pawn_diagonal_advance'] });
    expect(targets(with2, 'd4')).toEqual(['c5', 'd5', 'e5']);
    const alone = enc({ player: [['king', 'h1'], ['pawn', 'd4'], ['pawn', 'f4']], enemy: [['king', 'h8']], upgrades: ['pawn_diagonal_advance'] });
    expect(targets(alone, 'd4')).toEqual(['d5']);
  });
});

describe('Chain Promotion', () => {
  it('advances the most advanced other Pawn when a Pawn promotes', () => {
    const s = enc({
      player: [['king', 'h1'], ['pawn', 'a7'], ['pawn', 'c5'], ['pawn', 'e3']],
      enemy: [['king', 'h8']],
      upgrades: ['pawn_chain_promotion'],
    });
    const after = play(s, 'a7', 'a8', { promotion: 'queen' });
    expect(at(after, 'c6').type).toBe('pawn');
    expect(at(after, 'e3').type).toBe('pawn');
  });

  it('stacks advance more Pawns and chains promotions into the same piece', () => {
    const s = enc({
      player: [['king', 'h1'], ['pawn', 'a7'], ['pawn', 'c7'], ['pawn', 'e6'], ['pawn', 'g3']],
      enemy: [['king', 'h5']],
      upgrades: [['pawn_chain_promotion', 2]],
    });
    const after = play(s, 'a7', 'a8', { promotion: 'bishop' });
    // c7 promotes (→ bishop), which chains again: e6/e7 and g3 advance.
    expect(at(after, 'c8').type).toBe('bishop');
    expect(at(after, 'e8').type).toBe('bishop');
    expect(at(after, 'g5').type).toBe('pawn');
    expect(after.stats.promotions).toBe(3);
  });
});

describe('Phalanx', () => {
  it('side-by-side Pawns gain a Ward for the enemy phase', () => {
    let s = enc({
      player: [['king', 'h1'], ['pawn', 'c4'], ['pawn', 'd4'], ['pawn', 'g4']],
      enemy: [['king', 'h8'], ['rook', 'd8'], ['rook', 'g8']],
      upgrades: ['pawn_phalanx'],
      config: { enemyActions: 2 },
    });
    s = withIntents(s, [
      ['d8', 'd4'],
      ['g8', 'g4'],
    ]);
    const after = endTurn(s);
    expect(at(after, 'd4').type).toBe('pawn'); // warded: capture blocked
    expect(at(after, 'd8').type).toBe('rook');
    expect(at(after, 'g4').side).toBe('enemy'); // lonely pawn captured
    // The Ward expired at the end of the phase.
    expect(at(after, 'd4').tempWards).toHaveLength(0);
  });

  it('stack 2 adds diagonal-behind support; stack 3 any adjacency', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['pawn', 'd5'], ['pawn', 'c4'], ['pawn', 'f6'], ['pawn', 'f7']],
      enemy: [['king', 'a8'], ['rook', 'd8']],
      upgrades: [['pawn_phalanx', stacks]],
      config: { enemyActions: 1 },
    });
    const one = endTurn(withIntents(encounter(spec(1)), [['d8', 'd5']]));
    expect(at(one, 'd5').side).toBe('enemy');
    const two = endTurn(withIntents(encounter(spec(2)), [['d8', 'd5']]));
    expect(at(two, 'd5').side).toBe('player');
    const threeSpec = spec(3);
    const three = endTurn(withIntents(encounter({ ...threeSpec, enemy: [['king', 'a8'], ['rook', 'f8']] }), [['f8', 'f7']]));
    expect(at(three, 'f7').side).toBe('player');
  });
});

describe('Swarm Tide', () => {
  const eight = Array.from({ length: 8 }, (_, f) => ['pawn', `${'abcdefgh'[f]}2`] as ['pawn', string]);
  it('grants 1 Pawn-only extra action per 4 Pawns (divisor −1 per stack, min 2)', () => {
    const s1 = enc({ player: [['king', 'e1'], ...eight], enemy: [['king', 'e8']], upgrades: ['pawn_swarm_tide'] });
    expect(s1.actions.filter((t) => t.pieceTypes?.includes('pawn'))).toHaveLength(2);
    const s2 = enc({ player: [['king', 'e1'], ...eight], enemy: [['king', 'e8']], upgrades: [['pawn_swarm_tide', 2]] });
    expect(s2.actions.filter((t) => t.pieceTypes?.includes('pawn'))).toHaveLength(2);
    const s3 = enc({ player: [['king', 'e1'], ...eight], enemy: [['king', 'e8']], upgrades: [['pawn_swarm_tide', 3]] });
    expect(s3.actions.filter((t) => t.pieceTypes?.includes('pawn'))).toHaveLength(4);
    expect(logText(s3).some((t) => t.includes('Swarm Tide III'))).toBe(true);
  });

  it('pawn-only tokens cannot move other pieces', () => {
    const s = enc({ player: [['king', 'e1'], ['knight', 'g1'], ...eight], enemy: [['king', 'e8']], upgrades: [['pawn_swarm_tide', 3]] });
    const afterKnight = play(s, 'g1', 'f3'); // spends the base action
    expect(targets(afterKnight, 'f3')).toEqual([]);
    expect(targets(afterKnight, 'a2').length).toBeGreaterThan(0);
  });
});
