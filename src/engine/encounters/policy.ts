import { between, chebyshev, fileOf, rankOf, sqOf, type Sq } from '../core/coords';
import { PIECE_VALUE, type PieceType } from '../core/pieces';
import type { EncounterState, Intent, Piece } from '../core/state';
import { totalWards } from '../core/draft';
import { makeHypo, mutableCopy, retarget, unmakeHypo } from '../moves/hypo';
import { openBoardDistance } from '../moves/distance';
import { previewIntents, projectIntents } from '../enemy/preview';
import { compileRules } from '../rules/compile';
import { affordableMoves, createGenContext, pieceAttacks, pieceMoves, type GenContext, type Move } from '../moves/generate';
import type { Rng } from '../rng/rng';
import { applyGeneratedMove, applyPlayerAction, deploySquares, endTurn, type PlayerActionInput } from './flow';

/**
 * Greedy / random-greedy player policy used by the encounter validator's
 * playouts (D7 step 5) and by headless balance simulations. It is a
 * heuristic, not a search: it reads the committed intents (dodge, block,
 * capture the intending piece) and pursues the objective.
 */

export interface PolicyOptions {
  rng: Rng;
  /** Random noise added to every move score (random-greedy diversity). */
  noise: number;
  /** Extra look-ahead: simulate the committed intents after each candidate. */
  careful?: boolean;
}

const V = (t: PieceType) => PIECE_VALUE[t];

interface DecisionInfo {
  /** Squares whose occupancy matters to each intent (path + destination + origin). */
  intentSquares: Set<Sq>[];
  /** Current preview: would each intent land right now? */
  intentLands: boolean[];
  /** The intent's capture would be blocked by a Ward (the victim only loses the Ward). */
  intentWarded: boolean[];
  /** Intents that would promote an enemy Pawn. */
  promotingIntents: boolean[];
  enemyKing: Piece | undefined;
  playerKing: Piece | undefined;
  targets: Piece[];
  escapee: Piece | undefined;
  exits: Sq[];
  enemyAttacks: Uint8Array;
  intents: Intent[];
  /** Player piece currently standing on each intent's destination. */
  victims: (Piece | undefined)[];
}

function info(state: EncounterState, ctx: GenContext): DecisionInfo {
  const pieces = Object.values(state.pieces);
  const enemyAttacks = new Uint8Array(64);
  for (const p of pieces) {
    if (p.side !== 'enemy') continue;
    pieceAttacks(ctx, p.id, (sq) => {
      enemyAttacks[sq] = 1;
    });
  }
  const intentSquares = state.intents.map((i) => {
    const set = new Set<Sq>([i.from, i.to]);
    const path = between(i.from, i.to);
    if (path) for (const sq of path) set.add(sq);
    return set;
  });
  const preview = previewIntents(state);
  const intentLands = preview.map((p) => p.willLand);
  const intentWarded = preview.map((p) => p.blockedByWard);
  const promoRank = ctx.rules.promotionRankEnemy;
  const promotingIntents = state.intents.map((i) => i.pieceType === 'pawn' && (i.to >> 3) <= promoRank);
  return {
    intentSquares,
    intentLands,
    intentWarded,
    promotingIntents,
    enemyKing: pieces.find((p) => p.side === 'enemy' && p.type === 'king'),
    playerKing: pieces.find((p) => p.side === 'player' && p.type === 'king'),
    targets: pieces.filter((p) => p.tags.includes('target')),
    escapee: pieces.find((p) => p.tags.includes('escapee')),
    exits: state.config.objective.squares ?? [],
    enemyAttacks,
    intents: state.intents,
    victims: state.intents.map((i) => {
      const id = state.board[i.to];
      return id && state.pieces[id].side === 'player' ? state.pieces[id] : undefined;
    }),
  };
}

function attacksSquare(ctx: GenContext, pieceId: string, sq: Sq): boolean {
  let hit = false;
  pieceAttacks(ctx, pieceId, (s) => {
    if (s === sq) hit = true;
  });
  return hit;
}

