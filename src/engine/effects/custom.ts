import { between, chebyshev, fileOf, isLightSquare, neighbours, onBoard, rankOf, sqName, sqOf, type Sq } from '../core/coords';
import { isImmobilized } from '../core/draft';
import { PIECE_NAME, PIECE_VALUE, type PieceType } from '../core/pieces';
import type { Piece } from '../core/state';
import { attackedOpponents, createGenContext, pieceAttacks } from '../moves/generate';
import { patchPiece } from '../core/draft';
import type { HookSubscriber } from '../rules/compile';
import { stackedName } from '../rules/num';
import type { Resolver } from '../rules/resolver';
import type { GameEvent } from '../rules/types';
import { addWard, attemptCapture, grantAction, markSquare, pieceLabel, promotePiece, reposition } from './primitives';

/**
 * Named custom effects and predicates — the documented escape hatch of D5 for
 * rules that the declarative DSL cannot express. Every entry is covered by
 * tests (tests/upgrades.*.test.ts) and listed in DESIGN_DECISIONS.md.
 */
export interface CustomEffect {
  doc: string;
  run: (r: Resolver, e: GameEvent, sub: HookSubscriber, params: Record<string, number | string | boolean>) => void;
}

export interface CustomPredicate {
  doc: string;
  test: (r: Resolver, e: GameEvent, sub: HookSubscriber) => boolean;
}

const playerPieces = (r: Resolver, type?: PieceType): Piece[] =>
  Object.values(r.d.pieces).filter((p) => p.side === 'player' && (!type || p.type === type));

const label = (sub: HookSubscriber) => stackedName(sub.name, sub.stacks);

function attacksSquare(state: Resolver['pre'], pieceId: string, sq: Sq): boolean {
  let hit = false;
  pieceAttacks(createGenContext(state), pieceId, (s) => {
    if (s === sq) hit = true;
  });
  return hit;
}

