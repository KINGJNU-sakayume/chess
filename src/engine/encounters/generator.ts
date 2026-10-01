import { rankOf, type Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import type { EncounterConfig, EncounterRules, EncounterState, PieceTag } from '../core/state';
import { allAffixes } from '../rules/registry';
import { deriveStream, Rng } from '../rng/rng';
import { templateById } from '../../data/encounters';
import { BOSS_TEMPLATES } from '../../data/bosses/templates';
import { actTuning } from '../../data/acts';
import { applyPlayerAction, endTurn, type PlayerActionInput } from './flow';
import { playout } from './policy';
import { createEncounter, type EncounterSetup, type PlacedMutation, type RosterPlacement } from './setup';
import type { EncounterTemplate, TemplateContext, TemplateOutput } from './templates';
import { affordableMoves, createGenContext } from '../moves/generate';
import { BASE_PATTERNS } from '../chess/patterns';
import { chebyshev } from '../core/coords';

/**
 * Procedural encounter generation and the validation pipeline (D7):
 *   1. legality  2. not trivially complete  3. not instantly lost
 *   4. reachability heuristic  5. seeded playouts with the player's build
 *   6. on failure regenerate (up to M attempts), then fall back to the
 *      template's pre-validated safe variant.
 */

export interface GenerateInput {
  /** Stable per-node seed; boss retries reuse it (same seed variant). */
  seed: string;
  act: number;
  kind: 'combat' | 'elite' | 'boss';
  templateId: string;
  difficulty: number;
  rules: EncounterRules;
  roster: RosterPlacement[];
  mutations: PlacedMutation[];
  deploymentTop: number;
}

export interface ValidationReport {
  ok: boolean;
  reasons: string[];
  playouts: number;
  successes: number;
  earliestWin: number | null;
  ms: number;
}

export interface GeneratedEncounter {
  setup: EncounterSetup;
  attempts: number;
  fallback: boolean;
  report: ValidationReport | null;
}

export const MAX_ATTEMPTS = 8;
export const PLAYOUTS = 20;

function rollEliteAffixes(rng: Rng, act: number, out: TemplateOutput): { affixes: string[]; extraAction: boolean } {
  const tuning = actTuning(act);
  const pool = allAffixes().filter((a) => !a.curse);
  if (act === 1 && rng.chance(tuning.eliteExtraActionChance)) return { affixes: [], extraAction: true };
  const affixes: string[] = [];
  const shuffled = rng.shuffle(pool);
  for (const a of shuffled) {
    if (affixes.length >= tuning.eliteAffixes) break;
    if (a.enemyWards?.pieceType === 'targets' && out.objective.type !== 'ELIMINATION') continue;
    affixes.push(a.id);
  }
  return { affixes, extraAction: false };
}

function designate(roster: RosterPlacement[], prefer: PieceType[], tag: PieceTag): RosterPlacement[] {
  for (const type of prefer) {
    const idx = roster.findIndex((r) => r.type === type && r.sq !== null);
    if (idx >= 0) return roster.map((r, i) => (i === idx ? { ...r, tags: [...(r.tags ?? []), tag] } : r));
  }
  return roster;
}

export function buildSetup(input: GenerateInput, out: TemplateOutput, attemptSeed: string, extra: { affixes: string[]; extraAction: boolean }): EncounterSetup {
  const config: EncounterConfig = {
    id: attemptSeed,
    templateId: input.templateId,
    name: out.name,
    act: input.act,
    kind: input.kind,
    objective: out.objective,
    turnLimit: out.turnLimit,
    enemyActions: out.enemyActions + (extra.extraAction ? 1 : 0),
    profile: out.profile,
    affixes: extra.affixes,
    bossId: out.bossId,
    seed: attemptSeed,
  };
  const roster = out.designate ? designate(input.roster, out.designate.prefer, out.designate.tag) : input.roster;
  return {
    config,
    rules: { upgrades: input.rules.upgrades, affixes: [...input.rules.affixes, ...extra.affixes] },
    roster,
    enemies: out.enemies,
    terrain: out.terrain,
    mutations: input.mutations,
    waves: out.waves,
    marks: out.marks,
  };
}

function templateFor(input: GenerateInput): EncounterTemplate {
  if (input.kind === 'boss') {
    const t = BOSS_TEMPLATES[input.templateId];
    if (!t) throw new Error(`Unknown boss template ${input.templateId}`);
    return t;
  }
  return templateById(input.templateId);
}

export function generateEncounter(input: GenerateInput, opts: { validate?: boolean; attempts?: number; playouts?: number } = {}): GeneratedEncounter {
  const template = templateFor(input);
  const occupied = new Set<Sq>(input.roster.filter((r) => r.sq !== null).map((r) => r.sq as Sq));
  const attempts = opts.attempts ?? MAX_ATTEMPTS;
  const validate = opts.validate ?? true;
  let lastReport: ValidationReport | null = null;
  for (let k = 0; k < attempts; k++) {
    const rng = new Rng(deriveStream(input.seed, `gen:${k}`));
    const ctx: TemplateContext = { rng, act: input.act, kind: input.kind, difficulty: input.difficulty, occupied, deploymentTop: input.deploymentTop };
    const out = template.generate(ctx);
    const extra = input.kind === 'elite' ? rollEliteAffixes(rng, input.act, out) : { affixes: [], extraAction: false };
    const setup = buildSetup(input, out, `${input.seed}#${k}`, extra);
    if (!validate) return { setup, attempts: k + 1, fallback: false, report: null };
    const report = validateEncounter(setup, { playouts: opts.playouts });
    lastReport = report;
    if (report.ok) return { setup, attempts: k + 1, fallback: false, report };
  }
  const rng = new Rng(deriveStream(input.seed, 'safe'));
  const ctx: TemplateContext = { rng, act: input.act, kind: input.kind, difficulty: input.difficulty, occupied, deploymentTop: input.deploymentTop };
  const out = template.safe(ctx);
  const extra = input.kind === 'elite' ? rollEliteAffixes(rng, input.act, out) : { affixes: [], extraAction: false };
  const setup = buildSetup(input, out, `${input.seed}#safe`, extra);
  return { setup, attempts, fallback: true, report: lastReport };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Minimum number of moves for a piece type to reach `to` from `from` on an open board (walls ignored). */
export function openBoardDistance(type: PieceType, from: Sq, to: Sq): number {
  if (from === to) return 0;
  const df = Math.abs((from & 7) - (to & 7));
  const dr = Math.abs((from >> 3) - (to >> 3));
  switch (type) {
    case 'king':
      return Math.max(df, dr);
    case 'queen':
      return df === 0 || dr === 0 || df === dr ? 1 : 2;
    case 'rook':
      return df === 0 || dr === 0 ? 1 : 2;
    case 'bishop':
      if ((df + dr) % 2 !== 0) return 99;
      return df === dr ? 1 : 2;
    case 'knight': {
      // BFS on the empty board.
      const dist = new Array(64).fill(-1);
      dist[from] = 0;
      const queue = [from];
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur === to) return dist[cur];
        for (const [a, b] of BASE_PATTERNS.knight.leaps) {
          const f = (cur & 7) + a;
          const r = (cur >> 3) + b;
          if (f < 0 || f > 7 || r < 0 || r > 7) continue;
          const nxt = r * 8 + f;
          if (dist[nxt] < 0) {
            dist[nxt] = dist[cur] + 1;
            queue.push(nxt);
          }
        }
      }
      return 99;
    }
    case 'pawn': {
      const forward = (to >> 3) - (from >> 3);
      return forward > 0 && df <= forward ? forward : 99;
    }
  }
}

