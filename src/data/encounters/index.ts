import { fileOf, parseSq, sqOf, type Sq } from '../../engine/core/coords';
import type { PieceType } from '../../engine/core/pieces';
import type { ReinforcementWave } from '../../engine/core/state';
import type { EncounterTemplate, TemplateContext, TemplateOutput } from '../../engine/encounters/templates';
import { actTuning } from '../acts';
import { clampFile, nearFiles, Placer, turnLimitFor } from './helpers';

/**
 * Encounter templates. Every template is an open tactical problem: several
 * plausible approaches, never a single intended line (B5).
 */

const baseActions = (ctx: TemplateContext): number => {
  const [lo, hi] = actTuning(ctx.act).enemyActions;
  return lo === hi ? lo : ctx.difficulty > 0.5 ? hi : lo;
};

const pick = <T,>(ctx: TemplateContext, items: T[]): T => ctx.rng.pick(items);

function minorPiece(ctx: TemplateContext): PieceType {
  return ctx.rng.chance(0.5) ? 'knight' : 'bishop';
}

// ---------------------------------------------------------------------------
// ASSASSINATION — Skirmish
// ---------------------------------------------------------------------------

const skirmish: EncounterTemplate = {
  id: 'skirmish',
  name: 'Skirmish',
  objective: 'ASSASSINATION',
  blurb: 'Capture the enemy King.',
  acts: [1, 2, 3],
  weight: 3,
  generate(ctx) {
    const P = new Placer(ctx);
    const kingFile = ctx.rng.range(2, 5);
    const kingRank = ctx.rng.chance(0.7) ? 7 : 6;
    P.put('king', sqOf(kingFile, kingRank));
    const pawnCount = [0, ctx.rng.range(2, 4), ctx.rng.range(3, 5), ctx.rng.range(4, 6)][ctx.act];
    const pawnSquares = P.region(nearFiles(kingFile, 3), [kingRank - 2, kingRank - 1]);
    for (let i = 0; i < pawnCount; i++) P.putIn('pawn', pawnSquares);
    const minors = [0, ctx.rng.range(1, 2), 2, ctx.rng.range(2, 3)][ctx.act];
    for (let i = 0; i < minors; i++) P.putIn(minorPiece(ctx), P.region([0, 7], [5, 7]));
    if (ctx.act >= 2 || ctx.difficulty > 0.6) P.putIn('rook', P.region([0, 7], [6, 7]));
    if (ctx.act >= 3 && ctx.rng.chance(0.6)) P.putIn('queen', P.region([0, 7], [6, 7]));
    if (ctx.rng.chance(actTuning(ctx.act).terrainChance)) P.scatterRubble(ctx.rng.range(2, 3));
    return {
      name: 'Skirmish',
      objective: { type: 'ASSASSINATION' },
      turnLimit: turnLimitFor(ctx, actTuning(ctx.act).turnLimit),
      enemyActions: baseActions(ctx),
      profile: { kind: 'guard_king' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    P.put('king', parseSq('e8'));
    for (const s of ['d7', 'f7', 'g6']) P.put('pawn', parseSq(s));
    P.put('knight', parseSq('c6'));
    if (ctx.act >= 2) P.put('rook', parseSq('h8'));
    if (ctx.act >= 3) P.put('bishop', parseSq('f8'));
    return {
      name: 'Skirmish',
      objective: { type: 'ASSASSINATION' },
      turnLimit: actTuning(ctx.act).turnLimit[1] + 1,
      enemyActions: actTuning(ctx.act).enemyActions[0],
      profile: { kind: 'guard_king' },
      enemies: P.enemies,
      terrain: [],
      waves: [],
    };
  },
};

// ---------------------------------------------------------------------------
// SIEGE — Fortress (Assassination behind fortifications)
// ---------------------------------------------------------------------------

const fortress: EncounterTemplate = {
  id: 'fortress',
  name: 'Fortress',
  objective: 'ASSASSINATION',
  blurb: 'Break the walls, capture the King.',
  acts: [1, 2, 3],
  weight: 2,
  generate(ctx) {
    const P = new Placer(ctx);
    const kingFile = pick(ctx, [1, 2, 5, 6]);
    P.put('king', sqOf(kingFile, 7));
    // Pawn shield in front of the King.
    const shieldCount = [0, ctx.rng.range(2, 3), ctx.rng.range(3, 4), ctx.rng.range(4, 5)][ctx.act];
    const shield = P.region(nearFiles(kingFile, 1), [6, 6]);
    for (let i = 0; i < shieldCount; i++) P.putIn('pawn', shield.length ? shield : P.region(nearFiles(kingFile, 2), [5, 6]));
    // Major defenders.
    const majors = [0, ctx.rng.range(1, 2), ctx.rng.range(2, 3), 3][ctx.act];
    const majorTypes: PieceType[] = ctx.act >= 3 ? ['rook', 'bishop', 'knight', 'queen'] : ['rook', 'bishop', 'knight'];
    for (let i = 0; i < majors; i++) P.putIn(pick(ctx, majorTypes), P.region(nearFiles(kingFile, 3), [5, 7]));
    // Walls: a broken rampart on rank 6 or 5 that leaves gaps.
    if (ctx.act >= 2 || ctx.rng.chance(0.6)) {
      const wallRank = ctx.rng.chance(0.5) ? 5 : 4;
      const files = [clampFile(kingFile - 2), clampFile(kingFile + 2), clampFile(kingFile - 1), clampFile(kingFile + 1)];
      const wallCount = ctx.rng.range(2, 3);
      for (const f of ctx.rng.shuffle(files).slice(0, wallCount)) P.wall(sqOf(f, wallRank));
    }
    return {
      name: 'Fortress',
      objective: { type: 'ASSASSINATION' },
      turnLimit: turnLimitFor(ctx, actTuning(ctx.act).turnLimit, 1),
      enemyActions: baseActions(ctx),
      profile: { kind: 'guard_king' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    P.put('king', parseSq('g8'));
    for (const s of ['f7', 'h7']) P.put('pawn', parseSq(s));
    P.put('rook', parseSq('f8'));
    P.wall(parseSq('e6'));
    P.wall(parseSq('h5'));
    if (ctx.act >= 2) P.put('knight', parseSq('e7'));
    return {
      name: 'Fortress',
      objective: { type: 'ASSASSINATION' },
      turnLimit: actTuning(ctx.act).turnLimit[1] + 1,
      enemyActions: actTuning(ctx.act).enemyActions[0],
      profile: { kind: 'guard_king' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
    };
  },
};

// ---------------------------------------------------------------------------
// ELIMINATION — Hunt
// ---------------------------------------------------------------------------

const hunt: EncounterTemplate = {
  id: 'hunt',
  name: 'Hunt',
  objective: 'ELIMINATION',
  blurb: 'Capture every marked target.',
  acts: [1, 2, 3],
  weight: 3,
  generate(ctx) {
    const P = new Placer(ctx);
    const targets = [0, 2, 3, ctx.rng.range(3, 4)][ctx.act];
    const targetTypes: PieceType[] = ctx.act >= 3 ? ['knight', 'bishop', 'rook', 'queen'] : ['knight', 'bishop', 'rook'];
    const halves: [number, number][] = [
      [0, 3],
      [4, 7],
    ];
    for (let i = 0; i < targets; i++) {
      const files = halves[i % 2];
      P.putIn(pick(ctx, targetTypes), P.region(files, [4, 6]), ['target']);
    }
    const escorts = [0, ctx.rng.range(2, 3), ctx.rng.range(3, 4), ctx.rng.range(4, 5)][ctx.act];
    for (let i = 0; i < escorts; i++) P.putIn('pawn', P.region([0, 7], [4, 6]));
    const guards = [0, ctx.rng.range(0, 1), ctx.rng.range(1, 2), 2][ctx.act];
    for (let i = 0; i < guards; i++) P.putIn(minorPiece(ctx), P.region([0, 7], [6, 7]));
    if (ctx.rng.chance(actTuning(ctx.act).terrainChance)) P.scatterRubble(ctx.rng.range(2, 4));
    return {
      name: 'Hunt',
      objective: { type: 'ELIMINATION' },
      turnLimit: turnLimitFor(ctx, actTuning(ctx.act).turnLimit),
      enemyActions: baseActions(ctx),
      profile: { kind: 'hold_line', rank: 4 },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    P.put('knight', parseSq('c6'), ['target']);
    P.put('bishop', parseSq('f6'), ['target']);
    if (ctx.act >= 2) P.put('rook', parseSq('h7'), ['target']);
    for (const s of ['b5', 'e6', 'g5']) P.put('pawn', parseSq(s));
    return {
      name: 'Hunt',
      objective: { type: 'ELIMINATION' },
      turnLimit: actTuning(ctx.act).turnLimit[1] + 1,
      enemyActions: actTuning(ctx.act).enemyActions[0],
      profile: { kind: 'hold_line', rank: 4 },
      enemies: P.enemies,
      terrain: [],
      waves: [],
    };
  },
};

// ---------------------------------------------------------------------------
// SURVIVAL — Last Stand (an ambush: the enemy drops in around your King)
// ---------------------------------------------------------------------------

/**
 * Squares in front of the player's lines where ambushers land, near the King's
 * file: telegraphed from the start, and occupying one delays that arrival.
 */
function dropZone(ctx: TemplateContext, P: Placer): Sq[] {
  const kingFile = ctx.playerKing !== null ? fileOf(ctx.playerKing) : 4;
  const front = Math.min(5, ctx.deploymentTop + 1);
  return P.region(nearFiles(kingFile, 2), [front, front + 1]);
}

const lastStand: EncounterTemplate = {
  id: 'last_stand',
  name: 'Last Stand',
  objective: 'SURVIVAL',
  blurb: 'An ambush: keep your King alive.',
  acts: [1, 2, 3],
  weight: 2,
  generate(ctx) {
    const P = new Placer(ctx);
    const force: PieceType[][] = [
      [],
      ['knight', 'bishop', 'rook', 'pawn', 'pawn'],
      ['knight', 'bishop', 'rook', 'rook', 'pawn', 'pawn'],
      ['knight', 'bishop', 'bishop', 'rook', 'queen', 'pawn', 'pawn'],
    ];
    for (const t of force[ctx.act]) P.putIn(t, t === 'pawn' ? P.region([0, 7], [4, 5]) : P.region([0, 7], [5, 7]));
    // Ambushers drop in every phase, one at a time in Act I.
    const ambushers: PieceType[] = ctx.act >= 3 ? ['knight', 'bishop', 'rook', 'knight'] : ctx.act >= 2 ? ['knight', 'bishop', 'knight'] : ['knight', 'bishop'];
    const zone = dropZone(ctx, P);
    const T = [0, 6, 7, 7][ctx.act];
    const waves: ReinforcementWave[] = [];
    for (let phase = 1; phase < T && zone.length; phase++) {
      const n = ctx.act >= 3 && phase % 2 === 0 ? 2 : 1;
      const pieces = [];
      for (let k = 0; k < n && zone.length; k++) {
        const sq = zone.splice(ctx.rng.int(zone.length), 1)[0];
        P.used.add(sq);
        pieces.push({ type: pick(ctx, ambushers), sq });
      }
      waves.push({ phase, pieces });
    }
    return {
      name: 'Last Stand',
      objective: { type: 'SURVIVAL' },
      turnLimit: T,
      enemyActions: baseActions(ctx) + 1,
      profile: { kind: 'hunter', target: 'king' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves,
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    for (const s of ['b8', 'g8']) P.put('knight', parseSq(s));
    P.put('rook', parseSq('a8'));
    for (const s of ['c6', 'f6']) P.put('pawn', parseSq(s));
    const zone = dropZone(ctx, P);
    const waves: ReinforcementWave[] = [1, 3].flatMap((phase) => (zone.length ? [{ phase, pieces: [{ type: 'knight' as const, sq: zone.splice(ctx.rng.int(zone.length), 1)[0] }] }] : []));
    return {
      name: 'Last Stand',
      objective: { type: 'SURVIVAL' },
      turnLimit: 5,
      enemyActions: actTuning(ctx.act).enemyActions[0] + 1,
      profile: { kind: 'hunter', target: 'king' },
      enemies: P.enemies,
      terrain: [],
      waves,
    };
  },
};

// ---------------------------------------------------------------------------
// PROMOTION RACE — Pawn Race
// ---------------------------------------------------------------------------

const pawnRace: EncounterTemplate = {
  id: 'pawn_race',
  name: 'Pawn Race',
  objective: 'PROMOTION_RACE',
  blurb: 'Promote before the enemy does.',
  acts: [1, 2, 3],
  weight: 2,
  generate(ctx) {
    const P = new Placer(ctx);
    const pawns = [0, 3, 4, ctx.rng.range(4, 5)][ctx.act];
    const files = ctx.rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, pawns);
    for (const f of files) P.put('pawn', sqOf(f, ctx.rng.chance(0.65) ? 6 : 5));
    const blockers: PieceType[] = [[], ['knight', 'bishop'], ['knight', 'bishop', 'rook'], ['knight', 'bishop', 'rook', 'rook']][ctx.act] as PieceType[];
    for (const t of blockers) P.putIn(t, P.region([0, 7], [Math.max(3, ctx.deploymentTop + 2), 6]));
    if (ctx.rng.chance(actTuning(ctx.act).terrainChance * 0.5)) P.scatterRubble(2);
    const countdown = [0, 8, 8, 9][ctx.act];
    return {
      name: 'Pawn Race',
      objective: { type: 'PROMOTION_RACE', required: 1, countdown },
      turnLimit: countdown,
      enemyActions: baseActions(ctx),
      profile: { kind: 'race_promotion' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    for (const s of ['b7', 'e7', 'g7']) P.put('pawn', parseSq(s));
    P.put('knight', parseSq('d6'));
    return {
      name: 'Pawn Race',
      objective: { type: 'PROMOTION_RACE', required: 1, countdown: 9 },
      turnLimit: 9,
      enemyActions: actTuning(ctx.act).enemyActions[0],
      profile: { kind: 'race_promotion' },
      enemies: P.enemies,
      terrain: [],
      waves: [],
    };
  },
};

// ---------------------------------------------------------------------------
// ESCAPE — Breakout
// ---------------------------------------------------------------------------

const breakout: EncounterTemplate = {
  id: 'breakout',
  name: 'Breakout',
  objective: 'ESCAPE',
  blurb: 'Get the marked piece to an exit square.',
  acts: [1, 2, 3],
  weight: 2,
  generate(ctx) {
    const P = new Placer(ctx);
    const exitFiles = ctx.rng.shuffle([1, 2, 3, 4, 5, 6]).slice(0, 3);
    const exits = exitFiles.map((f) => sqOf(f, 7));
    for (const sq of exits) P.used.add(sq);
    const pawns = [0, ctx.rng.range(2, 3), ctx.rng.range(3, 4), 4][ctx.act];
    for (let i = 0; i < pawns; i++) P.putIn('pawn', P.region([0, 7], [4, 6]));
    const hunters: PieceType[] = [[], ['knight', 'bishop'], ['knight', 'bishop', 'rook'], ['knight', 'knight', 'bishop', 'rook', 'queen']][ctx.act] as PieceType[];
    for (const t of hunters) P.putIn(t, P.region([0, 7], [5, 7]));
    if (ctx.rng.chance(actTuning(ctx.act).terrainChance)) P.scatterRubble(ctx.rng.range(2, 3));
    return {
      name: 'Breakout',
      objective: { type: 'ESCAPE', squares: exits },
      turnLimit: turnLimitFor(ctx, actTuning(ctx.act).turnLimit, ctx.act >= 2 ? 1 : 0),
      enemyActions: baseActions(ctx),
      profile: { kind: 'hunter', target: 'escapee' },
      enemies: P.enemies,
      terrain: P.terrain,
      waves: [],
      // Hunters gang up on the runner from Act II on; a Ward buys it one mistake.
      designate: { prefer: ['knight', 'bishop', 'rook', 'queen', 'pawn'], tag: 'escapee', wards: ctx.act >= 2 ? 1 : 0 },
    };
  },
  safe(ctx) {
    const P = new Placer(ctx);
    const exits = [parseSq('b8'), parseSq('e8'), parseSq('g8')];
    for (const sq of exits) P.used.add(sq);
    for (const s of ['c6', 'f6']) P.put('pawn', parseSq(s));
    P.put('knight', parseSq('d7'));
    return {
      name: 'Breakout',
      objective: { type: 'ESCAPE', squares: exits },
      turnLimit: actTuning(ctx.act).turnLimit[1] + 1,
      enemyActions: actTuning(ctx.act).enemyActions[0],
      profile: { kind: 'hunter', target: 'escapee' },
      enemies: P.enemies,
      terrain: [],
      waves: [],
      designate: { prefer: ['knight', 'bishop', 'rook', 'queen', 'pawn'], tag: 'escapee' },
    };
  },
};

export const TEMPLATES: EncounterTemplate[] = [skirmish, fortress, hunt, lastStand, pawnRace, breakout];

export function templateById(id: string): EncounterTemplate {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t;
}

export type { TemplateOutput };
