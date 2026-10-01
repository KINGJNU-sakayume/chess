import { fileOf, rankOf, sqOf, type Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import { chooseAction } from '../encounters/policy';
import { upgradeDef } from '../rules/registry';
import type { UpgradeDef } from '../rules/types';
import { Rng } from '../rng/rng';
import { legalPieces, legalPlacementSquares } from './acquire';
import { reachableNodes } from './map';
import { newRun, runReducer, runView } from './reducer';
import type { NodeType, RunAction, RunState } from './types';

/**
 * Headless run simulation (M4 acceptance, M6 balance). A bot plays whole runs
 * through the same reducer the UI uses, so every simulated run is replayable.
 */
export interface PickPolicy {
  name: string;
  /** Score an offered upgrade; anything below 0 is never taken. */
  upgrade: (def: UpgradeDef, run: RunState) => number;
  /** Score a recruit offer. */
  recruit: (pieces: PieceType[]) => number;
  /** Preferred node types, best first. */
  nodes: NodeType[];
}

const tagPolicy = (name: string, tags: string[], recruitType: PieceType, nodes: NodeType[]): PickPolicy => ({
  name,
  upgrade: (def) => (def.tags.some((t) => tags.includes(t)) ? 10 + (def.rarity === 'rare' ? 3 : def.rarity === 'uncommon' ? 1 : 0) : -1),
  recruit: (pieces) => (pieces.every((p) => p === recruitType) ? pieces.length : -1),
  nodes,
});

export const POLICIES: Record<string, PickPolicy> = {
  pawn: tagPolicy('pawn', ['pawn', 'promotion'], 'pawn', ['upgrade', 'recruit', 'combat', 'event', 'shop', 'mutation', 'elite', 'sacrifice']),
  bishop: tagPolicy('bishop', ['bishop'], 'bishop', ['upgrade', 'recruit', 'combat', 'event', 'shop', 'mutation', 'elite', 'sacrifice']),
  board: {
    name: 'board',
    upgrade: (def) => (def.category === 'mutation' || def.category === 'debuff' || def.tags.includes('enemy_debuff') ? 10 : -1),
    recruit: () => -1,
    nodes: ['mutation', 'upgrade', 'combat', 'shop', 'event', 'elite', 'recruit', 'sacrifice'],
  },
  any: {
    name: 'any',
    upgrade: (def) => ({ common: 1, uncommon: 2, rare: 3, legendary: 4 })[def.rarity],
    recruit: (pieces) => pieces.length,
    nodes: ['upgrade', 'combat', 'recruit', 'shop', 'mutation', 'event', 'elite', 'sacrifice'],
  },
};

export interface SimResult {
  run: RunState;
  steps: number;
  reachedAct: number;
  won: boolean;
}

const PREFERRED_SQUARES: Sq[] = [sqOf(3, 2), sqOf(4, 2), sqOf(2, 2), sqOf(5, 2), sqOf(3, 3), sqOf(4, 3), sqOf(2, 1), sqOf(5, 1)];

function placementAction(run: RunState): RunAction {
  const p = run.pending;
  if (!p || p.kind !== 'place') throw new Error('No placement');
  const step = p.step;
  switch (step.kind) {
    case 'squares':
    case 'pieceSquare':
    case 'rank4': {
      const legal = legalPlacementSquares(run);
      const count = step.kind === 'squares' ? step.count : step.kind === 'rank4' ? step.count : 1;
      const ordered = [...PREFERRED_SQUARES.filter((s) => legal.includes(s)), ...legal.filter((s) => !PREFERRED_SQUARES.includes(s))];
      // Knight gates: link a home square to an advanced one.
      if (step.kind === 'squares' && step.square === 'KNIGHT_GATE') {
        const back = legal.filter((s) => rankOf(s) === 2).sort((a, b) => Math.abs(fileOf(a) - 3.5) - Math.abs(fileOf(b) - 3.5));
        const front = legal.filter((s) => rankOf(s) === 5).sort((a, b) => Math.abs(fileOf(a) - 3.5) - Math.abs(fileOf(b) - 3.5));
        if (back.length && front.length) return { type: 'placeSquares', squares: [back[0], front[0]] };
      }
      return { type: 'placeSquares', squares: ordered.slice(0, count) };
    }
    case 'line':
      return { type: 'placeLine', axis: 'rank', index: 2 };
    case 'piece':
      return { type: 'pickPiece', rosterId: legalPieces(run)[0].id };
    case 'castledSide':
      return { type: 'pickSide', side: 'king' };
  }
}

function pendingAction(run: RunState, policy: PickPolicy): RunAction {
  const p = run.pending!;
  switch (p.kind) {
    case 'reward':
    case 'mutationOffer': {
      let best = -1;
      let bestScore = -1;
      p.offers.forEach((id, i) => {
        const sc = policy.upgrade(upgradeDef(id), run);
        if (sc > bestScore) {
          best = i;
          bestScore = sc;
        }
      });
      return best >= 0 && bestScore >= 0 ? { type: 'pickOffer', index: best } : { type: 'skip' };
    }
    case 'recruit': {
      let best = -1;
      let bestScore = -1;
      p.offers.forEach((o, i) => {
        const sc = policy.recruit(o.pieces);
        if (sc > bestScore) {
          best = i;
          bestScore = sc;
        }
      });
      return best >= 0 && bestScore >= 0 ? { type: 'pickOffer', index: best } : { type: 'skip' };
    }
    case 'place':
      return placementAction(run);
    case 'shop': {
      if (run.crowns < 3) {
        const crown = p.items.findIndex((it) => it.kind === 'crown' && !it.sold && it.price <= run.gold);
        if (crown >= 0) return { type: 'buy', index: crown };
      }
      const idx = p.items.findIndex((it) => !it.sold && it.price <= run.gold && it.kind === 'upgrade' && policy.upgrade(upgradeDef(it.id), run) >= 0);
      if (idx >= 0) return { type: 'buy', index: idx };
      return { type: 'leave' };
    }
    case 'event':
      return { type: 'leave' };
    case 'sacrifice':
      return { type: 'leave' };
    case 'defeat':
      return p.boss ? { type: 'retryBoss' } : { type: 'continueAfterDefeat' };
  }
}

export function simulateRun(seed: string, policy: PickPolicy, opts: { maxActs?: number; maxSteps?: number } = {}): SimResult {
  const maxActs = opts.maxActs ?? 3;
  const maxSteps = opts.maxSteps ?? 20000;
  let run = newRun(seed);
  const botRng = new Rng([0x9e3779b9, seed.length, 7, 11]);
  let steps = 0;
  while (!run.result && run.act <= maxActs && steps < maxSteps) {
    steps++;
    switch (runView(run)) {
      case 'map': {
        const options = reachableNodes(run.map, run.at);
        const rank = (t: NodeType) => (t === 'boss' ? -1 : policy.nodes.indexOf(t) === -1 ? 99 : policy.nodes.indexOf(t));
        const best = options.slice().sort((a, b) => rank(a.type) - rank(b.type) || a.x - b.x)[0];
        run = runReducer(run, { type: 'chooseNode', nodeId: best.id });
        break;
      }
      case 'encounter': {
        const enc = run.encounter!;
        if (enc.outcome) {
          run = runReducer(run, { type: 'finishEncounter' });
          break;
        }
        const choice = chooseAction(enc, { rng: botRng, noise: 1.5, careful: true });
        run = choice ? runReducer(run, { type: 'encounterAct', action: choice.action }) : runReducer(run, { type: 'endTurn' });
        break;
      }
      case 'pending':
        run = runReducer(run, pendingAction(run, policy));
        break;
      default:
        break;
    }
  }
  return { run, steps, reachedAct: run.act, won: run.result?.outcome === 'victory' || run.act > maxActs };
}