function scoreMove(state: EncounterState, ctx: GenContext, m: Move, inf: DecisionInfo, opts: PolicyOptions): number {
  const h = state; // mutable private copy (see chooseAction)
  const obj = state.config.objective.type;
  const mover = state.pieces[m.pieceId];
  const target = m.captureId ? state.pieces[m.captureId] : undefined;
  // A Ward blocks the capture (B1): the Ward is spent and the mover stays where it is.
  const blocked = !!target && totalWards(target) > 0;
  const dest = blocked ? m.from : m.to;
  let s = 0;

  // Immediate objective completion.
  if (!blocked) {
    if (target?.type === 'king' && obj === 'ASSASSINATION') return 1e6;
    if (target?.tags.includes('target') && inf.targets.length === 1 && obj === 'ELIMINATION') return 1e6;
  }
  if (obj === 'ESCAPE' && mover.tags.includes('escapee') && inf.exits.includes(m.to)) return 1e6;
  if (obj === 'PROMOTION_RACE' && m.promotion && state.objective.promotions + 1 >= (state.config.objective.required ?? 1)) return 1e6;

  if (target) {
    let v = (target.type === 'king' ? 30 : V(target.type)) * 10;
    if (target.tags.includes('target')) v += 45;
    // Stripping a Ward is progress, but only a fraction of a capture.
    if (blocked) v *= 0.4;
    s += v;
  }
  if (m.rubble) s += 2;
  if (m.promotion && !blocked) s += m.promotion === 'queen' ? 70 : 30;
  const runnerBefore = obj === 'PROMOTION_RACE' ? runnerValue(h, ctx.rules.promotionRankPlayer) : 0;

  const u = makeHypo(h, m, { wards: true });
  const hctx = retarget(ctx, h);

  // Committed intents: dodge, block, bait, capture the intending piece.
  const touchesAny = inf.intents.some(
    (intent, i) => inf.intentSquares[i].has(m.from) || inf.intentSquares[i].has(m.to) || m.captureId === intent.pieceId,
  );
  // Re-simulate in order when the move interferes: a boss's chained intents start where the previous one ends.
  const landsNow = touchesAny ? previewIntents(h).map((p) => p.willLand) : inf.intentLands;
  const landsAfter = inf.intents.map((intent, i) => {
    const victim = inf.victims[i];
    const victimValue = victim ? (victim.type === 'king' ? 400 : V(victim.type) * 9) * (inf.intentWarded[i] ? 0.25 : 1) : 0;
    const lands = landsNow[i];
    if (victim && !lands) s += victimValue;
    if (victim && lands && victim.id === m.pieceId && !blocked) s += victimValue; // moved away; landing on empty square
    if (lands && m.to === intent.to && !blocked) s -= mover.type === 'king' ? 5000 : V(mover.type) * 9;
    // Promotion race: an enemy Pawn about to promote loses the encounter — stop it at almost any cost.
    if (obj === 'PROMOTION_RACE' && inf.promotingIntents[i] && !lands) s += 900;
    return lands;
  });
  // Where will the objective pieces stand after the enemy phase? (Read their intents.)
  const predicted = (p: Piece): Sq => {
    // The last landing intent of the piece is where it will stand (bosses chain several).
    let sq = p.sq;
    inf.intents.forEach((x, i) => {
      if (x.pieceId === p.id && landsAfter[i]) sq = x.to;
    });
    return sq;
  };

  // General safety: avoid squares the enemy already attacks.
  if (inf.enemyAttacks[dest] && mover.type !== 'king') s -= V(mover.type) * (opts.careful ? 3 : 2);
  if (mover.type === 'king' && inf.enemyAttacks[dest]) s -= 60;

  // Objective progress.
  switch (obj) {
    case 'ASSASSINATION':
    case 'RESCUE': {
      const k = inf.enemyKing;
      if (k) {
        const goal = predicted(k);
        if (mover.type !== 'king') {
          if (attacksSquare(hctx, m.pieceId, goal)) s += inf.enemyAttacks[dest] ? 60 : 140;
          s += (chebyshev(m.from, goal) - chebyshev(dest, goal)) * (mover.type === 'pawn' ? 1 : 3);
        }
      }
      break;
    }
    case 'ELIMINATION': {
      if (inf.targets.length && mover.type !== 'king') {
        const near = (sq: Sq) => Math.min(...inf.targets.filter((t) => t.id !== m.captureId).map((t) => chebyshev(sq, predicted(t))), 9);
        s += (near(m.from) - near(dest)) * 3;
        for (const t of inf.targets) if (t.id !== m.captureId && attacksSquare(hctx, m.pieceId, predicted(t))) s += 35;
      }
      break;
    }
    case 'ESCAPE': {
      const e = inf.escapee;
      if (e && inf.exits.length) {
        // Real move distance for the escapee's piece type (a Knight next to an exit is not "close").
        const dist = (sq: Sq) => Math.min(...inf.exits.map((x) => openBoardDistance(e.type, sq, x)));
        if (m.pieceId === e.id) s += (Math.min(9, dist(m.from)) - Math.min(9, dist(dest))) * 12;
      }
      break;
    }
    case 'PROMOTION_RACE':
      // Back one runner: progress of the best-placed Pawn (or clearing its file) is what wins races.
      s += (runnerValue(h, ctx.rules.promotionRankPlayer) - runnerBefore) * 3;
      if (mover.type === 'pawn') s += (rankOf(dest) - rankOf(m.from)) * 2;
      // Advanced enemy Pawns are the real threat: capturing them is worth more the closer they are.
      if (target?.type === 'pawn' && target.side === 'enemy') s += (7 - rankOf(target.sq)) * 12;
      break;
    case 'SURVIVAL':
    case 'DEFENSE':
      if (mover.type === 'king') s -= 3;
      break;
    default:
      break;
  }

  unmakeHypo(h, u);
  if (mover.type === 'pawn' && rankOf(m.from) === 1) s += 1.5; // open lines early
  if (mover.type === 'king' && obj !== 'SURVIVAL') s -= 4;
  s += opts.rng.float() * opts.noise;
  return s;
}

