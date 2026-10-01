import { chebyshev, fileOf, neighbours, sqName, sqOf, type Sq } from '../../engine/core/coords';
import type { BossDef } from '../../engine/encounters/bossTypes';
import type { EncounterTemplate, TemplateContext, TemplateOutput } from '../../engine/encounters/templates';
import { markSquare } from '../../engine/effects/primitives';
import { Rng, deriveStream } from '../../engine/rng/rng';
import type { Resolver } from '../../engine/rules/resolver';
import { Placer } from '../encounters/helpers';

/**
 * THE FORTRESS KING (Act I boss). Starts behind walls with dense defenders.
 * Every 3 turns it raises 2 Sanctuary squares for the enemy near its King,
 * telegraphed one turn ahead. Counterplay: deny the squares, strike before
 * the Ward lands, or bring two attackers in one turn.
 */

const TELEGRAPH_ID = 'fortress-sanctuary';

function layout(ctx: TemplateContext, mirrored: boolean): TemplateOutput {
  const P = new Placer(ctx);
  const f = (file: number) => (mirrored ? 7 - file : file);
  const at = (file: number, rank: number) => sqOf(f(file), rank);
  P.put('king', at(6, 7), ['boss']);
  P.put('rook', at(5, 7));
  P.put('knight', at(4, 6));
  P.put('bishop', at(2, 7));
  // A two-pawn shield: the long diagonal toward the King stays contestable.
  for (const [file, rank] of [
    [6, 6],
    [7, 6],
    [3, 5],
  ] as const) {
    P.put('pawn', at(file, rank));
  }
  if (ctx.act > 1) P.put('rook', at(2, 7));
  // The rampart: walls with gaps, so there are several ways in.
  for (const [file, rank] of [
    [5, 4],
    [1, 5],
  ] as const) {
    P.wall(at(file, rank));
  }
  return {
    name: 'The Fortress King',
    objective: { type: 'ASSASSINATION', label: 'Capture the Fortress King within 11 turns. Every 3 turns it raises Sanctuaries.' },
    turnLimit: 11,
    enemyActions: 1,
    profile: { kind: 'guard_king' },
    enemies: P.enemies,
    terrain: P.terrain,
    waves: [],
    bossId: 'fortress_king',
  };
}

export const FORTRESS_KING_TEMPLATE: EncounterTemplate = {
  id: 'fortress_king',
  name: 'The Fortress King',
  objective: 'ASSASSINATION',
  blurb: 'A King behind walls who raises Sanctuaries.',
  acts: [1],
  weight: 0,
  generate: (ctx) => layout(ctx, ctx.rng.chance(0.5)),
  safe: (ctx) => layout(ctx, false),
};

function sanctuarySquares(r: Resolver): Sq[] {
  const d = r.d;
  const king = Object.values(d.pieces).find((p) => p.side === 'enemy' && p.tags.includes('boss'));
  if (!king) return [];
  const taken = new Set(d.marks.filter((m) => m.type === 'ENEMY_SANCTUARY').map((m) => m.sq));
  const candidates = [king.sq, ...neighbours(king.sq, 2)]
    .filter((sq) => !d.terrain[sq] && !taken.has(sq))
    .filter((sq) => {
      const id = d.board[sq];
      return !id || d.pieces[id].side === 'enemy';
    })
    .sort((a, b) => chebyshev(a, king.sq) - chebyshev(b, king.sq) || Math.abs(fileOf(a) - 3.5) - Math.abs(fileOf(b) - 3.5) || a - b);
  const rng = new Rng(deriveStream(d.config.seed, `fortress-${d.turn}`));
  const near = candidates.slice(0, 6);
  return rng.shuffle(near).slice(0, 2);
}

export const FORTRESS_KING: BossDef = {
  id: 'fortress_king',
  name: 'The Fortress King',
  title: 'Act I Boss',
  description:
    'Starts behind walls with dense defenders. Every 3 turns it raises 2 Sanctuary squares near itself (announced a turn ahead): an enemy piece standing on one at the start of your turn gains a Ward for that turn. A Sanctuary crumbles once its Ward blocks a capture.',
  hooks: {
    phaseEnd(r) {
      const d = r.d;
      const pending = d.telegraphs.find((t) => t.id === TELEGRAPH_ID);
      if (pending && pending.inPhases <= 0) {
        for (const sq of pending.squares) markSquare(r, sq, 'ENEMY_SANCTUARY', 'enemy', 'boss:fortress_king');
        d.telegraphs = d.telegraphs.filter((t) => t.id !== TELEGRAPH_ID);
        r.log('enemy', `The Fortress King raises Sanctuaries on ${pending.squares.map(sqName).join(' and ')}`, 0, pending.squares);
        return;
      }
      if (!pending && d.turn % 3 === 2) {
        const squares = sanctuarySquares(r);
        if (!squares.length) return;
        d.telegraphs = [
          ...d.telegraphs,
          { id: TELEGRAPH_ID, kind: 'zone', label: 'Fortress King raises 2 Sanctuaries after your next turn', inPhases: 0, squares },
        ];
        r.log('enemy', `The Fortress King prepares Sanctuaries on ${squares.map(sqName).join(' and ')}`, 0, squares);
      }
    },
  },
};