export const CUSTOM_EFFECTS: Record<string, CustomEffect> = {
  chainPromotion: {
    doc: 'Chain Promotion: the N most advanced other player Pawns that can step forward advance 1 square (REPOSITION); a Pawn reaching the promotion rank or a Promotion Square promotes into the same piece as the triggering promotion.',
    run(r, e, sub) {
      const d = r.d;
      const into: PieceType = e.promotedTo ?? 'queen';
      const promoRank = r.rules.promotionRankPlayer;
      const candidates = playerPieces(r, 'pawn')
        .filter((p) => p.id !== e.actorId && !isImmobilized(p) && rankOf(p.sq) < 7)
        .filter((p) => {
          const ahead = p.sq + 8;
          return !d.board[ahead] && !d.terrain[ahead];
        })
        .sort((a, b) => rankOf(b.sq) - rankOf(a.sq) || a.sq - b.sq)
        .slice(0, sub.stacks);
      for (const p of candidates) {
        const ahead = p.sq + 8;
        reposition(r, p.id, ahead, sub.upgradeId, `${label(sub)}: Pawn ${sqName(p.sq)} advances to ${sqName(ahead)}`);
        const promotionSquare = d.marks.some((m) => m.sq === ahead && m.type === 'PROMOTION' && m.side === 'player' && !m.suppressed);
        if (rankOf(ahead) >= promoRank || promotionSquare) promotePiece(r, p.id, into, sub.upgradeId);
      }
    },
  },

  phalanxWards: {
    doc: 'Phalanx: at enemy phase start, player Pawns with a horizontally adjacent allied Pawn (stack 2: or one diagonally behind; stack 3+: any adjacent) gain 1 Ward until the phase ends.',
    run(r, _e, sub) {
      const d = r.d;
      const isPawn = (f: number, rk: number) => {
        if (!onBoard(f, rk)) return false;
        const id = d.board[sqOf(f, rk)];
        return !!id && d.pieces[id].side === 'player' && d.pieces[id].type === 'pawn';
      };
      const warded: string[] = [];
      for (const p of playerPieces(r, 'pawn')) {
        const f = fileOf(p.sq);
        const rk = rankOf(p.sq);
        let ok = isPawn(f - 1, rk) || isPawn(f + 1, rk);
        if (!ok && sub.stacks >= 2) ok = isPawn(f - 1, rk - 1) || isPawn(f + 1, rk - 1);
        if (!ok && sub.stacks >= 3) ok = neighbours(p.sq).some((sq) => isPawn(fileOf(sq), rankOf(sq)));
        if (ok) {
          addWard(r, p.id, 1, sub.upgradeId, { at: 'phaseEnd', turn: d.turn });
          warded.push(sqName(p.sq));
        }
      }
      if (warded.length) r.log('trigger', `${label(sub)}: Pawns ${warded.join(', ')} gain a Ward this phase`, 1);
    },
  },

  swarmTide: {
    doc: 'Swarm Tide: at turn start, grant floor(player Pawns on board / divisor) Pawn-only extra actions, divisor = max(2, 5 − stacks).',
    run(r, _e, sub) {
      const pawns = playerPieces(r, 'pawn').length;
      const divisor = Math.max(2, 5 - sub.stacks);
      const n = Math.floor(pawns / divisor);
      for (let i = 0; i < n; i++) grantAction(r, { source: sub.upgradeId, label: `${label(sub)}: Pawn`, pieceTypes: ['pawn'] });
      if (n > 0) r.log('trigger', `${label(sub)}: ${n} Pawn-only extra action${n > 1 ? 's' : ''} (${pawns} Pawns)`);
    },
  },

  twinBishops: {
    doc: 'Twin Bishops: at encounter start, if player Bishops stand on both square colours, each Bishop gains `stacks` Wards.',
    run(r, _e, sub) {
      const bishops = playerPieces(r, 'bishop');
      const colours = new Set(bishops.map((b) => isLightSquare(b.sq)));
      if (colours.size < 2) return;
      for (const b of bishops) addWard(r, b.id, sub.stacks, sub.upgradeId);
      r.log('trigger', `${label(sub)}: ${bishops.length} Bishops gain ${sub.stacks} Ward${sub.stacks > 1 ? 's' : ''}`);
    },
  },

  diagonalDominion: {
    doc: 'Diagonal Dominion: at turn end, empty squares attacked by 2+ player Bishops (stack 2+: or by any Bishop standing on a Bishop Altar) become Crimson until the next Player Turn starts.',
    run(r, _e, sub) {
      const d = r.d;
      const ctx = createGenContext(d);
      const counts = new Int8Array(64);
      const altar = new Uint8Array(64);
      for (const b of playerPieces(r, 'bishop')) {
        const onAltar = sub.stacks >= 2 && d.marks.some((m) => m.sq === b.sq && m.type === 'BISHOP_ALTAR' && !m.suppressed);
        pieceAttacks(ctx, b.id, (sq) => {
          counts[sq]++;
          if (onAltar) altar[sq] = 1;
        });
      }
      const squares: Sq[] = [];
      for (let sq = 0; sq < 64; sq++) {
        if (d.board[sq] || d.terrain[sq]) continue;
        if (counts[sq] >= 2 || altar[sq]) squares.push(sq);
      }
      for (const sq of squares) markSquare(r, sq, 'CRIMSON', 'player', sub.upgradeId, { at: 'turnStart', turn: d.turn + 1 });
      if (squares.length) r.log('trigger', `${label(sub)}: ${squares.map(sqName).join(', ')} become Crimson`, 1, squares);
    },
  },

  royalFork: {
    doc: 'Royal Fork: after a Knight move that attacks the enemy King and another piece, capture the most valuable other attacked piece (Ward rules apply; the Knight stays).',
    run(r, e, sub) {
      const d = r.d;
      const knight = e.actorId ? d.pieces[e.actorId] : undefined;
      if (!knight) return;
      const victims = (e.attackedIds ?? [])
        .map((id) => d.pieces[id])
        .filter((p): p is Piece => !!p && p.type !== 'king' && p.side !== knight.side)
        .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type] || a.sq - b.sq);
      const victim = victims[0];
      if (!victim) return;
      r.log('trigger', `${label(sub)}: the fork strikes ${pieceLabel(victim)}`, 1, [victim.sq]);
      attemptCapture(r, victim.id, knight.id, sub.upgradeId);
    },
  },

  rookBattery: {
    doc: 'Rook Battery: when a player Rook captures while aligned (same rank/file, nothing between) with another allied Rook, the nearest such Rook gains `stacks` actions usable only by itself.',
    run(r, e, sub) {
      const d = r.d;
      const rook = e.actorId ? d.pieces[e.actorId] : undefined;
      if (!rook) return;
      const aligned = playerPieces(r, 'rook')
        .filter((o) => o.id !== rook.id && (fileOf(o.sq) === fileOf(rook.sq) || rankOf(o.sq) === rankOf(rook.sq)))
        .filter((o) => (between(rook.sq, o.sq) ?? []).every((sq) => !d.board[sq] && !d.terrain[sq]))
        .sort((a, b) => chebyshev(a.sq, rook.sq) - chebyshev(b.sq, rook.sq) || a.sq - b.sq);
      const partner = aligned[0];
      if (!partner) return;
      for (let i = 0; i < sub.stacks; i++) grantAction(r, { source: sub.upgradeId, label: `${label(sub)}: Rook ${sqName(partner.sq)}`, pieceId: partner.id });
      r.log('trigger', `${label(sub)}: Rook ${sqName(partner.sq)} gains ${sub.stacks} extra action${sub.stacks > 1 ? 's' : ''}`, 1, [partner.sq]);
    },
  },

  siegeTrack: {
    doc: 'Siege Engine (turn end): count consecutive turn ends each player Rook attacks each enemy piece; pairs reaching max(1, 3 − stacks) mark the target as besieged.',
    run(r, _e, sub) {
      const d = r.d;
      const required = Math.max(1, 3 - sub.stacks);
      const ctx = createGenContext(d);
      const next: Record<string, number> = {};
      for (const rook of playerPieces(r, 'rook')) {
        for (const targetId of attackedOpponents(ctx, rook.id)) {
          const key = `siege:${rook.id}:${targetId}`;
          next[key] = (d.counters[key] ?? 0) + 1;
        }
      }
      for (const key of Object.keys(d.counters)) if (key.startsWith('siege:')) delete d.counters[key];
      Object.assign(d.counters, next);
      const besieged = new Set<string>();
      for (const [key, n] of Object.entries(next)) {
        if (n < required) continue;
        const [, rookId, targetId] = key.split(':');
        besieged.add(targetId);
        const t = d.pieces[targetId];
        const rk = d.pieces[rookId];
        if (t && rk && !t.counters.besieged) r.log('trigger', `${label(sub)}: Rook ${sqName(rk.sq)} besieges ${pieceLabel(t)} — it falls at your next turn unless it escapes`, 1, [rk.sq, t.sq]);
      }
      for (const p of Object.values(d.pieces)) {
        const want = besieged.has(p.id) ? 1 : 0;
        if ((p.counters.besieged ?? 0) !== want) patchPiece(d, p.id, { counters: { ...p.counters, besieged: want } });
      }
    },
  },

  siegeFire: {
    doc: 'Siege Engine (turn start): every besieged pair whose Rook still attacks its target captures it (the Rook stays; Ward rules apply).',
    run(r, _e, sub) {
      const d = r.d;
      const required = Math.max(1, 3 - sub.stacks);
      const ctx = createGenContext(d);
      for (const [key, n] of Object.entries({ ...d.counters })) {
        if (!key.startsWith('siege:') || n < required) continue;
        const [, rookId, targetId] = key.split(':');
        delete d.counters[key];
        const rook = d.pieces[rookId];
        const target = d.pieces[targetId];
        if (!rook || !target) continue;
        if (!attackedOpponents(ctx, rookId).includes(targetId)) {
          r.log('trigger', `${label(sub)}: the siege of ${pieceLabel(target)} is broken`, 1, [target.sq]);
          continue;
        }
        r.log('trigger', `${label(sub)}: Rook ${sqName(rook.sq)} bombards ${pieceLabel(target)}`, 1, [rook.sq, target.sq]);
        attemptCapture(r, targetId, rookId, sub.upgradeId);
      }
      for (const p of Object.values(d.pieces)) if (p.counters.besieged) patchPiece(d, p.id, { counters: { ...p.counters, besieged: 0 } });
    },
  },

  tyrantQueen: {
    doc: 'Tyrant Queen: at turn start, if the player has a Queen and at most 1 other non-Pawn, non-King piece on the board, grant `stacks` Queen-only actions.',
    run(r, _e, sub) {
      const pieces = playerPieces(r);
      if (!pieces.some((p) => p.type === 'queen')) return;
      const others = pieces.filter((p) => p.type !== 'pawn' && p.type !== 'king').length - 1;
      if (others > 1) return;
      for (let i = 0; i < sub.stacks; i++) grantAction(r, { source: sub.upgradeId, label: `${label(sub)}: Queen`, pieceTypes: ['queen'] });
      r.log('trigger', `${label(sub)}: the lonely Queen gains ${sub.stacks} extra action${sub.stacks > 1 ? 's' : ''}`);
    },
  },

  consumeGambit: {
    doc: "Queen's Gambit: a Queen's stored pierce charges are spent by her next move.",
    run(r, e) {
      const q = e.actorId ? r.d.pieces[e.actorId] : undefined;
      if (q && q.counters.gambit) patchPiece(r.d, q.id, { counters: { ...q.counters, gambit: 0 } });
    },
  },

  royalGuard: {
    doc: 'Royal Guard: at enemy phase start, allied pieces within 1 (stack 2+: 2) squares of the player King gain 1 Ward until the phase ends.',
    run(r, _e, sub) {
      const d = r.d;
      const radius = sub.stacks >= 2 ? 2 : 1;
      const warded: string[] = [];
      for (const king of playerPieces(r, 'king')) {
        for (const p of playerPieces(r)) {
          if (p.id === king.id || chebyshev(p.sq, king.sq) > radius) continue;
          addWard(r, p.id, 1, sub.upgradeId, { at: 'phaseEnd', turn: d.turn });
          warded.push(sqName(p.sq));
        }
      }
      if (warded.length) r.log('trigger', `${label(sub)}: ${warded.join(', ')} gain a Ward this phase`, 1);
    },
  },
};

