import { PIECE_NAME } from '../core/pieces';
import type { EncounterState, ObjectiveType, Piece } from '../core/state';
import { createGenContext, isAttackedBy } from '../moves/generate';
import type { Resolver } from '../rules/resolver';

/**
 * Objective and loss evaluation (B5). Called after every action and every
 * intent, and at turn/phase boundaries for timed objectives.
 */

export type EvalMoment = 'action' | 'turnStart' | 'turnEnd' | 'phaseEnd';

/** Objectives that must be completed within T Player Turns. */
const TIMED_COMPLETION: readonly ObjectiveType[] = ['ASSASSINATION', 'ELIMINATION', 'ESCAPE', 'PROMOTION_RACE', 'CONTROL', 'RESCUE'];

const findKing = (s: EncounterState, side: 'player' | 'enemy'): Piece | undefined =>
  Object.values(s.pieces).find((p) => p.side === side && p.type === 'king');

export const targetsRemaining = (s: EncounterState): Piece[] => Object.values(s.pieces).filter((p) => p.tags.includes('target'));

export function controlledSquares(s: EncounterState): number[] {
  const squares = s.config.objective.squares ?? [];
  const ctx = createGenContext(s);
  return squares.filter((sq) => {
    const id = s.board[sq];
    if (id) return s.pieces[id].side === 'player';
    return isAttackedBy(ctx, sq, 'player');
  });
}

function finish(r: Resolver, result: 'won' | 'lost', reason: string) {
  const d = r.d;
  if (d.outcome) return;
  d.outcome = { result, reason, turn: d.turn };
  d.phase = 'over';
  r.log('objective', result === 'won' ? `Victory — ${reason}` : `Defeat — ${reason}`, 0);
  r.emit({ type: result === 'won' ? 'onEncounterWon' : 'onEncounterLost', meta: { reason } });
}

export function evaluateObjective(r: Resolver, moment: EvalMoment = 'action'): void {
  const d = r.d;
  if (d.outcome) return;
  const obj = d.config.objective;
  const T = d.config.turnLimit;

  // Universal loss: the player's King is captured.
  if (!findKing(d, 'player')) {
    finish(r, 'lost', 'your King was captured');
    return;
  }

  switch (obj.type) {
    case 'ASSASSINATION':
    case 'RESCUE':
      if (!findKing(d, 'enemy')) return finish(r, 'won', 'the enemy King has fallen');
      break;
    case 'ELIMINATION':
      if (targetsRemaining(d).length === 0) return finish(r, 'won', 'all marked targets eliminated');
      break;
    case 'ESCAPE': {
      const escapee = Object.values(d.pieces).find((p) => p.tags.includes('escapee'));
      if (!escapee) return finish(r, 'lost', 'the escaping piece was captured');
      if ((obj.squares ?? []).includes(escapee.sq)) return finish(r, 'won', `${PIECE_NAME[escapee.type]} escaped`);
      break;
    }
    case 'PROMOTION_RACE':
      if (d.objective.promotions >= (obj.required ?? 1)) return finish(r, 'won', 'promotion race won');
      if (d.objective.enemyPromoted) return finish(r, 'lost', 'an enemy Pawn promoted first');
      if (d.objective.countdown !== null && d.objective.countdown <= 0) return finish(r, 'lost', 'the enemy countdown ran out');
      break;
    case 'DEFENSE':
      if (!Object.values(d.pieces).some((p) => p.tags.includes('protectee'))) {
        return finish(r, 'lost', 'the protected piece was captured');
      }
      break;
    default:
      break;
  }

  if (moment === 'turnEnd') {
    if (obj.type === 'CONTROL' && controlledSquares(d).length === (obj.squares ?? []).length) {
      return finish(r, 'won', 'all marked squares controlled');
    }
    if (T !== null && d.turn >= T && TIMED_COMPLETION.includes(obj.type)) {
      return finish(r, 'lost', `turn limit reached (${T} turns)`);
    }
  }
  if (moment === 'phaseEnd' && T !== null && d.turn >= T && (obj.type === 'SURVIVAL' || obj.type === 'DEFENSE')) {
    return finish(r, 'won', obj.type === 'SURVIVAL' ? `survived ${T} enemy phases` : `defended for ${T} enemy phases`);
  }
}

export function objectiveSummary(s: EncounterState): string {
  const obj = s.config.objective;
  if (obj.label) return obj.label;
  const T = s.config.turnLimit;
  switch (obj.type) {
    case 'ASSASSINATION':
      return `Capture the enemy King${T ? ` within ${T} turns` : ''}.`;
    case 'ELIMINATION':
      return `Capture all marked targets${T ? ` within ${T} turns` : ''} (${targetsRemaining(s).length} left).`;
    case 'SURVIVAL':
      return `Keep your King alive for ${T} enemy phases.`;
    case 'PROMOTION_RACE':
      return `Promote ${obj.required ?? 1} Pawn${(obj.required ?? 1) > 1 ? 's' : ''} before the countdown ends or an enemy Pawn promotes.`;
    case 'ESCAPE':
      return `Move the marked piece onto an exit square${T ? ` within ${T} turns` : ''}.`;
    case 'CONTROL':
      return `End a turn controlling every marked square${T ? ` within ${T} turns` : ''}.`;
    case 'DEFENSE':
      return `Keep the marked ally alive for ${T} enemy phases.`;
    case 'RESCUE':
      return 'Reach the isolated ally and bring it to safety.';
  }
}
