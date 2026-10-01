import { sqName } from '../core/coords';
import { neighbours } from '../core/coords';
import { patchPiece } from '../core/draft';
import { PIECE_NAME } from '../core/pieces';
import type { ActionToken } from '../core/state';
import type { HookSubscriber } from '../rules/compile';
import { evalNum, stackedName } from '../rules/num';
import type { Resolver } from '../rules/resolver';
import type { Condition, EffectDef, GameEvent, RelativeExpiry, TargetRef } from '../rules/types';
import { CUSTOM_EFFECTS, CUSTOM_PREDICATES } from './custom';
import { addWard, grantAction, immobilize, markSquare } from './primitives';

/** Interprets data hooks: condition → usage limit → effects. */

function typeMatches(t: string | undefined, want: string | string[] | undefined): boolean {
  if (want === undefined) return true;
  if (t === undefined) return false;
  return Array.isArray(want) ? want.includes(t) : t === want;
}

export function conditionHolds(r: Resolver, c: Condition | undefined, sub: HookSubscriber, e: GameEvent): boolean {
  if (!c) return true;
  if (!typeMatches(e.actorType, c.actorType)) return false;
  if (c.actorSide && e.side !== c.actorSide) return false;
  if (!typeMatches(e.targetType, c.targetType)) return false;
  if (c.targetSide && e.targetSide !== c.targetSide) return false;
  if (c.free !== undefined && !!e.free !== c.free) return false;
  if (c.capture !== undefined && !!e.capture !== c.capture) return false;
  if (c.minDistance !== undefined && (e.distance ?? 0) < evalNum(c.minDistance, sub.stacks, r.d.counters)) return false;
  if (c.counterAtLeast) {
    const [counter, n] = c.counterAtLeast;
    if ((r.d.counters[counter] ?? 0) < evalNum(n, sub.stacks, r.d.counters)) return false;
  }
  if (c.custom) {
    const pred = CUSTOM_PREDICATES[c.custom];
    if (!pred) throw new Error(`Unknown custom predicate: ${c.custom}`);
    if (!pred.test(r, e, sub)) return false;
  }
  return true;
}

function limitKey(sub: HookSubscriber, e: GameEvent): string | null {
  const limit = sub.hook.limit;
  if (!limit) return null;
  const base = `lim:${sub.upgradeId}:${sub.hookIndex}`;
  return limit.per === 'pieceTurn' ? `${base}:${e.actorId ?? '-'}` : base;
}

export function runHook(r: Resolver, sub: HookSubscriber, e: GameEvent): void {
  if (!conditionHolds(r, sub.hook.condition, sub, e)) return;
  const limit = sub.hook.limit;
  const key = limitKey(sub, e);
  if (limit && key) {
    const store = limit.per === 'encounter' ? r.d.counters : r.d.turnFlags;
    const uses = evalNum(limit.uses ?? 1, sub.stacks, r.d.counters);
    if ((store[key] ?? 0) >= uses) return;
    store[key] = (store[key] ?? 0) + 1;
  }
  r.d.stats.triggers += 1;
  const effects = typeof sub.hook.effects === 'function' ? sub.hook.effects(sub.stacks) : sub.hook.effects;
  for (const eff of effects) applyEffect(r, eff, sub, e);
}

function resolveTargets(r: Resolver, ref: TargetRef, e: GameEvent): string[] {
  switch (ref) {
    case 'actor':
      return e.actorId && r.d.pieces[e.actorId] ? [e.actorId] : [];
    case 'target':
      return e.targetId && r.d.pieces[e.targetId] ? [e.targetId] : [];
    case 'allyQueens': {
      const side = e.targetSide ?? e.side ?? 'player';
      return Object.values(r.d.pieces)
        .filter((p) => p.side === side && p.type === 'queen')
        .map((p) => p.id);
    }
  }
}

export function relativeExpiry(r: Resolver, rel: RelativeExpiry, stacks: number) {
  return { at: rel.at, turn: r.d.turn + evalNum(rel.turnOffset, stacks, r.d.counters) };
}

