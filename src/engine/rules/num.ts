import type { Piece } from '../core/state';
import type { NumExpr } from './types';

/** Evaluate a stack/counter-dependent number from the DSL. */
export function evalNum(e: NumExpr, stacks: number, counters?: Record<string, number>, piece?: Piece): number {
  if (typeof e === 'number') return e;
  if (e === 'stacks') return stacks;
  let v = (e.base ?? 0) + (e.perStack ?? 0) * stacks;
  if (e.counter) v += counters?.[e.counter] ?? 0;
  if (e.pieceCounter) v += piece?.counters[e.pieceCounter] ?? 0;
  if (e.min !== undefined) v = Math.max(e.min, v);
  if (e.max !== undefined) v = Math.min(e.max, v);
  return v;
}

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Stack counts display as roman numerals ("Crusade III"). */
export function roman(n: number): string {
  let out = '';
  let rest = n;
  for (const [v, s] of ROMAN) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

export const stackedName = (name: string, stacks: number): string => (stacks > 1 ? `${name} ${roman(stacks)}` : name);