/**
 * Promotion race: how promising the best player Pawn's run is. Each step left
 * halves the value; anything standing on the Pawn's file counts as three
 * extra steps (it must be captured, dodged or waited out).
 */
function runnerValue(h: EncounterState, promoRank: number): number {
  let best = 0;
  for (const id in h.pieces) {
    const p = h.pieces[id];
    if (p.side !== 'player' || p.type !== 'pawn') continue;
    let steps = Math.max(0, promoRank - rankOf(p.sq));
    for (let r = rankOf(p.sq) + 1; r <= promoRank; r++) {
      const sq = sqOf(fileOf(p.sq), r);
      if (h.board[sq] || h.terrain[sq]) steps += 3;
    }
    best = Math.max(best, 2 ** (6 - Math.min(6, steps)));
  }
  return best;
}

/** Base-pattern attack test (ignores upgrades): would a `type` on `from` attack `to` on this board? */
function attacksGeom(state: EncounterState, type: PieceType, from: Sq, to: Sq, vacated: Sq): boolean {
  const df = (to & 7) - (from & 7);
  const dr = (to >> 3) - (from >> 3);
  const adf = Math.abs(df);
  const adr = Math.abs(dr);
  if (adf === 0 && adr === 0) return false;
  switch (type) {
    case 'knight':
      return (adf === 1 && adr === 2) || (adf === 2 && adr === 1);
    case 'king':
      return adf <= 1 && adr <= 1;
    case 'pawn':
      return adf === 1 && dr === 1;
    default: {
      const diagonal = adf === adr;
      const straight = adf === 0 || adr === 0;
      if (type === 'bishop' && !diagonal) return false;
      if (type === 'rook' && !straight) return false;
      if (type === 'queen' && !diagonal && !straight) return false;
      const path = between(from, to);
      if (!path) return false;
      return path.every((sq) => (sq === vacated || !state.board[sq]) && state.terrain[sq] !== 'WALL');
    }
  }
}

