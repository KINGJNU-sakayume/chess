import { fileOf, isLightSquare, neighbours, onBoard, rankOf, sqName, sqOf, type Sq } from '../core/coords';
import { isImmobilized } from '../core/draft';
import { PIECE_NAME, type PieceType } from '../core/pieces';
import type { Piece } from '../core/state';
import { createGenContext, pieceAttacks } from '../moves/generate';
import type { HookSubscriber } from '../rules/compile';
import { stackedName } from '../rules/num';
import type { Resolver } from '../rules/resolver';
import type { GameEvent } from '../rules/types';
import { addWard, grantAction, markSquare, promotePiece, reposition } from './primitives';

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
};

export const CUSTOM_PREDICATES: Record<string, CustomPredicate> = {
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
