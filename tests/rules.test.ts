import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/engine/core/coords';
import { registerCustomEffect } from '../src/engine/effects/custom';
import { addWard, attemptCapture, grantAction, immobilize, markSquare, reposition, spawnPiece } from '../src/engine/effects/primitives';
import { affordableMoves, createGenContext, pickToken, pieceMoves, tokenAllows } from '../src/engine/moves/generate';
import { registerUpgradeForTests } from '../src/engine/rules/registry';
import { CASCADE_LIMIT, Resolver } from '../src/engine/rules/resolver';
import type { UpgradeDef } from '../src/engine/rules/types';
import { at, encounter, endTurn, logText, mutation, play, targets } from './helpers';

const quiet = { enemyActions: 0, turnLimit: 20 };
const basic = () =>
  encounter({
    player: [['king', 'e1'], ['knight', 'b1'], ['bishop', 'c1'], ['pawn', 'a2']],
    enemy: [['king', 'e8'], ['pawn', 'a7']],
    config: quiet,
  });

function probe(id: string, priority: number, label: string): UpgradeDef {
  return {
    id,
    name: label,
    rarity: 'common',
    category: 'piece',
    tags: ['test'],
    stackable: true,
    prerequisites: [],
    primitives: [],
    affects: [],
    hooks: [{ event: 'onTurnStart', priority, effects: [{ type: 'ADD_COUNTER', counter: 'order', amount: 1, label }] }],
    describe: () => label,
  };
}

describe('effect primitives in isolation', () => {
  it('EXTRA_ACTION tokens honour their restrictions and the most restrictive token pays', () => {
    const s = basic();
    const r = new Resolver(s);
    const knightId = s.board[parseSq('b1')]!;
    grantAction(r, { source: 't', label: 'knight only', pieceTypes: ['knight'] });
    grantAction(r, { source: 't', label: 'this piece', pieceId: knightId, nonCapturing: true });
    const st = r.result();
    const m = affordableMoves(createGenContext(st), knightId).find((mv) => mv.to === parseSq('c3'))!;
    expect(pickToken(st.actions, m)?.label).toBe('this piece');
    const pawnMove = affordableMoves(createGenContext(st), st.board[parseSq('a2')]!)[0];
    expect(st.actions.filter((t) => tokenAllows(t, pawnMove)).map((t) => t.label)).toEqual(['Action']);
  });

  it('WARD and STATUS', () => {
    const s = basic();
    const r = new Resolver(s);
    const pawn = s.board[parseSq('a7')]!;
    addWard(r, pawn, 2, 'test');
    immobilize(r, pawn, 1, 'test');
    expect(attemptCapture(r, pawn, null, 'test')).toBe(false);
    const st = r.result();
    expect(st.pieces[pawn].wards).toBe(1);
    expect(st.pieces[pawn].statuses[0]).toMatchObject({ type: 'IMMOBILIZED', expires: { at: 'phaseEnd', turn: 1 } });
  });

  it('MARK_SQUARE, SPAWN and REPOSITION', () => {
    const s = basic();
    const r = new Resolver(s);
    markSquare(r, parseSq('d5'), 'CRIMSON', 'player', 'test', { at: 'turnEnd', turn: 1 });
    const spawned = spawnPiece(r, { type: 'rook', side: 'player', sq: parseSq('h3') }, 'test');
    expect(spawned).not.toBeNull();
    expect(reposition(r, s.board[parseSq('b1')]!, parseSq('b3'), 'test')).toBe(true);
    expect(reposition(r, s.board[parseSq('c1')]!, parseSq('b3'), 'test')).toBe(false); // occupied
    r.drain();
    const st = r.result();
    expect(st.marks.some((m) => m.type === 'CRIMSON' && m.sq === parseSq('d5'))).toBe(true);
    expect(at(st, 'h3').type).toBe('rook');
    expect(at(st, 'b3').type).toBe('knight');
  });

  it('RESTRICT_ENEMY: Heavy Queen limits enemy Queen range (via its debuff rule)', () => {
    registerUpgradeForTests({
      id: 'test_heavy_queen',
      name: 'Heavy Queen',
      rarity: 'uncommon',
      category: 'debuff',
      tags: ['enemy_debuff'],
      stackable: true,
      prerequisites: [],
      primitives: ['RESTRICT_ENEMY'],
      affects: [],
      debuff: 'heavyQueen',
      describe: () => 'test',
    });
    const s = encounter({ player: [['king', 'h1']], enemy: [['king', 'h8'], ['queen', 'a8']], upgrades: [['test_heavy_queen', 2]], config: quiet });
    const qId = s.board[parseSq('a8')]!;
    const distances = pieceMoves(createGenContext(s), qId).map((m) => m.distance);
    expect(Math.max(...distances)).toBe(3);
  });
});