/**
 * Two-move threat potential toward the objective squares: how many ways the
 * player could attack them next turn (careful bots only).
 */
function threatPotential(h: EncounterState, ctx: GenContext, goals: Sq[]): number {
  let pot = 0;
  for (const id in h.pieces) {
    const p = h.pieces[id];
    if (p.side !== 'player' || p.type === 'king') continue;
    let perPiece = 0;
    for (const g of goals) {
      if (attacksGeom(h, p.type, p.sq, g, -1)) perPiece += 4;
    }
    for (const m of pieceMoves(ctx, id)) {
      for (const g of goals) {
        if (m.to !== g && attacksGeom(h, m.promotion ?? p.type, m.to, g, p.sq)) perPiece += 1;
      }
      if (perPiece >= 6) break;
    }
    pot += Math.min(6, perPiece);
  }
  return Math.min(pot, 18);
}

function goalSquares(state: EncounterState, inf: DecisionInfo): Sq[] {
  const predicted = (p: Piece): Sq => {
    let sq = p.sq;
    inf.intents.forEach((x, i) => {
      if (x.pieceId === p.id && inf.intentLands[i]) sq = x.to;
    });
    return sq;
  };
  switch (state.config.objective.type) {
    case 'ASSASSINATION':
    case 'RESCUE':
      return inf.enemyKing ? [predicted(inf.enemyKing)] : [];
    case 'ELIMINATION':
      return inf.targets.map(predicted);
    default:
      return [];
  }
}

/**
 * One ply beyond the committed intents: once they resolve, will the enemy be
 * attacking the player's King (and can it step away)? The next plan will
 * certainly go for it.
 */
function kingDanger(state: EncounterState): number {
  const proj = projectIntents(state);
  let king: Piece | undefined;
  for (const id in proj.pieces) {
    const p = proj.pieces[id];
    if (p.side === 'player' && p.type === 'king') king = p;
  }
  if (!king) return 0; // captured outright: the intent valuation already counts it
  const ctx = createGenContext(proj);
  const attacked = new Uint8Array(64);
  for (const id in proj.pieces) {
    if (proj.pieces[id].side === 'enemy') {
      pieceAttacks(ctx, id, (sq) => {
        attacked[sq] = 1;
      });
    }
  }
  if (!attacked[king.sq]) return 0;
  const escapes = pieceMoves(ctx, king.id).filter((m) => !attacked[m.to] && !m.captureId).length;
  return escapes > 0 ? 25 : 220;
}

const affinityCache = new WeakMap<object, Partial<Record<PieceType, number>>>();

/** Stacks of owned upgrades affecting each piece type. */
function buildAffinity(state: EncounterState): Partial<Record<PieceType, number>> {
  const cached = affinityCache.get(state.rules);
  if (cached) return cached;
  const rules = compileRules(state.rules);
  const out: Partial<Record<PieceType, number>> = {};
  for (const [id, owned] of rules.owned) {
    for (const t of rules.defs.get(id)!.affects) out[t] = (out[t] ?? 0) + owned.stacks;
  }
  affinityCache.set(state.rules, out);
  return out;
}