export const CUSTOM_PREDICATES: Record<string, CustomPredicate> = {
  movedLastTurn: {
    doc: 'Momentum Knight: the acting piece also moved during the previous Player Turn.',
    test: (r, e) => !!e.actorId && r.d.movedLastTurn.includes(e.actorId),
  },
  forkIncludesKing: {
    doc: 'Royal Fork: the fork attacks the opposing King plus at least one other piece.',
    test(r, e) {
      const ids = e.attackedIds ?? [];
      return ids.some((id) => r.d.pieces[id]?.type === 'king') && ids.some((id) => r.d.pieces[id] && r.d.pieces[id].type !== 'king');
    },
  },
  targetAttackedByOtherBishop: {
    doc: 'Bishop Battery: before the capturing move, another allied Bishop also attacked the captured piece’s square.',
    test(r, e) {
      if (e.sq === undefined || !e.actorId) return false;
      const pre = r.pre;
      return Object.values(pre.pieces).some(
        (p) => p.side === 'player' && p.type === 'bishop' && p.id !== e.actorId && attacksSquare(pre, p.id, e.sq!),
      );
    },
  },
};

export function registerCustomEffect(name: string, effect: CustomEffect): void {
  CUSTOM_EFFECTS[name] = effect;
}

export function registerCustomPredicate(name: string, predicate: CustomPredicate): void {
  CUSTOM_PREDICATES[name] = predicate;
}

export const describePieceType = (t: PieceType): string => PIECE_NAME[t];
