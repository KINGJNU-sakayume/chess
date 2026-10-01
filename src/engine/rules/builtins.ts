import { sqName } from '../core/coords';
import type { SquareMark, SquareType } from '../core/state';
import { addWard, grantAction, immobilize, pieceLabel } from '../effects/primitives';
import type { Resolver } from './resolver';
import type { GameEvent, GameEventType } from './types';

/**
 * Built-in subscribers: square behaviors (B10) and other always-on rules.
 * They resolve before upgrade hooks of equal priority (acquisition order −1).
 */
export interface BuiltinSubscriber {
  id: string;
  event: GameEventType;
  priority: number;
  run: (r: Resolver, e: GameEvent) => void;
}

export function activeMark(r: Resolver, sq: number, type: SquareType, side: 'player' | 'enemy'): SquareMark | undefined {
  return r.d.marks.find((m) => m.sq === sq && m.type === type && m.side === side && !m.suppressed);
}

export { SQUARE_INFO } from '../../data/squares';

export const BUILTIN_SUBSCRIBERS: BuiltinSubscriber[] = [
  {
    id: 'square:CRIMSON',
    event: 'onPieceLanded',
    priority: 0,
    run(r, e) {
      if (e.side !== 'enemy' || e.sq === undefined || !e.actorId) return;
      if (!activeMark(r, e.sq, 'CRIMSON', 'player')) return;
      immobilize(r, e.actorId, 1, 'square:CRIMSON');
      r.log('trigger', `Crimson ${sqName(e.sq)}: ${pieceLabel(r.d.pieces[e.actorId])} is Immobilized`, 1, [e.sq]);
    },
  },
  {
    id: 'square:BISHOP_ALTAR:cross',
    event: 'onSquareCrossed',
    priority: 0,
    run: (r, e) => altar(r, e, 'crossed'),
  },
  {
    id: 'square:BISHOP_ALTAR:land',
    event: 'onPieceLanded',
    priority: 0,
    run: (r, e) => altar(r, e, 'landed on'),
  },
  {
    id: 'square:ROYAL',
    event: 'onPieceLanded',
    priority: 0,
    run(r, e) {
      if (e.side !== 'player' || e.sq === undefined || (e.actorType !== 'king' && e.actorType !== 'queen')) return;
      if (!activeMark(r, e.sq, 'ROYAL', 'player')) return;
      const flag = `royal:${e.sq}`;
      if (r.d.turnFlags[flag] || r.d.phase !== 'player') return;
      r.d.turnFlags[flag] = 1;
      grantAction(r, { source: 'square:ROYAL', label: 'Royal Square' }, `Royal Square ${sqName(e.sq)}: +1 extra action`);
    },
  },
  {
    id: 'square:SANCTUARY',
    event: 'onEnemyPhaseStart',
    priority: 0,
    run(r) {
      for (const id of Object.keys(r.d.pieces)) {
        const p = r.d.pieces[id];
        if (p.side !== 'player' || !activeMark(r, p.sq, 'SANCTUARY', 'player')) continue;
        addWard(r, id, 1, 'square:SANCTUARY', { at: 'phaseEnd', turn: r.d.turn });
        r.log('trigger', `Sanctuary ${sqName(p.sq)}: ${pieceLabel(p)} gains a Ward this phase`, 1, [p.sq]);
      }
    },
  },
  {
    id: 'square:ENEMY_SANCTUARY',
    event: 'onTurnStart',
    priority: 0,
    run(r) {
      for (const id of Object.keys(r.d.pieces)) {
        const p = r.d.pieces[id];
        if (p.side !== 'enemy' || !activeMark(r, p.sq, 'ENEMY_SANCTUARY', 'enemy')) continue;
        addWard(r, id, 1, 'square:ENEMY_SANCTUARY', { at: 'turnEnd', turn: r.d.turn });
        r.log('trigger', `Enemy Sanctuary ${sqName(p.sq)}: ${pieceLabel(p)} gains a Ward this turn`, 1, [p.sq]);
      }
    },
  },
  {
    id: 'square:PROFANE',
    event: 'onPieceLanded',
    priority: 0,
    run(r, e) {
      if (e.side !== 'player' || e.sq === undefined || !e.actorId) return;
      if (!activeMark(r, e.sq, 'PROFANE', 'enemy')) return;
      const p = r.d.pieces[e.actorId];
      if (!p || (p.wards === 0 && p.tempWards.length === 0)) return;
      r.d.pieces[e.actorId] = { ...p, wards: 0, tempWards: [] };
      r.log('trigger', `Profane ${sqName(e.sq)}: ${pieceLabel(p)} loses all Wards`, 1, [e.sq]);
    },
  },
];

function altar(r: Resolver, e: GameEvent, verb: string) {
  if (e.side !== 'player' || e.actorType !== 'bishop' || e.sq === undefined || !e.actorId) return;
  if (!activeMark(r, e.sq, 'BISHOP_ALTAR', 'player')) return;
  const flag = `altar:${e.actorId}`;
  if (r.d.turnFlags[flag]) return;
  r.d.turnFlags[flag] = 1;
  addWard(r, e.actorId, 1, 'square:BISHOP_ALTAR');
  r.log('trigger', `${verb} Bishop Altar ${sqName(e.sq)}: +1 Ward`, 1, [e.sq]);
  r.emit({ type: 'onAltarActivated', actorId: e.actorId, actorType: 'bishop', side: 'player', sq: e.sq });
}