export function applyEffect(r: Resolver, eff: EffectDef, sub: HookSubscriber, e: GameEvent): void {
  const name = stackedName(sub.name, sub.stacks);
  const d = r.d;
  switch (eff.type) {
    case 'ADD_COUNTER': {
      const amount = evalNum(eff.amount, sub.stacks, d.counters);
      const before = d.counters[eff.counter] ?? 0;
      d.counters[eff.counter] = before + amount;
      r.log('trigger', `${name}: ${eff.label} ${before} → ${before + amount}`);
      break;
    }
    case 'ADD_PIECE_COUNTER': {
      const amount = evalNum(eff.amount, sub.stacks, d.counters);
      const ids = resolveTargets(r, eff.target, e);
      for (const id of ids) {
        const p = d.pieces[id];
        patchPiece(d, id, { counters: { ...p.counters, [eff.counter]: (p.counters[eff.counter] ?? 0) + amount } });
      }
      if (ids.length) r.log('trigger', `${name}: ${eff.label}`);
      break;
    }
    case 'GRANT_ACTION': {
      const count = evalNum(eff.count, sub.stacks, d.counters);
      const rest = eff.restriction ?? {};
      for (let i = 0; i < count; i++) {
        const token: Omit<ActionToken, 'id'> = { source: sub.upgradeId, label: `${name}: ${eff.label}` };
        if (rest.pieceTypes) token.pieceTypes = rest.pieceTypes;
        if (rest.excludeTypes) token.excludeTypes = rest.excludeTypes;
        if (rest.nonCapturing) token.nonCapturing = true;
        if (rest.actorOnly && e.actorId) token.pieceId = e.actorId;
        if (rest.excludeActor && e.actorId) token.excludePieceId = e.actorId;
        grantAction(r, token);
      }
      if (count > 0) r.log('trigger', `${name}: ${count > 1 ? `${count} extra actions` : 'extra action'} (${eff.label})`);
      break;
    }
    case 'ADD_WARD': {
      const count = evalNum(eff.count, sub.stacks, d.counters);
      const ids = resolveTargets(r, eff.target, e);
      for (const id of ids) addWard(r, id, count, sub.upgradeId, eff.until ? relativeExpiry(r, eff.until, sub.stacks) : undefined);
      if (ids.length) r.log('trigger', `${name}: +${count} Ward${count > 1 ? 's' : ''}`);
      break;
    }
    case 'APPLY_STATUS': {
      const phases = evalNum(eff.phases, sub.stacks, d.counters);
      let ids: string[];
      if (eff.target === 'adjacentEnemiesOfActor') {
        const actor = e.actorId ? d.pieces[e.actorId] : undefined;
        ids = actor
          ? neighbours(actor.sq)
              .map((sq) => d.board[sq])
              .filter((id): id is string => !!id && d.pieces[id].side !== actor.side)
          : [];
      } else {
        ids = resolveTargets(r, eff.target, e);
      }
      for (const id of ids) immobilize(r, id, phases, sub.upgradeId);
      if (ids.length) {
        const names = ids.map((id) => `${PIECE_NAME[d.pieces[id].type]} ${sqName(d.pieces[id].sq)}`).join(', ');
        r.log('trigger', `${name}: ${names} Immobilized`, 1, ids.map((id) => d.pieces[id].sq));
      }
      break;
    }
    case 'MARK_PATH': {
      const path = e.path ?? [];
      if (path.length === 0) break;
      const until = relativeExpiry(r, eff.until, sub.stacks);
      for (const sq of path) markSquare(r, sq, eff.mark, 'player', sub.upgradeId, until);
      r.log('trigger', `${name}: ${path.map(sqName).join(', ')} become ${eff.mark.toLowerCase()}`, 1, path);
      break;
    }
    case 'CUSTOM': {
      const fn = CUSTOM_EFFECTS[eff.name];
      if (!fn) throw new Error(`Unknown custom effect: ${eff.name}`);
      fn.run(r, e, sub, eff.params ?? {});
      break;
    }
  }
}
