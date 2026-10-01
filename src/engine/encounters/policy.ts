import { between, chebyshev, rankOf, type Sq } from '../core/coords';
import { PIECE_VALUE, type PieceType } from '../core/pieces';
import type { EncounterState, Intent, Piece } from '../core/state';
import { makeHypo, mutableCopy, retarget, unmakeHypo } from '../moves/hypo';
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
  const intentLands = state.intents.map((i) => !!state.pieces[i.pieceId] && pieceMoves(ctx, i.pieceId).some((m) => m.to === i.to));
  return {
    intentSquares,
    intentLands,
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
  let s = 0;

  // Immediate objective completion.
  if (target?.type === 'king' && obj === 'ASSASSINATION') return 1e6;
  if (target?.tags.includes('target') && inf.targets.length === 1 && obj === 'ELIMINATION') return 1e6;
  if (obj === 'ESCAPE' && mover.tags.includes('escapee') && inf.exits.includes(m.to)) return 1e6;
  if (obj === 'PROMOTION_RACE' && m.promotion && state.objective.promotions + 1 >= (state.config.objective.required ?? 1)) return 1e6;

  if (target) {
    const wards = target.wards + target.tempWards.reduce((n, w) => n + w.count, 0);
    let v = (target.type === 'king' ? 30 : V(target.type)) * 10;
    if (target.tags.includes('target')) v += 45;
    if (wards > 0) v *= 0.4;
    s += v;
  }
  if (m.rubble) s += 2;
  if (m.promotion) s += m.promotion === 'queen' ? 70 : 30;

  const u = makeHypo(h, m);
  const hctx = retarget(ctx, h);

  // Committed intents: dodge, block, bait, capture the intending piece.
  inf.intents.forEach((intent, i) => {
    const victim = inf.victims[i];
    const victimValue = victim ? (victim.type === 'king' ? 400 : V(victim.type) * 9) : 0;
    const touches = inf.intentSquares[i].has(m.from) || inf.intentSquares[i].has(m.to) || m.captureId === intent.pieceId;
    const lands = !touches
      ? inf.intentLands[i]
      : !!h.pieces[intent.pieceId] && pieceMoves(hctx, intent.pieceId).some((mv) => mv.to === intent.to);
    if (victim && !lands) s += victimValue;
    if (victim && lands && victim.id === m.pieceId) s += victimValue; // moved away; landing on empty square
    if (lands && m.to === intent.to) s -= mover.type === 'king' ? 5000 : V(mover.type) * 9;
  });

  // General safety: avoid squares the enemy already attacks.
  if (inf.enemyAttacks[m.to] && mover.type !== 'king') s -= V(mover.type) * (opts.careful ? 3 : 2);
  if (mover.type === 'king' && inf.enemyAttacks[m.to]) s -= 60;

  // Objective progress.
  switch (obj) {
    case 'ASSASSINATION':
    case 'RESCUE': {
      const k = inf.enemyKing;
      if (k) {
        if (mover.type !== 'king') {
          if (attacksSquare(hctx, m.pieceId, k.sq)) s += inf.enemyAttacks[m.to] ? 60 : 140;
          s += (chebyshev(m.from, k.sq) - chebyshev(m.to, k.sq)) * (mover.type === 'pawn' ? 1 : 3);
        }
      }
      break;
    }
    case 'ELIMINATION': {
      if (inf.targets.length && mover.type !== 'king') {
        const near = (sq: Sq) => Math.min(...inf.targets.filter((t) => t.id !== m.captureId).map((t) => chebyshev(sq, t.sq)), 9);
        s += (near(m.from) - near(m.to)) * 3;
        for (const t of inf.targets) if (t.id !== m.captureId && attacksSquare(hctx, m.pieceId, t.sq)) s += 35;
      }
      break;
    }
    case 'ESCAPE': {
      const e = inf.escapee;
      if (e && inf.exits.length) {
        const dist = (sq: Sq) => Math.min(...inf.exits.map((x) => chebyshev(sq, x)));
        if (m.pieceId === e.id) s += (dist(m.from) - dist(m.to)) * 12;
      }
      break;
    }
    case 'PROMOTION_RACE':
      if (mover.type === 'pawn') s += (rankOf(m.to) - rankOf(m.from)) * 9 + rankOf(m.to);
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
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    // Bots always queen and take free gate/recall variants only when they matter little.
    if (m.promotion && m.promotion !== 'queen') continue;
    const sc = scoreMove(h, hctx, m, inf, opts);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
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
