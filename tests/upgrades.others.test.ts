import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/engine/core/coords';
import { createGenContext, pieceMoves } from '../src/engine/moves/generate';
import { deploymentZone, rosterWithUpgrades } from '../src/engine/run/rosterOps';
import { standardRoster } from '../src/engine/run/roster';
import { at, encounter, endTurn, logText, play, targets, withIntents, type BoardSpec } from './helpers';

const quiet = { enemyActions: 0, turnLimit: 20 };

describe('Knight upgrades (C3)', () => {
  it('Cavalry adds a Knight per stack', () => {
    const r = rosterWithUpgrades(standardRoster(), [{ id: 'knight_cavalry', stacks: 2, order: 0 }], deploymentZone(true));
    expect(r.filter((p) => p.type === 'knight')).toHaveLength(4);
  });

  it('Fork Engine: a forking Knight move grants a non-Knight action, once per turn per stack', () => {
    const spec: BoardSpec = {
      player: [['king', 'h1'], ['knight', 'b1'], ['bishop', 'f1']],
      enemy: [['king', 'h8'], ['rook', 'b5'], ['bishop', 'e4']],
      upgrades: ['knight_fork_engine'],
      config: quiet,
    };
    const s = play(encounter(spec), 'b1', 'c3'); // attacks b5 and e4
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0].excludeTypes).toEqual(['knight']);
    expect(targets(s, 'c3')).toEqual([]);
    expect(targets(s, 'f1').length).toBeGreaterThan(0);
  });

  it('Momentum Knight: a Knight that moved last turn gets a free follow-up (non-capturing at stack 1)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['knight', 'b1']],
      enemy: [['king', 'h8'], ['pawn', 'e7']],
      upgrades: [['knight_momentum', stacks]],
      config: quiet,
    });
    let s = play(encounter(spec(1)), 'b1', 'c3');
    expect(s.actions).toHaveLength(0); // did not move last turn
    s = play(endTurn(s), 'c3', 'd5');
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]).toMatchObject({ pieceId: s.board[parseSq('d5')], nonCapturing: true });
    // The follow-up may not capture the e7 Pawn at stack 1.
    expect(targets(s, 'd5')).not.toContain('e7');
    expect(targets(s, 'd5')).toContain('f6');
    // Stack 2: the follow-up may capture.
    let s2 = play(encounter({ ...spec(2), enemy: [['king', 'h8'], ['pawn', 'b6']] }), 'b1', 'c3');
    s2 = play(endTurn(s2), 'c3', 'd5');
    expect(s2.actions[0].nonCapturing).toBeUndefined();
    expect(targets(s2, 'd5')).toContain('b6');
  });

  it('Landing Shock immobilizes adjacent enemies (+1 phase per stack)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['knight', 'b1']],
      enemy: [['king', 'h8'], ['pawn', 'd4'], ['rook', 'b4']],
      upgrades: [['knight_landing_shock', stacks]],
      config: quiet,
    });
    const s = play(encounter(spec(1)), 'b1', 'c3');
    expect(at(s, 'd4').statuses[0].expires).toEqual({ at: 'phaseEnd', turn: 1 });
    expect(at(s, 'b4').statuses).toHaveLength(1);
    const s2 = play(encounter(spec(2)), 'b1', 'c3');
    expect(at(s2, 'b4').statuses[0].expires).toEqual({ at: 'phaseEnd', turn: 2 });
  });

  it('Royal Fork captures the most valuable piece forked with the King', () => {
    const s = encounter({
      player: [['king', 'a1'], ['knight', 'b1']],
      enemy: [['king', 'b5'], ['rook', 'e4'], ['pawn', 'a4']],
      upgrades: ['knight_royal_fork'],
      config: quiet,
    });
    const after = play(s, 'b1', 'c3'); // attacks b5 (King), e4 (Rook), a4 (Pawn)
    expect(after.captured.map((c) => c.piece.type)).toEqual(['rook']);
    expect(at(after, 'c3').type).toBe('knight');
    expect(logText(after).some((t) => t.startsWith('Royal Fork'))).toBe(true);
  });
});

