import { describe, expect, it } from 'vitest';
import { CARDS, cardById, conflictsWith } from '../src/engine/augments/cards';
import { compileRules, rollOffer } from '../src/engine/augments/draft';
import { Position, START_FEN } from '../src/engine/game/position';
import { Rng } from '../src/engine/rng';
import { findMove } from '../src/engine/game/notation';
import {
  ARCHBISHOP,
  BLACK,
  CHANCELLOR,
  F_FROZEN,
  F_SHIELD,
  KING,
  KNIGHT,
  M_CAPTURE,
  PAWN,
  QUEEN,
  T_TRAP_W,
  T_WALL,
  WHITE,
  WIN_BREAKTHROUGH,
  WIN_HILL,
  WIN_KING_CAPTURE,
  WIN_THREE_CHECK,
  movePromo,
  parseSquare as sq,
  type Color,
} from '../src/engine/game/types';

/** Position with the given passive cards for each side. */
function setup(fen: string, white: string[] = [], black: string[] = []): Position {
  return Position.fromFen(fen, [compileRules(white), compileRules(black)]);
}
const targetsOf = (pos: Position, from: string) =>
  pos
    .moves()
    .filter((m) => (m & 63) === sq(from))
    .map((m) => (m >> 6) & 63)
    .sort((a, b) => a - b);
const play = (pos: Position, from: string, to: string, promo = 0) => {
  const m = findMove(pos, sq(from), sq(to), promo);
  if (m === null) throw new Error(`no move ${from}${to}`);
  pos.makeMove(m);
  return m;
};

describe('card catalogue', () => {
  it('has unique ids, Korean names and tier coverage', () => {
    const ids = new Set(CARDS.map((c) => c.id));
    expect(ids.size).toBe(CARDS.length);
    for (const tier of ['silver', 'gold', 'prism']) expect(CARDS.filter((c) => c.tier === tier).length).toBeGreaterThanOrEqual(6);
    for (const c of CARDS) {
      expect(c.name).toMatch(/[가-힣]/);
      expect(c.text).toMatch(/[가-힣]/);
      if (c.kind === 'active') {
        expect(c.targets && c.apply).toBeTruthy();
        expect(c.uses).toBeGreaterThan(0);
      }
    }
  });

  it('offers three distinct, unowned, offerable cards', () => {
    const pos = Position.fromFen(START_FEN);
    for (let i = 0; i < 30; i++) {
      const offer = rollOffer({ pos, color: WHITE, owned: ['camel_knight'], seed: `s${i}`, round: 1, tier: 'silver', rerollIndex: 0 });
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      expect(offer).not.toContain('camel_knight');
      for (const id of offer) expect(cardById(id).tier).toBe('silver');
    }
    // Conflicting cards are never offered.
    for (let i = 0; i < 40; i++) {
      for (const tier of ['gold', 'prism'] as const) {
        const offer = rollOffer({ pos, color: WHITE, owned: ['breakthrough', 'cavalry_order'], seed: `c${i}`, round: 2, tier, rerollIndex: 0 });
        expect(offer).not.toContain('early_promotion');
        expect(offer).not.toContain('ordain');
      }
      const prism = rollOffer({ pos, color: WHITE, owned: ['early_promotion'], seed: `d${i}`, round: 2, tier: 'prism', rerollIndex: 0 });
      expect(prism).not.toContain('breakthrough');
    }
    expect(conflictsWith('early_promotion', ['breakthrough'])).toBe(true);
    expect(conflictsWith('breakthrough', ['early_promotion'])).toBe(true);
    expect(conflictsWith('ordain', ['camel_knight'])).toBe(false);
    // Mass conscription needs empty pawn squares; never offered at the start.
    for (let i = 0; i < 30; i++) {
      expect(rollOffer({ pos, color: WHITE, owned: [], seed: `p${i}`, round: 1, tier: 'prism', rerollIndex: 0 })).not.toContain(
        'mass_conscription',
      );
    }
  });
});

