import { fileOf, sqName, sqOf, type Sq } from '../../engine/core/coords';
import { patchPiece } from '../../engine/core/draft';
import type { BossDef } from '../../engine/encounters/bossTypes';
import type { EncounterTemplate, TemplateContext, TemplateOutput } from '../../engine/encounters/templates';
import { spawnPiece } from '../../engine/effects/primitives';
import { deriveStream, Rng } from '../../engine/rng/rng';
import type { Resolver } from '../../engine/rules/resolver';
import { Placer } from '../encounters/helpers';

/**
 * THE PAWN EMPEROR (Act III, final boss). Spawns 1–2 Pawns on rank 7 every
 * phase (telegraphed one phase ahead) and counts down to a mass promotion that
 * turns every enemy Pawn into a Queen. Capture the Emperor before the sea of
 * Pawns becomes a sea of Queens.
 */
const SPAWN = 'emperor-spawn';
const COUNTDOWN = 'emperor-countdown';
const MASS_PROMOTION_EVERY = 8;

function layout(ctx: TemplateContext): TemplateOutput {
  const P = new Placer(ctx);
  // A full court behind an unbroken wall of Pawns.
  const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'] as const;
  back.forEach((type, file) => (type === 'king' ? P.put('king', sqOf(file, 7), ['boss'], 1) : P.put(type, sqOf(file, 7))));
  for (let file = 0; file < 8; file++) P.put('pawn', sqOf(file, 6));
  for (const file of [2, 5]) P.put('pawn', sqOf(file, 5));
  return {
    name: 'The Pawn Emperor',
    objective: { type: 'ASSASSINATION', label: 'Capture the Pawn Emperor within 12 turns. Pawns spawn every phase; at 0 the countdown promotes them all.' },
    turnLimit: 12,
    enemyActions: 2,
    profile: { kind: 'guard_king' },
    enemies: P.enemies,
    terrain: [],
    waves: [],
    bossId: 'pawn_emperor',
  };
}

export const PAWN_EMPEROR_TEMPLATE: EncounterTemplate = {
  id: 'pawn_emperor',
  name: 'The Pawn Emperor',
  objective: 'ASSASSINATION',
  blurb: 'An endless tide of Pawns and a countdown to mass promotion.',
  acts: [3],
  weight: 0,
  generate: (ctx) => layout(ctx),
  safe: (ctx) => layout(ctx),
};

function chooseSpawns(r: Resolver): Sq[] {
  const d = r.d;
  const freeOn = (rank: number) => {
    const out: Sq[] = [];
    for (let f = 0; f < 8; f++) {
      const sq = sqOf(f, rank);
      if (!d.board[sq] && !d.terrain[sq]) out.push(sq);
    }
    return out;
  };
  // Rank 7 first; when it is full the tide spills onto rank 6.
  const free = freeOn(6).length ? freeOn(6) : freeOn(5);
  const rng = new Rng(deriveStream(d.config.seed, `emperor-spawn-${d.turn}`));
  const n = rng.chance(0.5) ? 2 : 1;
  return rng.shuffle(free).slice(0, n).sort((a, b) => fileOf(a) - fileOf(b));
}

function setTelegraphs(r: Resolver, spawns: Sq[]) {
  const d = r.d;
  const countdown = d.counters[COUNTDOWN] ?? MASS_PROMOTION_EVERY;
  d.telegraphs = [
    ...d.telegraphs.filter((t) => t.id !== SPAWN && t.id !== COUNTDOWN),
    ...(spawns.length ? [{ id: SPAWN, kind: 'spawn' as const, label: `Pawns spawn after your turn`, inPhases: 0, squares: spawns }] : []),
    { id: COUNTDOWN, kind: 'countdown' as const, label: `Mass promotion in ${countdown} phase${countdown === 1 ? '' : 's'}`, inPhases: countdown - 1, squares: [] },
  ];
}

export const PAWN_EMPEROR: BossDef = {
  id: 'pawn_emperor',
  name: 'The Pawn Emperor',
  title: 'Final Boss',
  description:
    'A full court behind a wall of Pawns; the Emperor starts with 1 Ward. Spawns 1–2 Pawns on rank 7 every enemy phase (shown a turn ahead) and counts down to a mass promotion: when it reaches 0, every enemy Pawn becomes a Queen. Capture the Emperor first.',
  hooks: {
    setup(r) {
      r.d.counters[COUNTDOWN] = MASS_PROMOTION_EVERY;
      setTelegraphs(r, chooseSpawns(r));
    },
    reinforcements(r) {
      const d = r.d;
      const t = d.telegraphs.find((x) => x.id === SPAWN);
      if (!t) return;
      const placed: Sq[] = [];
      for (const sq of t.squares) {
        if (spawnPiece(r, { type: 'pawn', side: 'enemy', sq }, 'boss:pawn_emperor')) placed.push(sq);
      }
      if (placed.length) r.log('enemy', `The Pawn Emperor summons Pawns on ${placed.map(sqName).join(', ')}`, 0, placed);
      r.frame();
    },
    phaseEnd(r) {
      const d = r.d;
      const next = (d.counters[COUNTDOWN] ?? MASS_PROMOTION_EVERY) - 1;
      if (next <= 0) {
        const pawns = Object.values(d.pieces).filter((p) => p.side === 'enemy' && p.type === 'pawn');
        for (const p of pawns) patchPiece(d, p.id, { type: 'queen', promotedFrom: 'pawn' });
        r.log('enemy', `MASS PROMOTION — ${pawns.length} enemy Pawns become Queens`, 0, pawns.map((p) => p.sq));
        d.counters[COUNTDOWN] = MASS_PROMOTION_EVERY;
      } else {
        d.counters[COUNTDOWN] = next;
      }
      setTelegraphs(r, chooseSpawns(r));
    },
  },
};