describe('Rook upgrades (C4)', () => {
  it('Open File: a Rook on a pawnless file slides through 1 ally (any number at stack 2)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['rook', 'a1'], ['knight', 'a3'], ['bishop', 'a5']],
      enemy: [['king', 'h8']],
      upgrades: [['rook_open_file', stacks]],
      config: quiet,
    });
    expect(targets(encounter(spec(1)), 'a1')).toEqual(expect.arrayContaining(['a2', 'a4']));
    expect(targets(encounter(spec(1)), 'a1')).not.toContain('a6');
    expect(targets(encounter(spec(2)), 'a1')).toEqual(expect.arrayContaining(['a4', 'a6', 'a8']));
    const withPawn = encounter({ ...spec(1), enemy: [['king', 'h8'], ['pawn', 'a7']] });
    expect(targets(withPawn, 'a1')).not.toContain('a4');
  });

  it('Rook Battery: capturing while aligned grants the partner Rook actions (per stack)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['rook', 'a1'], ['rook', 'a3']],
      enemy: [['king', 'h8'], ['knight', 'a6']],
      upgrades: [['rook_battery', stacks]],
      config: quiet,
    });
    const s = play(encounter(spec(2)), 'a3', 'a6');
    expect(s.actions).toHaveLength(2);
    expect(s.actions.every((t) => t.pieceId === s.board[parseSq('a1')])).toBe(true);
  });

  it('Siege Engine: two turn-ends attacking the same piece capture it at the next turn start', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['rook', 'a1'], ['pawn', 'h2']],
      enemy: [['king', 'h8'], ['knight', 'a6']],
      upgrades: [['rook_siege_engine', stacks]],
      config: quiet,
    });
    let s = endTurn(encounter(spec(1)));
    expect(at(s, 'a6').type).toBe('knight'); // only one turn-end so far
    expect(at(s, 'a6').counters.besieged).toBeFalsy();
    s = endTurn(s);
    expect(s.captured.map((c) => c.piece.type)).toEqual(['knight']);
    expect(at(s, 'a1').type).toBe('rook'); // the Rook bombards from range
    // Stack 2: a single turn-end is enough.
    const s2 = endTurn(encounter(spec(2)));
    expect(s2.captured.map((c) => c.piece.type)).toEqual(['knight']);
  });

  it('Siege Engine: a target that escapes the line is spared', () => {
    let s = encounter({
      player: [['king', 'h1'], ['rook', 'a1']],
      enemy: [['king', 'h8'], ['knight', 'a6']],
      upgrades: [['rook_siege_engine', 2]],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = endTurn(withIntents(s, [['a6', 'c5']]));
    expect(s.captured).toHaveLength(0);
    expect(logText(s).some((t) => t.includes('siege') && t.includes('broken'))).toBe(true);
  });

  it('Castle Doctrine: castling is free and Wards the Rook', () => {
    const s = encounter({
      player: [['king', 'e1'], ['rook', 'h1']],
      enemy: [['king', 'e8']],
      upgrades: ['rook_castle_doctrine'],
      config: quiet,
    });
    const after = play(s, 'e1', 'g1');
    expect(after.actions).toHaveLength(1);
    expect(at(after, 'f1').wards).toBe(1);
  });
});