/** Pick the next action for the player, or null to end the turn. */
export function chooseAction(state: EncounterState, opts: PolicyOptions): { action: PlayerActionInput; move?: Move } | null {
  if (state.phase !== 'player' || state.outcome) return null;
  const deploy = deploySquares(state);
  if (deploy.length && state.reserve.length) {
    const best = state.reserve.slice().sort((a, b) => V(b.type) - V(a.type))[0];
    const sq = deploy.slice().sort((a, b) => Math.abs((a & 7) - 3.5) - Math.abs((b & 7) - 3.5))[0];
    return { action: { type: 'deploy', reserveId: best.id, to: sq } };
  }
  const ctx = createGenContext(state);
  const moves = affordableMoves(ctx);
  if (!moves.length) return null;
  const inf = info(state, ctx);
  const h = mutableCopy(state);
  const hctx = retarget(ctx, h);
  const scored: { move: Move; score: number }[] = [];
  for (const m of moves) {
    // Bots always queen.
    if (m.promotion && m.promotion !== 'queen') continue;
    scored.push({ move: m, score: scoreMove(h, hctx, m, inf, opts) });
  }
  if (opts.careful) {
    const goals = goalSquares(state, inf);
    // Build affinity: a player leans on the pieces their upgrades improve.
    const affinity = buildAffinity(state);
    const favoured = (Object.keys(affinity) as PieceType[]).filter((t) => affinity[t]! >= 2);
    const mobility = (st: EncounterState, c: GenContext) => {
      let n = 0;
      for (const id in st.pieces) {
        const p = st.pieces[id];
        if (p.side === 'player' && favoured.includes(p.type)) n += pieceMoves(c, id).length;
      }
      return n;
    };
    const mobilityBefore = favoured.length ? mobility(state, ctx) : 0;
    for (const c of scored) c.score += Math.min(6, affinity[c.move.pieceType] ?? 0) * 1.6;
    scored.sort((a, b) => b.score - a.score);
    for (const c of scored.slice(0, 8)) {
      if (favoured.length) {
        const u = makeHypo(h, c.move, { wards: true });
        c.score += 0.8 * (mobility(h, retarget(ctx, h)) - mobilityBefore);
        unmakeHypo(h, u);
      }
      if (c.score >= 1e5) continue;
      if (goals.length) {
        const u = makeHypo(h, c.move, { wards: true });
        c.score += 3 * threatPotential(h, retarget(ctx, h), goals);
        unmakeHypo(h, u);
      }
      // Resolve the move for real (silently) to value what the build's triggers give back.
      const after = applyGeneratedMove(state, c.move, { silent: true }).state;
      if (after.outcome?.result === 'won') c.score += 1e5;
      const spent = c.move.free ? 0 : 1;
      const gained = after.actions.length - (state.actions.length - spent);
      c.score += 14 * Math.max(0, gained);
      const wardsBefore = Object.values(state.pieces).reduce((n, p) => n + (p.side === 'player' ? p.wards : 0), 0);
      const wardsAfter = Object.values(after.pieces).reduce((n, p) => n + (p.side === 'player' ? p.wards : 0), 0);
      c.score += 4 * Math.max(0, wardsAfter - wardsBefore);
      const immobilized = Object.values(after.pieces).filter((p) => p.side === 'enemy' && p.statuses.length > 0).length;
      const immobilizedBefore = Object.values(state.pieces).filter((p) => p.side === 'enemy' && p.statuses.length > 0).length;
      c.score += 5 * Math.max(0, immobilized - immobilizedBefore);
      if (!after.outcome) c.score -= kingDanger(after);
    }
  }
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const c of scored) {
    if (c.score > bestScore) {
      bestScore = c.score;
      best = c.move;
    }
  }
  if (!best || bestScore < -50) return null;
  return {
    action: { type: 'move', pieceId: best.pieceId, to: best.to, promotion: best.promotion, gate: best.gate, recall: best.recall },
    move: best,
  };
}

export interface PlayoutResult {
  won: boolean;
  outcome: EncounterState['outcome'];
  turns: number;
  state: EncounterState;
}

/** Play an encounter to the end with the policy. */
export function playout(initial: EncounterState, opts: PolicyOptions, maxActionsPerTurn = 12): PlayoutResult {
  let s = initial;
  const cap = (initial.config.turnLimit ?? 12) + 2;
  while (!s.outcome && s.turn <= cap) {
    for (let k = 0; k < maxActionsPerTurn && !s.outcome; k++) {
      const choice = chooseAction(s, opts);
      if (!choice) break;
      s = choice.move ? applyGeneratedMove(s, choice.move, { silent: true }).state : applyPlayerAction(s, choice.action, { silent: true }).state;
    }
    if (s.outcome) break;
    s = endTurn(s, { silent: true }).state;
  }
  return { won: s.outcome?.result === 'won', outcome: s.outcome, turns: s.outcome?.turn ?? s.turn, state: s };
}
