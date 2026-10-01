import { describe, expect, it } from 'vitest';
import type { EncounterState, Intent } from '../src/engine/core/state';
import { applyPlayerAction, endTurn } from '../src/engine/encounters/flow';
import { createEncounter } from '../src/engine/encounters/setup';
import { affordableMoves, createGenContext } from '../src/engine/moves/generate';
import { at, deepFreeze, encounter, setupOf, sq } from './helpers';

function withIntent(s: EncounterState, from: string, to: string): EncounterState {
  const id = s.board[sq(from)]!;
  const p = s.pieces[id];
  const victimId = s.board[sq(to)];
  const intent: Intent = {
    id: 'test-intent',
    kind: 'move',
    pieceId: id,
    pieceType: p.type,
    from: sq(from),
    to: sq(to),
    expectedTargetId: victimId ?? undefined,
    expectedTargetType: victimId ? s.pieces[victimId].type : undefined,
  };
  return { ...s, intents: [intent] };
}

const move = (s: EncounterState, from: string, to: string) =>
  applyPlayerAction(s, { type: 'move', pieceId: s.board[sq(from)]!, to: sq(to) }).state;

const lastLogs = (s: EncounterState, n = 12) => s.log.slice(-n).map((l) => l.text);

const BASE = {
  player: [
    ['king', 'e1'],
    ['pawn', 'a2'],
    ['rook', 'h1'],
    ['knight', 'b1'],
  ] as const,
  enemy: [
    ['king', 'e8'],
    ['rook', 'a8'],
  ] as const,
};

function base(extraPlayer: [string, string][] = []) {
  return encounter({
    player: [...BASE.player.map(([t, s]) => [t, s] as [never, string]), ...(extraPlayer as [never, string][])],
    enemy: BASE.enemy.map(([t, s]) => [t, s] as [never, string]),
    config: { turnLimit: 10, enemyActions: 1 },
  });
}

describe('turn structure', () => {
  it('starts on turn 1 with one action and planned intents', () => {
    const s = base();
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('player');
    expect(s.actions).toHaveLength(1);
    expect(s.intents.length).toBeLessThanOrEqual(1);
  });

  it('spends the action; no further moves until End Turn', () => {
    const s = move(base(), 'a2', 'a3');
    expect(s.actions).toHaveLength(0);
    expect(affordableMoves(createGenContext(s))).toHaveLength(0);
    const next = endTurn(s).state;
    expect(next.turn).toBe(2);
    expect(next.actions).toHaveLength(1);
  });

  it('never mutates its input (undo snapshots stay valid)', () => {
    const s0 = deepFreeze(base());
    const s1 = deepFreeze(move(s0, 'a2', 'a4'));
    const s2 = deepFreeze(endTurn(s1).state);
    expect(at(s0, 'a2').type).toBe('pawn');
    expect(at(s1, 'a4').type).toBe('pawn');
    expect(s2.turn).toBe(2);
  });

  it('is deterministic for identical setups', () => {
    const a = endTurn(move(base(), 'a2', 'a3')).state;
    const b = endTurn(move(base(), 'a2', 'a3')).state;
    expect(JSON.stringify(a.intents)).toBe(JSON.stringify(b.intents));
    expect(JSON.stringify(a.board)).toBe(JSON.stringify(b.board));
  });
});

describe('intent resolution', () => {
  it('executes: the rook captures the pawn on its destination', () => {
    const s = withIntent(base(), 'a8', 'a2');
    const after = endTurn(s).state;
    expect(at(after, 'a2').type).toBe('rook');
    expect(at(after, 'a2').side).toBe('enemy');
    expect(after.captured.some((c) => c.piece.type === 'pawn')).toBe(true);
  });

  it('dodge: the target moves away and the intent lands on an empty square', () => {
    const s = withIntent(base([['knight', 'a5']]), 'a8', 'a5');
    const after = endTurn(move(s, 'a5', 'b3')).state;
    expect(at(after, 'a5')).toMatchObject({ type: 'rook', side: 'enemy' });
    expect(after.captured).toHaveLength(0);
    expect(at(after, 'b3').type).toBe('knight');
  });

  it('a blocking pawn advance makes the intent fizzle', () => {
    const s = withIntent(base(), 'a8', 'a2');
    const after = endTurn(move(s, 'a2', 'a3')).state;
    expect(lastLogs(after, 30).some((t) => t.includes('Intent fizzled') && t.includes('path blocked'))).toBe(true);
    expect(at(after, 'a3').side).toBe('player');
  });

  it('fizzles when the path is blocked', () => {
    const s = withIntent(base([['bishop', 'c2']]), 'a8', 'a2');
    // Knight b1 → a3 interposes on the a-file.
    const after = endTurn(move(s, 'b1', 'a3')).state;
    expect(lastLogs(after, 30).some((t) => t.includes('Intent fizzled: Rook a8 → a2 — path blocked'))).toBe(true);
    expect(at(after, 'a2').side).toBe('player');
    expect(after.stats.fizzles).toBe(1);
  });

  it('fizzles when the intending piece was captured', () => {
    const s = withIntent(
      encounter({
        player: [
          ['king', 'e1'],
          ['pawn', 'a2'],
          ['rook', 'h8'],
        ],
        enemy: [
          ['king', 'e7'],
          ['rook', 'a8'],
        ],
      }),
      'a8',
      'a2',
    );
    const after = endTurn(move(s, 'h8', 'a8')).state;
    expect(lastLogs(after, 30).some((t) => t.includes('piece captured'))).toBe(true);
    expect(at(after, 'a2').type).toBe('pawn');
  });

  it('fizzles when the intending piece is immobilized', () => {
    const s0 = withIntent(base(), 'a8', 'a2');
    const rookId = s0.board[sq('a8')]!;
    const rook = s0.pieces[rookId];
    const s = {
      ...s0,
      pieces: { ...s0.pieces, [rookId]: { ...rook, statuses: [{ type: 'IMMOBILIZED' as const, expires: { at: 'phaseEnd' as const, turn: 1 }, source: 'test' }] } },
    };
    const after = endTurn(s).state;
    expect(lastLogs(after, 30).some((t) => t.includes('piece immobilized'))).toBe(true);
    // The status ticks down at the end of the phase.
    expect(at(after, 'a8').statuses).toHaveLength(0);
  });

  it('bait: whatever stands on the destination is captured', () => {
    const s = withIntent(base(), 'a8', 'a3');
    const after = endTurn(move(s, 'b1', 'a3')).state;
    expect(at(after, 'a3').side).toBe('enemy');
    expect(after.captured.some((c) => c.piece.type === 'knight')).toBe(true);
  });

  it('a Ward blocks the capture: attacker stays, Ward is consumed', () => {
    const s0 = withIntent(base(), 'a8', 'a2');
    const pawnId = s0.board[sq('a2')]!;
    const s = { ...s0, pieces: { ...s0.pieces, [pawnId]: { ...s0.pieces[pawnId], wards: 1 } } };
    const after = endTurn(s).state;
    expect(at(after, 'a8').type).toBe('rook');
    expect(at(after, 'a2').wards).toBe(0);
    expect(after.stats.wardsBlocked).toBe(1);
    expect(lastLogs(after, 30).some((t) => t.includes('Ward blocks'))).toBe(true);
  });
});