describe('movement augments', () => {
  it('camel knight adds (3,1) leaps', () => {
    const plain = setup('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1');
    const camel = setup('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', ['camel_knight']);
    expect(targetsOf(plain, 'd4')).toHaveLength(8);
    expect(targetsOf(camel, 'd4')).toEqual(expect.arrayContaining([sq('e7'), sq('g5'), sq('a5'), sq('c1')]));
    // Eight knight leaps plus seven camel leaps (e1 holds the own King).
    expect(targetsOf(camel, 'd4').length).toBe(8 + 7);
  });

  it('bishop step and rook step', () => {
    const b = setup('4k3/8/8/8/3B4/8/8/4K3 w - - 0 1', ['bishop_step']);
    expect(targetsOf(b, 'd4')).toEqual(expect.arrayContaining([sq('d5'), sq('e4'), sq('d3'), sq('c4')]));
    const r = setup('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', ['rook_step']);
    expect(targetsOf(r, 'd4')).toEqual(expect.arrayContaining([sq('e5'), sq('c5'), sq('e3'), sq('c3')]));
  });

  it('amazon queen leaps like a knight and is seen by attack detection', () => {
    const pos = setup('4k3/8/8/8/8/8/8/3QK3 w - - 0 1', ['amazon']);
    expect(targetsOf(pos, 'd1')).toEqual(expect.arrayContaining([sq('c3'), sq('e3'), sq('b2'), sq('f2')]));
    expect(pos.isAttacked(sq('c3'), WHITE)).toBe(true);
    const plain = setup('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    expect(plain.isAttacked(sq('c3'), WHITE)).toBe(false);
  });

  it('warrior king moves two squares unless blocked', () => {
    const pos = setup('4k3/8/8/8/8/8/8/4K3 w - - 0 1', ['warrior_king']);
    expect(targetsOf(pos, 'e1')).toEqual(expect.arrayContaining([sq('e3'), sq('c3'), sq('g3'), sq('c1'), sq('g1')]));
    const blocked = setup('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ['warrior_king']);
    expect(targetsOf(blocked, 'e1')).not.toContain(sq('e3'));
  });

  it('pawn augments: sidestep, charge, pike, retreat', () => {
    const pos = setup('4k3/8/8/3p4/3P4/8/8/4K3 w - - 0 1', ['pawn_sidestep', 'pawn_pike']);
    expect(targetsOf(pos, 'd4')).toEqual([sq('c4'), sq('e4'), sq('d5')]);
    const charge = setup('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1', ['pawn_charge']);
    expect(targetsOf(charge, 'd4')).toEqual([sq('d5'), sq('d6')]);
    const retreat = setup('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1', ['pawn_retreat']);
    expect(targetsOf(retreat, 'd4')).toEqual([sq('d3'), sq('d5')]);
    const home = setup('4k3/8/8/8/8/8/3P4/4K3 w - - 0 1', ['pawn_retreat']);
    expect(targetsOf(home, 'd2')).not.toContain(sq('d1'));
  });

  it('sidestep pawns capture sideways and retreating pawns capture diagonally backwards', () => {
    const side = setup('4k3/8/8/8/2nPb3/8/8/4K3 w - - 0 1', ['pawn_sidestep']);
    expect(targetsOf(side, 'd4')).toEqual([sq('c4'), sq('e4'), sq('d5')]);
    expect(side.isAttacked(sq('c4'), WHITE)).toBe(true);
    const plain = setup('4k3/8/8/8/2nPb3/8/8/4K3 w - - 0 1');
    expect(plain.isAttacked(sq('c4'), WHITE)).toBe(false);
    const back = setup('4k3/8/8/3P4/2n1b3/8/8/4K3 w - - 0 1', ['pawn_retreat']);
    expect(targetsOf(back, 'd5')).toEqual([sq('c4'), sq('d4'), sq('e4'), sq('d6')]);
    expect(back.isAttacked(sq('e4'), WHITE)).toBe(true);
    // Never back onto the first rank.
    const home = setup('4k3/8/8/8/8/8/3P4/2n1K3 w - - 0 1', ['pawn_retreat']);
    expect(targetsOf(home, 'd2')).not.toContain(sq('c1'));
    expect(home.isAttacked(sq('c1'), WHITE)).toBe(false);
    // Black pawns mirror it.
    const black = setup('4k3/8/8/2N1B3/3p4/8/8/4K3 b - - 0 1', [], ['pawn_retreat']);
    expect(targetsOf(black, 'd4')).toEqual(expect.arrayContaining([sq('c5'), sq('e5'), sq('d5')]));
  });

  it('breakthrough pawns also capture straight ahead', () => {
    const pos = setup('4k3/8/8/3n4/3P4/8/8/4K3 w - - 0 1', ['breakthrough']);
    expect(targetsOf(pos, 'd4')).toContain(sq('d5'));
  });

  it('move generation and attack detection agree under every movement augment', () => {
    const sets = [
      ['pawn_sidestep', 'pawn_retreat', 'pawn_pike'],
      ['camel_knight', 'bishop_step', 'rook_step', 'amazon'],
      ['warrior_king', 'pawn_charge', 'pawn_retreat'],
      ['bishop_step', 'rook_step', 'pawn_sidestep'],
    ];
    const rng = Rng.fromSeed('consistency');
    for (let game = 0; game < 24; game++) {
      const pos = setup(START_FEN, sets[game % sets.length], sets[(game + 1) % sets.length]);
      if (game % 3 === 0) {
        // Fairy pieces too.
        pos.setPiece(sq('c1'), ARCHBISHOP);
        pos.setPiece(sq('a8'), CHANCELLOR | (BLACK << 4));
        pos.commit();
        pos.refresh();
      }
      for (let ply = 0; ply < 60 && pos.winner < 0; ply++) {
        const us = pos.side as Color;
        const moves = pos.moves();
        if (!moves.length) break;
        const captured = new Set(moves.filter((m) => m & M_CAPTURE).map((m) => (m >> 6) & 63));
        for (let t = 0; t < 64; t++) {
          const c = pos.board[t];
          if (c === 0 || c >> 4 === us) continue;
          expect(pos.isAttacked(t, us), `${pos.toFen()} ${t}`).toBe(captured.has(t));
        }
        pos.makeMove(moves[rng.int(moves.length)]);
      }
    }
  });

  it('early promotion promotes on the sixth rank', () => {
    const early = setup('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1', ['early_promotion']);
    expect(early.moves().filter((m) => (m & 63) === sq('d5') && movePromo(m))).toHaveLength(4);
    const plain = setup('4k3/8/8/3P4/8/8/8/4K3 w - - 0 1');
    expect(plain.moves().filter((m) => movePromo(m))).toHaveLength(0);
  });

  it('bishop step and rook step also reach archbishops and chancellors', () => {
    const a = setup('4k3/8/8/8/3A4/8/8/4K3 w - - 0 1', ['bishop_step']);
    expect(targetsOf(a, 'd4')).toEqual(expect.arrayContaining([sq('d5'), sq('e4'), sq('d3'), sq('c4')]));
    expect(a.isAttacked(sq('d5'), WHITE)).toBe(true);
    const plainA = setup('4k3/8/8/8/3A4/8/8/4K3 w - - 0 1');
    expect(targetsOf(plainA, 'd4')).not.toContain(sq('d5'));
    const c = setup('4k3/8/8/8/3C4/8/8/4K3 w - - 0 1', ['rook_step']);
    expect(targetsOf(c, 'd4')).toEqual(expect.arrayContaining([sq('e5'), sq('c5'), sq('e3'), sq('c3')]));
    expect(c.isAttacked(sq('e5'), WHITE)).toBe(true);
  });
});

describe('shields, traps, martyrs and walls', () => {
  it('a shield makes the attacker bounce', () => {
    const pos = setup('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1');
    pos.setFlags(sq('d5'), F_SHIELD);
    play(pos, 'd1', 'd5');
    expect(pos.board[sq('d1')] & 15).toBe(QUEEN);
    expect(pos.board[sq('d5')] & 15).toBe(PAWN);
    expect(pos.flags[sq('d5')] & F_SHIELD).toBe(0);
    pos.unmakeMove();
    expect(pos.flags[sq('d5')] & F_SHIELD).toBe(F_SHIELD);
  });

  it('a shielded King survives one capture', () => {
    const pos = setup('4k3/8/8/8/8/8/8/r3K3 b - - 0 1');
    pos.setFlags(sq('e1'), F_SHIELD);
    play(pos, 'a1', 'e1');
    expect(pos.winner).toBe(-1);
    expect(pos.kingSq[WHITE]).toBe(sq('e1'));
  });

  it('capturing the King wins', () => {
    const pos = setup('4k3/8/8/8/8/8/8/r3K3 b - - 0 1');
    play(pos, 'a1', 'e1');
    expect(pos.winner).toBe(BLACK);
    expect(pos.winReason).toBe(WIN_KING_CAPTURE);
  });

  it('traps destroy enemy pieces but only disarm for Kings', () => {
    const pos = setup('4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
    pos.setTerrain(sq('e7'), T_TRAP_W);
    play(pos, 'e8', 'e7');
    expect(pos.kingSq[BLACK]).toBe(sq('e7'));
    expect(pos.terrain[sq('e7')]).toBe(0);
    const p2 = setup('4k3/8/8/8/8/8/3n4/4K3 b - - 0 1');
    p2.setTerrain(sq('c4'), T_TRAP_W);
    play(p2, 'd2', 'c4');
    expect(p2.board[sq('c4')]).toBe(0);
    expect(p2.lost[BLACK * 16 + KNIGHT]).toBe(1);
  });

  it('martyr pawns take their capturer with them', () => {
    const pos = setup('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', [], ['martyr_pawns']);
    play(pos, 'd1', 'd5');
    expect(pos.board[sq('d5')]).toBe(0);
    expect(pos.lost[WHITE * 16 + QUEEN]).toBe(1);
    // The King is immune.
    const k = setup('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1', [], ['martyr_pawns']);
    play(k, 'e1', 'd2');
    expect(k.kingSq[WHITE]).toBe(sq('d2'));
  });

  it('walls block sliders and can be broken', () => {
    const pos = setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    pos.setTerrain(sq('a4'), T_WALL);
    const t = targetsOf(pos, 'a1');
    expect(t).toContain(sq('a4'));
    expect(t).not.toContain(sq('a5'));
    expect(pos.isAttacked(sq('a6'), WHITE)).toBe(false);
    play(pos, 'a1', 'a4');
    expect(pos.terrain[sq('a4')]).toBe(0);
  });

  it('knight oath shields a capturing knight', () => {
    const pos = setup('4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1', ['knight_oath']);
    play(pos, 'e3', 'd5');
    expect(pos.flags[sq('d5')] & F_SHIELD).toBe(F_SHIELD);
  });

  it('pawn grit shields a capturing pawn, even when it promotes', () => {
    const pos = setup('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', ['pawn_grit']);
    play(pos, 'e4', 'd5');
    expect(pos.flags[sq('d5')] & F_SHIELD).toBe(F_SHIELD);
    pos.unmakeMove();
    play(pos, 'e4', 'e5');
    expect(pos.flags[sq('e5')] & F_SHIELD).toBe(0);
    const promo = setup('3rk3/4P3/8/8/8/8/8/4K3 w - - 0 1', ['pawn_grit']);
    play(promo, 'e7', 'd8', QUEEN);
    expect(promo.flags[sq('d8')] & F_SHIELD).toBe(F_SHIELD);
  });

  it('thorns freeze an attacker that bounces off a shield until its next turn is over', () => {
    const pos = setup('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', [], ['thorns']);
    pos.setFlags(sq('d5'), F_SHIELD);
    play(pos, 'd1', 'd5');
    expect(pos.board[sq('d1')] & 15).toBe(QUEEN);
    expect(pos.flags[sq('d1')] & F_FROZEN).toBe(F_FROZEN);
    // While frozen, the queen neither guards nor threatens.
    expect(pos.isAttacked(sq('d4'), WHITE)).toBe(false);
    play(pos, 'e8', 'f8');
    expect(targetsOf(pos, 'd1')).toEqual([]);
    play(pos, 'e1', 'e2');
    expect(pos.flags[sq('d1')] & F_FROZEN).toBe(0);
    pos.unmakeMove();
    pos.unmakeMove();
    pos.unmakeMove();
    expect(pos.flags[sq('d1')]).toBe(0);
    expect(pos.flags[sq('d5')] & F_SHIELD).toBe(F_SHIELD);
    // Without thorns the attacker just bounces; a King is never frozen.
    const plain = setup('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1');
    plain.setFlags(sq('d5'), F_SHIELD);
    play(plain, 'd1', 'd5');
    expect(plain.flags[sq('d1')] & F_FROZEN).toBe(0);
    const king = setup('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1', [], ['thorns']);
    king.setFlags(sq('d2'), F_SHIELD);
    play(king, 'e1', 'd2');
    expect(king.flags[sq('e1')] & F_FROZEN).toBe(0);
  });

  it('frozen pieces cannot move or attack, and thaw after their turn', () => {
    const pos = setup('4k3/8/8/8/8/8/3r4/4K3 b - - 0 1');
    pos.setFlags(sq('d2'), F_FROZEN);
    expect(targetsOf(pos, 'd2')).toEqual([]);
    expect(pos.isAttacked(sq('e2'), BLACK)).toBe(false);
    play(pos, 'e8', 'f8');
    expect(pos.flags[sq('d2')] & F_FROZEN).toBe(0);
    pos.unmakeMove();
    expect(pos.flags[sq('d2')] & F_FROZEN).toBe(F_FROZEN);
  });
});

describe('victory augments', () => {
  it('king of the hill wins once the King survives the opponent\'s turn on the hill', () => {
    const pos = setup('4k3/8/8/8/8/4K3/8/8 w - - 0 1', ['king_of_the_hill']);
    play(pos, 'e3', 'e4');
    expect(pos.winner).toBe(-1);
    play(pos, 'e8', 'd8');
    expect(pos.winner).toBe(WHITE);
    expect(pos.winReason).toBe(WIN_HILL);
    pos.unmakeMove();
    expect(pos.winner).toBe(-1);
  });

  it('a King on the hill can still be captured, unless it is shielded', () => {
    const pos = setup('3rk3/8/8/8/8/4K3/8/8 w - - 0 1', ['king_of_the_hill']);
    play(pos, 'e3', 'd4');
    play(pos, 'd8', 'd4');
    expect(pos.winner).toBe(BLACK);
    expect(pos.winReason).toBe(WIN_KING_CAPTURE);
    const shielded = setup('3rk3/8/8/8/8/4K3/8/8 w - - 0 1', ['king_of_the_hill']);
    shielded.setFlags(sq('e3'), F_SHIELD);
    play(shielded, 'e3', 'd4');
    play(shielded, 'd8', 'd4');
    expect(shielded.winner).toBe(WHITE);
    expect(shielded.winReason).toBe(WIN_HILL);
  });

  it('a null move cannot hide a King on the hill', () => {
    const pos = setup('4k3/8/8/8/3K4/8/8/8 b - - 0 1', ['king_of_the_hill']);
    pos.makeNullMove();
    expect(pos.winner).toBe(WHITE);
  });

  it('three checks', () => {
    const pos = setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['three_check']);
    play(pos, 'a1', 'a8');
    expect(pos.checks[WHITE]).toBe(1);
    play(pos, 'e8', 'e7');
    play(pos, 'a8', 'a7');
    expect(pos.checks[WHITE]).toBe(2);
    play(pos, 'e7', 'e6');
    play(pos, 'a7', 'a6');
    expect(pos.winner).toBe(WHITE);
    expect(pos.winReason).toBe(WIN_THREE_CHECK);
  });

  it('coronation crowns a pawn in the enemy half; the queen waits a turn and does not win by breakthrough', () => {
    const pos = setup('4k3/8/8/3P4/4P3/8/2P5/4K3 w - - 0 1', ['breakthrough']);
    const def = cardById('coronation');
    expect(def.kind).toBe('active');
    expect(def.targets!(pos, WHITE)).toEqual([sq('d5')]);
    def.apply!(pos, WHITE, sq('d5'));
    expect(pos.board[sq('d5')] & 15).toBe(QUEEN);
    expect(pos.flags[sq('d5')] & F_FROZEN).toBe(F_FROZEN);
    expect(pos.winner).toBe(-1);
    expect(targetsOf(pos, 'd5')).toEqual([]);
    const black = setup('4k3/8/8/8/8/3p4/8/4K3 b - - 0 1');
    expect(def.targets!(black, BLACK)).toEqual([sq('d3')]);
  });

  it('breakthrough wins on promotion', () => {
    const pos = setup('4k3/3P4/8/8/8/8/8/4K3 w - - 0 1', ['breakthrough']);
    play(pos, 'd7', 'd8', QUEEN);
    expect(pos.winner).toBe(WHITE);
    expect(pos.winReason).toBe(WIN_BREAKTHROUGH);
  });
});

describe('active cards', () => {
  const use = (pos: Position, id: string, color: Color, at: string) => {
    const def = cardById(id);
    expect(def.targets!(pos, color)).toContain(sq(at));
    def.apply!(pos, color, sq(at));
  };

  it('summon, snipe, promote, freeze and revive', () => {
    const pos = Position.fromFen('4k3/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQ - 0 1');
    use(pos, 'reinforce', WHITE, 'a2');
    expect(pos.board[sq('a2')]).toBe(PAWN);
    use(pos, 'sniper', WHITE, 'd7');
    expect(pos.board[sq('d7')]).toBe(0);
    use(pos, 'ordain', WHITE, 'c1');
    expect(pos.board[sq('c1')] & 15).toBe(ARCHBISHOP);
    use(pos, 'appoint', WHITE, 'a1');
    expect(pos.board[sq('a1')] & 15).toBe(CHANCELLOR);
    use(pos, 'freeze', WHITE, 'e7');
    expect(pos.flags[sq('e7')] & F_FROZEN).toBe(F_FROZEN);
    expect(cardById('freeze').targets!(pos, WHITE)).not.toContain(sq('e8'));
    const lost = Position.fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(cardById('resurrect').targets!(lost, WHITE)).toEqual([]);
    lost.addLost(WHITE, KNIGHT);
    lost.addLost(WHITE, QUEEN);
    use(lost, 'resurrect', WHITE, 'b1');
    expect(lost.board[sq('b1')] & 15).toBe(KNIGHT);
    use(lost, 'revival', WHITE, 'd1');
    expect(lost.board[sq('d1')] & 15).toBe(QUEEN);
  });

  it('knighting, shield breaker, demotion and the ice age', () => {
    const pos = Position.fromFen('r1b1k2r/pppp1ppp/2n5/4n3/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1');
    use(pos, 'knighting', WHITE, 'e2');
    expect(pos.board[sq('e2')] & 15).toBe(KNIGHT);
    expect(pos.flags[sq('e2')] & F_FROZEN).toBe(F_FROZEN);
    // Shield breaker: only shielded, non-king enemy pieces.
    expect(cardById('shield_breaker').targets!(pos, WHITE)).toEqual([]);
    pos.setFlags(sq('c6'), F_SHIELD);
    pos.setFlags(sq('e8'), F_SHIELD);
    expect(cardById('shield_breaker').targets!(pos, WHITE)).toEqual([sq('c6')]);
    use(pos, 'shield_breaker', WHITE, 'c6');
    expect(pos.flags[sq('c6')] & F_SHIELD).toBe(0);
    // Demotion: knights and bishops off the owner's back rank; a shield breaks first.
    const t = cardById('demote').targets!(pos, WHITE);
    expect(t).toEqual(expect.arrayContaining([sq('c6'), sq('e5')]));
    expect(t).not.toContain(sq('c8'));
    pos.setFlags(sq('e5'), F_SHIELD);
    use(pos, 'demote', WHITE, 'e5');
    expect(pos.board[sq('e5')] & 15).toBe(KNIGHT);
    expect(pos.flags[sq('e5')] & F_SHIELD).toBe(0);
    use(pos, 'demote', WHITE, 'c6');
    expect(pos.board[sq('c6')]).toBe(PAWN | (BLACK << 4));
    // Ice age: every enemy piece but the King and pawns freezes for one turn.
    expect(cardById('ice_age').targets!(pos, WHITE)).toEqual([sq('e8')]);
    use(pos, 'ice_age', WHITE, 'e8');
    for (const s of ['a8', 'c8', 'h8', 'e5']) expect(pos.flags[sq(s)] & F_FROZEN).toBe(F_FROZEN);
    for (const s of ['e8', 'a7', 'c6']) expect(pos.flags[sq(s)] & F_FROZEN).toBe(0);
    pos.commit();
    pos.side = BLACK;
    pos.refresh();
    expect(pos.moves().every((m) => [KING, PAWN].includes(pos.board[m & 63] & 15))).toBe(true);
  });

  it('revival brings the piece back shielded', () => {
    const pos = Position.fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    pos.addLost(WHITE, QUEEN);
    use(pos, 'revival', WHITE, 'd1');
    expect(pos.board[sq('d1')] & 15).toBe(QUEEN);
    expect(pos.flags[sq('d1')] & (F_SHIELD | F_FROZEN)).toBe(F_SHIELD | F_FROZEN);
  });

  it('acquisition effects', () => {
    const pos = Position.fromFen(START_FEN);
    cardById('royal_guard').onAcquire!(pos, WHITE);
    expect(pos.flags[sq('d1')] & F_SHIELD).toBe(F_SHIELD);
    expect(pos.flags[sq('e2')] & F_SHIELD).toBe(F_SHIELD);
    expect(pos.flags[sq('e1')] & F_SHIELD).toBe(0);
    cardById('royal_aegis').onAcquire!(pos, WHITE);
    expect(pos.flags[sq('e1')] & F_SHIELD).toBe(F_SHIELD);
    cardById('cavalry_order').onAcquire!(pos, BLACK);
    expect(pos.board[sq('c8')] & 15).toBe(ARCHBISHOP);
    expect(pos.board[sq('f8')] & 15).toBe(ARCHBISHOP);
    expect(pos.board[sq('e8')] & 15).toBe(KING);
  });
});
