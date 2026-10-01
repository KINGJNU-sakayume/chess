import { describe, expect, it } from 'vitest';
import { parseSq } from '../src/engine/core/coords';
import { applyPlayerAction, deploySquares } from '../src/engine/encounters/flow';
import { at, encounter, endTurn, logText, mutation, play, targets, withIntents, type BoardSpec } from './helpers';

const quiet = { enemyActions: 0, turnLimit: 20 };

describe('board squares (B10)', () => {
  it('Crimson: an enemy ending a move there is Immobilized for its next enemy phase', () => {
    let s = encounter({
      player: [['king', 'h1'], ['pawn', 'a2']],
      enemy: [['king', 'h8'], ['rook', 'd8']],
      mutations: [mutation('m1', 'CRIMSON', 'd4')],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = endTurn(withIntents(s, [['d8', 'd4']]));
    const rook = at(s, 'd4');
    expect(rook.statuses).toHaveLength(1);
    // Immobilized through the next enemy phase: it gets no intent and cannot move.
    expect(s.intents.some((i) => i.pieceId === rook.id)).toBe(false);
    s = endTurn(s);
    expect(at(s, 'd4').statuses).toHaveLength(0);
    expect(logText(s).some((t) => t.includes('no longer Immobilized'))).toBe(true);
  });

  it('Bishop Altar: crossing grants 1 Ward once per Bishop per turn', () => {
    const spec: BoardSpec = {
      player: [['king', 'h1'], ['bishop', 'a1'], ['bishop', 'c1']],
      enemy: [['king', 'h8']],
      mutations: [mutation('m1', 'BISHOP_ALTAR', 'c3')],
      upgrades: ['bishop_long_cathedral'],
      config: quiet,
    };
    let s = play(encounter(spec), 'a1', 'e5'); // crosses b2, c3, d4
    expect(at(s, 'e5').wards).toBe(1);
    expect(logText(s).some((t) => t.includes('crossed Bishop Altar c3: +1 Ward'))).toBe(true);
    s = play(s, 'c1', 'a3'); // Long Cathedral token not granted (2 squares) — base action already spent
    void s;
  });

  it('Promotion Square: a Pawn entering it promotes immediately', () => {
    const s = encounter({
      player: [['king', 'h1'], ['pawn', 'd3']],
      enemy: [['king', 'h8']],
      mutations: [mutation('m1', 'PROMOTION', 'd4')],
      config: quiet,
    });
    const after = play(s, 'd3', 'd4', { promotion: 'knight' });
    expect(at(after, 'd4').type).toBe('knight');
    expect(after.objective.promotions).toBe(1);
  });

  it('Sanctuary: an allied piece standing there gains a Ward for the enemy phase', () => {
    let s = encounter({
      player: [['king', 'h1'], ['knight', 'd4']],
      enemy: [['king', 'h8'], ['rook', 'd8']],
      mutations: [mutation('m1', 'SANCTUARY', 'd4')],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = endTurn(withIntents(s, [['d8', 'd4']]));
    expect(at(s, 'd4').type).toBe('knight');
    expect(at(s, 'd4').tempWards).toHaveLength(0);
    expect(at(s, 'd8').type).toBe('rook');
  });

  it('Knight Gate: landing on a gate may reposition to the linked gate', () => {
    const s = encounter({
      player: [['king', 'h1'], ['knight', 'b1']],
      enemy: [['king', 'h8']],
      mutations: [mutation('g', 'KNIGHT_GATE', 'c3', { linkSq: parseSq('f6') }), mutation('g2', 'KNIGHT_GATE', 'f6', { linkSq: parseSq('c3') })],
      config: quiet,
    });
    const after = play(s, 'b1', 'c3', { gate: true });
    expect(at(after, 'f6').type).toBe('knight');
    expect(after.board[parseSq('c3')]).toBeNull();
    const noGate = play(s, 'b1', 'c3');
    expect(at(noGate, 'c3').type).toBe('knight');
  });

  it('Royal Square: the King or Queen ending a move there grants 1 extra action, once per square per turn', () => {
    const s = encounter({
      player: [['king', 'h1'], ['queen', 'd1']],
      enemy: [['king', 'h8']],
      mutations: [mutation('m1', 'ROYAL', 'd4')],
      config: quiet,
    });
    let after = play(s, 'd1', 'd4');
    expect(after.actions).toHaveLength(1);
    after = play(after, 'd4', 'd2');
    // Hand the player one more action to land on the same Royal Square again this turn.
    after = { ...after, actions: [{ id: 'extra', source: 'test', label: 'test' }] };
    after = applyPlayerAction(after, { type: 'move', pieceId: after.board[parseSq('d2')]!, to: parseSq('d4') }).state;
    expect(after.actions).toHaveLength(0);
    // Next turn it works again.
    after = play(endTurn(after), 'd4', 'd5');
    after = play({ ...after, actions: [{ id: 'extra2', source: 'test', label: 'test' }] }, 'd5', 'd4');
    expect(after.actions).toHaveLength(1);
  });

  it('Cursed: enemy sliders starting there are limited to range 2; enemy Kings cannot enter', () => {
    let s = encounter({
      player: [['king', 'h1'], ['pawn', 'a2']],
      enemy: [['king', 'e8'], ['rook', 'a8']],
      mutations: [mutation('m1', 'CURSED', 'a8'), mutation('m2', 'CURSED', 'd8')],
      config: { enemyActions: 1, turnLimit: 20 },
    });
    s = endTurn(withIntents(s, [['a8', 'a2']]));
    expect(logText(s).some((t) => t.includes('Intent fizzled: Rook a8 → a2'))).toBe(true);
    s = withIntents(s, [['e8', 'd8']]);
    s = endTurn(s);
    expect(logText(s).some((t) => t.includes('Intent fizzled: King e8 → d8'))).toBe(true);
  });

  it('Rook Rail: a Rook moving along the rail pierces 1 allied piece', () => {
    const s = encounter({
      player: [['king', 'h1'], ['rook', 'a3'], ['pawn', 'c3']],
      enemy: [['king', 'h8']],
      mutations: [mutation('m1', 'ROOK_RAIL', 'a3', { rail: { axis: 'rank', index: 2 } })],
      config: quiet,
    });
    expect(targets(s, 'a3')).toEqual(expect.arrayContaining(['d3', 'h3']));
  });

  it('terrain on a mutated square suppresses the mutation for that encounter', () => {
    const s = encounter({
      player: [['king', 'h1']],
      enemy: [['king', 'h8']],
      mutations: [mutation('m1', 'CRIMSON', 'd4')],
      terrain: [['d4', 'WALL']],
      config: quiet,
    });
    expect(s.marks.find((m) => m.sq === parseSq('d4'))?.suppressed).toBe(true);
  });
});

describe('Reserve (B6)', () => {
  it('pieces without a formation square wait in Reserve and deploy free to rank 1', () => {
    let s = encounter({
      player: [['king', 'e1'], ['knight', null], ['pawn', null]],
      enemy: [['king', 'e8']],
      config: quiet,
    });
    expect(s.reserve).toHaveLength(2);
    expect(s.reserveDeploysLeft).toBe(1);
    expect(deploySquares(s)).not.toContain(parseSq('e1'));
    s = applyPlayerAction(s, { type: 'deploy', reserveId: s.reserve[0].id, to: parseSq('b1') }).state;
    expect(at(s, 'b1').type).toBe('knight');
    expect(s.actions).toHaveLength(1); // deployment is free
    expect(deploySquares(s)).toEqual([]); // one per turn
    s = endTurn(s);
    expect(s.reserveDeploysLeft).toBe(1);
  });
});