export function validateEncounter(setup: EncounterSetup, opts: { playouts?: number } = {}): ValidationReport {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const reasons: string[] = [];
  const done = (ok: boolean, playouts = 0, successes = 0, earliestWin: number | null = null): ValidationReport => ({
    ok,
    reasons,
    playouts,
    successes,
    earliestWin,
    ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  });

  // 1. Legality.
  const squares = new Set<Sq>();
  for (const e of setup.enemies) {
    if (squares.has(e.sq)) reasons.push('overlapping enemy pieces');
    squares.add(e.sq);
    if (e.type === 'pawn' && (rankOf(e.sq) === 0 || rankOf(e.sq) === 7)) reasons.push('enemy pawn on a back rank');
  }
  if (!setup.roster.some((r) => r.type === 'king' && r.sq !== null)) reasons.push('player King missing');
  const needsKing = setup.config.objective.type === 'ASSASSINATION' || setup.config.objective.type === 'RESCUE';
  if (needsKing && !setup.enemies.some((e) => e.type === 'king')) reasons.push('enemy King missing');
  if (setup.config.objective.type === 'ELIMINATION' && !setup.enemies.some((e) => e.tags?.includes('target'))) reasons.push('no targets');
  if (reasons.length) return done(false);

  let state: EncounterState;
  try {
    state = createEncounter(setup, { silent: true });
  } catch (err) {
    reasons.push(`setup failed: ${(err as Error).message}`);
    return done(false);
  }

  // 2. Not trivially complete.
  if (state.outcome) {
    reasons.push('objective already decided at start');
    return done(false);
  }
  const ctx = createGenContext(state);
  const firstMoves = affordableMoves(ctx);
  for (const m of firstMoves) {
    const a: PlayerActionInput = { type: 'move', pieceId: m.pieceId, to: m.to, promotion: m.promotion, gate: m.gate, recall: m.recall };
    const after = applyPlayerAction(state, a, { silent: true }).state;
    if (after.outcome?.result === 'won') {
      reasons.push('completable with the first action');
      return done(false);
    }
  }

  // 3. Not instantly lost: every first-phase intent against the King must have an answer.
  const kingThreat = state.intents.some((i) => i.expectedTargetType === 'king');
  if (kingThreat) {
    const answered = firstMoves.some((m) => {
      const a: PlayerActionInput = { type: 'move', pieceId: m.pieceId, to: m.to, promotion: m.promotion };
      const after = applyPlayerAction(state, a, { silent: true }).state;
      if (after.outcome) return after.outcome.result === 'won';
      return endTurn(after, { silent: true }).state.outcome?.reason !== 'your King was captured';
    });
    if (!answered) {
      reasons.push('player King cannot survive the first enemy phase');
      return done(false);
    }
  }

  // 4. Reachability heuristic.
  const T = setup.config.turnLimit ?? 99;
  const goals: Sq[] = [];
  const obj = setup.config.objective;
  if (obj.type === 'ASSASSINATION') goals.push(...Object.values(state.pieces).filter((p) => p.side === 'enemy' && p.type === 'king').map((p) => p.sq));
  if (obj.type === 'ELIMINATION') goals.push(...Object.values(state.pieces).filter((p) => p.tags.includes('target')).map((p) => p.sq));
  if (obj.type === 'ESCAPE') goals.push(...(obj.squares ?? []));
  const players = Object.values(state.pieces).filter((p) => p.side === 'player');
  for (const g of goals) {
    const best = Math.min(...players.map((p) => openBoardDistance(p.type, p.sq, g) + (p.type === 'pawn' ? 0 : chebyshev(p.sq, g) > 6 ? 1 : 0)));
    if (best > T) {
      reasons.push('objective unreachable within the turn limit');
      return done(false);
    }
  }

  // 5. Playouts with the actual build.
  const n = opts.playouts ?? PLAYOUTS;
  const rng = new Rng(deriveStream(setup.config.seed, 'playouts'));
  let successes = 0;
  let earliest: number | null = null;
  for (let i = 0; i < n; i++) {
    const res = playout(state, { rng, noise: i === 0 ? 0 : 6 + i });
    if (res.won) {
      successes += 1;
      earliest = earliest === null ? res.turns : Math.min(earliest, res.turns);
      if (res.turns <= 2 && obj.type !== 'SURVIVAL' && obj.type !== 'DEFENSE') {
        reasons.push('won within the first 2 turns by a playout');
        return done(false, i + 1, successes, earliest);
      }
      // Enough evidence: at least one success and early-win checks keep running for a few more playouts.
      if (successes >= 1 && i >= 7) return done(true, i + 1, successes, earliest);
    }
  }
  if (successes === 0) reasons.push('no playout succeeded');
  return done(successes > 0, n, successes, earliest);
}