describe('Queen and King upgrades (C5)', () => {
  it('Royal Momentum: a Queen capture grants a Queen-only follow-up (non-capturing at stack 1)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'h1'], ['queen', 'd1']],
      enemy: [['king', 'h8'], ['pawn', 'd5'], ['knight', 'a5'], ['rook', 'g5']],
      upgrades: [['queen_royal_momentum', stacks]],
      config: quiet,
    });
    const s1 = play(encounter(spec(1)), 'd1', 'd5');
    expect(s1.actions).toHaveLength(1);
    expect(s1.actions[0]).toMatchObject({ nonCapturing: true });
    expect(targets(s1, 'd5')).not.toContain('a5');
    let s3 = play(encounter(spec(3)), 'd1', 'd5');
    s3 = play(s3, 'd5', 'a5');
    expect(s3.actions).toHaveLength(1); // stack 3: a second use this turn
    s3 = play(s3, 'a5', 'a8');
    expect(s3.actions).toHaveLength(0);
  });

  it('Tyrant Queen: a lonely Queen gains extra actions', () => {
    const lonely = encounter({ player: [['king', 'h1'], ['queen', 'd1'], ['rook', 'a1'], ['pawn', 'a2']], enemy: [['king', 'h8']], upgrades: [['queen_tyrant', 2]], config: quiet });
    expect(lonely.actions.filter((t) => t.pieceTypes?.includes('queen'))).toHaveLength(2);
    const crowded = encounter({ player: [['king', 'h1'], ['queen', 'd1'], ['rook', 'a1'], ['knight', 'b1']], enemy: [['king', 'h8']], upgrades: ['queen_tyrant'], config: quiet });
    expect(crowded.actions).toHaveLength(1);
  });

  it("Queen's Gambit: a lost ally lets the Queen's next move pierce", () => {
    let s = encounter({
      player: [['king', 'h1'], ['queen', 'a1'], ['pawn', 'a2'], ['knight', 'e4']],
      enemy: [['king', 'h8'], ['rook', 'e8'], ['bishop', 'a6']],
      upgrades: ['queen_gambit'],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    expect(targets(s, 'a1')).not.toContain('a6');
    s = endTurn(withIntents(s, [['e8', 'e4']]));
    expect(at(s, 'a1').counters.gambit).toBe(1);
    expect(targets(s, 'a1')).toContain('a6'); // through the a2 Pawn
    s = play(s, 'a1', 'a6');
    expect(at(s, 'a6').counters.gambit).toBe(0);
  });

  it('War King: longer King steps (+1 per stack) and Wards from King captures', () => {
    const s = encounter({ player: [['king', 'e1'], ['pawn', 'a2']], enemy: [['king', 'e8'], ['pawn', 'e3']], upgrades: ['king_war'], config: quiet });
    const ctx = createGenContext(s);
    const kingMoves = pieceMoves(ctx, s.board[parseSq('e1')]!).map((m) => m.to);
    expect(kingMoves).toContain(parseSq('c3'));
    const after = play(s, 'e1', 'e3');
    expect(at(after, 'e3').wards).toBe(1);
  });

  it('Royal Guard: allies near the King are Warded during the enemy phase (radius 2 at stack 2)', () => {
    const spec = (stacks: number): BoardSpec => ({
      player: [['king', 'e1'], ['pawn', 'e2'], ['knight', 'e3']],
      enemy: [['king', 'h8'], ['rook', 'e7']],
      upgrades: [['king_royal_guard', stacks]],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    const one = endTurn(withIntents(encounter(spec(1)), [['e7', 'e3']]));
    expect(at(one, 'e3').side).toBe('enemy'); // e3 is two squares away at stack 1
    const two = endTurn(withIntents(encounter(spec(2)), [['e7', 'e3']]));
    expect(at(two, 'e3').type).toBe('knight');
  });
});

describe('Enemy debuffs (C8)', () => {
  const base: BoardSpec = {
    player: [['king', 'e1']],
    enemy: [['king', 'e8'], ['pawn', 'a7'], ['pawn', 'b7'], ['pawn', 'c7'], ['rook', 'h8'], ['knight', 'g8']],
    config: { enemyActions: 2, turnLimit: 20 },
  };

  it('Cracked Formation removes enemy Pawns at encounter start (per stack)', () => {
    const s = encounter({ ...base, upgrades: [['debuff_cracked_formation', 2]] });
    expect(Object.values(s.pieces).filter((p) => p.side === 'enemy' && p.type === 'pawn')).toHaveLength(1);
  });

  it('Delayed Reinforcement holds pieces off-board until turn 3', () => {
    let s = encounter({ ...base, upgrades: [['debuff_delayed_reinforcement', 2]] });
    const majors = () => Object.values(s.pieces).filter((p) => p.side === 'enemy' && (p.type === 'rook' || p.type === 'knight'));
    expect(majors()).toHaveLength(0);
    expect(s.arrivals).toHaveLength(2);
    s = endTurn(s);
    expect(majors()).toHaveLength(0);
    s = endTurn(s);
    expect(majors()).toHaveLength(2);
    expect(s.turn).toBe(3);
  });

  it('Slow Command removes one enemy action from the first phase', () => {
    expect(encounter(base).intents).toHaveLength(2);
    expect(encounter({ ...base, upgrades: ['debuff_slow_command'] }).intents).toHaveLength(1);
  });

  it('Royal Curse: the enemy King never plans onto attacked squares', () => {
    const spec: BoardSpec = {
      player: [['king', 'a1'], ['rook', 'd1'], ['rook', 'f1']],
      enemy: [['king', 'e8']],
      upgrades: ['debuff_royal_curse'],
      config: { enemyActions: 1, turnLimit: 20, profile: { kind: 'guard_king' } },
    };
    for (let i = 0; i < 5; i++) {
      const s = encounter({ ...spec, config: { ...spec.config, seed: `curse-${i}` } });
      for (const intent of s.intents) {
        if (intent.pieceType === 'king') expect(['d', 'f'].includes('abcdefgh'[intent.to & 7])).toBe(false);
      }
    }
  });
});