describe('objectives', () => {
  it('ASSASSINATION: capturing the enemy King wins immediately', () => {
    const s = encounter({
      player: [
        ['king', 'e1'],
        ['rook', 'e2'],
      ],
      enemy: [['king', 'e8']],
    });
    const after = move(s, 'e2', 'e8');
    expect(after.outcome?.result).toBe('won');
  });

  it('losing the King loses the encounter', () => {
    const s = withIntent(
      encounter({
        player: [['king', 'e1']],
        enemy: [
          ['king', 'h8'],
          ['rook', 'e8'],
        ],
      }),
      'e8',
      'e1',
    );
    const after = endTurn(s).state;
    expect(after.outcome).toMatchObject({ result: 'lost', reason: 'your King was captured' });
  });

  it('turn limit: the encounter is lost when T player turns pass', () => {
    let s = encounter({
      player: [
        ['king', 'a1'],
        ['pawn', 'h2'],
      ],
      enemy: [['king', 'h8']],
      config: { turnLimit: 2, enemyActions: 0 },
    });
    s = endTurn(s).state;
    expect(s.outcome).toBeNull();
    s = endTurn(s).state;
    expect(s.outcome).toMatchObject({ result: 'lost' });
  });

  it('SURVIVAL: surviving T enemy phases wins', () => {
    let s = encounter({
      player: [['king', 'a1']],
      enemy: [['knight', 'h8']],
      config: { objective: { type: 'SURVIVAL' }, turnLimit: 2, enemyActions: 0 },
    });
    s = endTurn(s).state;
    expect(s.outcome).toBeNull();
    s = endTurn(s).state;
    expect(s.outcome).toMatchObject({ result: 'won' });
  });

  it('ELIMINATION: capturing every marked target wins', () => {
    const s = encounter({
      player: [
        ['king', 'a1'],
        ['rook', 'c1'],
      ],
      enemy: [
        ['knight', 'c6', ['target']],
        ['pawn', 'g5'],
      ],
      config: { objective: { type: 'ELIMINATION' }, enemyActions: 0 },
    });
    expect(move(s, 'c1', 'c6').outcome?.result).toBe('won');
  });

  it('the setup pipeline never starts an encounter already decided', () => {
    const s = createEncounter(
      setupOf({
        player: [['king', 'e1']],
        enemy: [['king', 'e8']],
      }),
    );
    expect(s.outcome).toBeNull();
  });
});

describe('castling and en passant (player)', () => {
  it('castles with an unmoved King and Rook and empty squares between', () => {
    const s = encounter({
      player: [
        ['king', 'e1'],
        ['rook', 'h1'],
      ],
      enemy: [
        ['king', 'e8'],
        ['rook', 'f8'],
      ],
    });
    // f1 is attacked by the enemy rook: castling through it is still legal (king-capture mode).
    const after = applyPlayerAction(s, { type: 'move', pieceId: s.board[sq('e1')]!, to: sq('g1') }).state;
    expect(at(after, 'g1').type).toBe('king');
    expect(at(after, 'f1').type).toBe('rook');
  });

  it('captures en passant after an enemy double step', () => {
    let s = withIntent(
      encounter({
        player: [
          ['king', 'e1'],
          ['pawn', 'e5'],
        ],
        enemy: [
          ['king', 'h8'],
          ['pawn', 'd7'],
        ],
      }),
      'd7',
      'd5',
    );
    s = endTurn(s).state;
    expect(s.enPassant).not.toBeNull();
    const after = move(s, 'e5', 'd6');
    expect(after.captured.some((c) => c.piece.type === 'pawn' && c.piece.side === 'enemy')).toBe(true);
  });
});
