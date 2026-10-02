import { sqOf } from '../../engine/core/coords';
import { patchPiece } from '../../engine/core/draft';
import type { BossDef } from '../../engine/encounters/bossTypes';
import type { EncounterTemplate, TemplateContext, TemplateOutput } from '../../engine/encounters/templates';
import { Placer } from '../encounters/helpers';

/**
 * THE TYRANT QUEEN (Act II boss). The enemy Queen plans a chain of sequential
 * intents every phase (one on turn 1, two on turn 2, then three), all
 * visible; the rest of her court shares one. She starts with 3 Wards, and
 * every time one of her routes breaks she stumbles and loses one.
 * Objective: dethrone her. Counterplay: read her route, block or bait a step
 * (the rest of the route collapses), and be waiting where she stops.
 */
function layout(ctx: TemplateContext, mirrored: boolean): TemplateOutput {
  const P = new Placer(ctx);
  const f = (file: number) => (mirrored ? 7 - file : file);
  const at = (file: number, rank: number) => sqOf(f(file), rank);
  P.put('queen', at(3, 7), ['boss', 'target'], 3);
  P.put('king', at(4, 7));
  P.put('rook', at(0, 7));
  P.put('rook', at(7, 7));
  P.put('bishop', at(2, 7));
  P.put('knight', at(6, 7));
  // Her court hems her in: only the d-file is open, so her first routes start short and predictable.
  for (const file of [1, 2, 4, 5, 6]) P.put('pawn', at(file, 6));
  P.put('pawn', at(3, 4));
  return {
    name: 'The Tyrant Queen',
    objective: { type: 'ELIMINATION', label: 'Dethrone the Tyrant Queen within 12 turns. Break her routes to shatter her Wards.' },
    turnLimit: 12,
    enemyActions: 1,
    profile: { kind: 'aggressive' },
    enemies: P.enemies,
    terrain: P.terrain,
    waves: [],
    bossId: 'tyrant_queen',
  };
}

export const TYRANT_QUEEN_TEMPLATE: EncounterTemplate = {
  id: 'tyrant_queen',
  name: 'The Tyrant Queen',
  objective: 'ELIMINATION',
  blurb: 'A Queen whose routes chain three moves per phase.',
  acts: [2],
  weight: 0,
  generate: (ctx) => layout(ctx, ctx.rng.chance(0.5)),
  safe: (ctx) => layout(ctx, false),
};

export const TYRANT_QUEEN: BossDef = {
  id: 'tyrant_queen',
  name: 'The Tyrant Queen',
  title: 'Act II Boss',
  description:
    'The enemy Queen plans a route of chained intents every phase (one on turn 1, two on turn 2, then three), all visible. Her court shares a single intent. She starts with 3 Wards: block or bait any step and the rest of her route collapses, and she stumbles and loses a Ward. Capture her to win.',
  hooks: {},
  multiIntent: { tag: 'boss', count: 3, ramp: true },
  // Break her route and she stumbles: the Ward shatters.
  onStepFailed: (r, intent) => {
    const queen = r.d.pieces[intent.pieceId];
    if (!queen?.tags.includes('boss') || queen.wards === 0) return;
    patchPiece(r.d, queen.id, { wards: queen.wards - 1 });
    r.log('enemy', 'The Tyrant Queen stumbles on a broken route — her Ward shatters', 0, [queen.sq]);
  },
};