describe('deterministic trigger ordering (D4)', () => {
  it('resolves by priority, then acquisition order, then id', () => {
    registerUpgradeForTests(probe('test_b', 0, 'second'));
    registerUpgradeForTests(probe('test_a', 0, 'first'));
    registerUpgradeForTests(probe('test_c', -1, 'zeroth'));
    registerUpgradeForTests(probe('test_d', 0, 'third'));
    const s = encounter({
      player: [['king', 'e1']],
      enemy: [['king', 'e8']],
      // acquisition order: test_b (0), test_a (0) — tie broken by id; test_c has a lower priority; test_d acquired later.
      upgrades: [['test_b', 1], ['test_a', 1], ['test_d', 1], ['test_c', 1]],
      config: quiet,
    });
    const lines = logText(s).filter((t) => /^(zeroth|first|second|third):/.test(t));
    expect(lines.map((t) => t.split(':')[0])).toEqual(['zeroth', 'second', 'first', 'third']);
  });

  it('effects that trigger further events queue them behind current items (breadth-first)', () => {
    // Altar crossing (built-in) resolves on onSquareCrossed before onPieceMove hooks (Long Cathedral).
    const s = encounter({
      player: [['king', 'h1'], ['bishop', 'a1'], ['bishop', 'h2']],
      enemy: [['king', 'a8']],
      mutations: [mutation('m', 'BISHOP_ALTAR', 'b2')],
      upgrades: ['bishop_long_cathedral'],
      config: quiet,
    });
    const after = play(s, 'a1', 'e5');
    const log = logText(after);
    const altar = log.findIndex((t) => t.includes('Bishop Altar'));
    const lc = log.findIndex((t) => t.startsWith('Long Cathedral'));
    expect(altar).toBeGreaterThan(-1);
    expect(lc).toBeGreaterThan(altar);
  });
});

describe('re-entrancy guard (D4)', () => {
  it(`halts a runaway cascade after ${CASCADE_LIMIT} events and logs it`, () => {
    registerCustomEffect('testLoop', {
      doc: 'test: re-emits the altar event forever',
      run(r, e) {
        r.emit({ type: 'onAltarActivated', actorId: e.actorId, actorType: 'bishop', side: 'player', sq: e.sq });
      },
    });
    registerUpgradeForTests({
      id: 'test_loop',
      name: 'Loop',
      rarity: 'common',
      category: 'piece',
      tags: ['test'],
      stackable: false,
      prerequisites: [],
      primitives: [],
      affects: [],
      hooks: [{ event: 'onAltarActivated', effects: [{ type: 'CUSTOM', name: 'testLoop' }] }],
      describe: () => 'loops',
    });
    const s = encounter({
      player: [['king', 'h1'], ['bishop', 'a1']],
      enemy: [['king', 'a8']],
      mutations: [mutation('m', 'BISHOP_ALTAR', 'b2')],
      upgrades: ['test_loop'],
      config: quiet,
    });
    const after = play(s, 'a1', 'c3');
    expect(logText(after)).toContain('Cascade limit reached — remaining triggers skipped');
    // The action itself still completed and the game continues.
    expect(at(after, 'c3').type).toBe('bishop');
    expect(endTurn(after).turn).toBe(2);
    expect(targets(endTurn(after), 'c3').length).toBeGreaterThan(0);
  });
});
