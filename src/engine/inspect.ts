import { sqName } from './core/coords';
import { totalWards } from './core/draft';
import { PIECE_NAME, type PieceType, type Side } from './core/pieces';
import type { EncounterState, Piece } from './core/state';
import { describeExpiry } from './core/time';
import { compileRules } from './rules/compile';
import { evalNum, stackedName } from './rules/num';
import type { Rarity } from './rules/types';
import { SQUARE_INFO } from '../data/squares';

/** Piece inspection (F2): everything that changes how this piece plays. */
export interface PieceInspection {
  title: string;
  side: Side;
  base: string;
  modifiers: { id: string; name: string; detail: string; note?: string; active: boolean; rarity?: Rarity }[];
  /** Square effects under the piece (board mutations, Sanctuaries, Consecrated squares…). */
  squares: { name: string; text: string; mine: boolean }[];
  statuses: string[];
  tags: string[];
}

export const BASE_TEXT: Record<PieceType, string> = {
  pawn: 'Moves 1 forward (2 from its home rank), captures diagonally forward, promotes on the last rank',
  knight: 'Leaps in an L-shape over other pieces',
  bishop: 'Diagonal movement',
  rook: 'Orthogonal movement',
  queen: 'Diagonal and orthogonal movement',
  king: 'One square in any direction; castling (player only)',
};

export function inspectPiece(state: EncounterState, pieceId: string): PieceInspection | null {
  const p = state.pieces[pieceId];
  if (!p) return null;
  return inspectPieceLike(state, p);
}

export function inspectPieceLike(state: EncounterState, p: Piece): PieceInspection {
  const rules = compileRules(state.rules);
  const modifiers: PieceInspection['modifiers'] = [];
  if (p.side === 'player') {
    for (const [id, owned] of rules.owned) {
      const def = rules.defs.get(id)!;
      if (!def.affects.includes(p.type)) continue;
      let note: string | undefined;
      let active = true;
      for (const c of def.counters ?? []) {
        const v = state.counters[c.id] ?? 0;
        const next = (c.thresholds ?? []).find((t) => t > v);
        const reached = (c.thresholds ?? []).filter((t) => t <= v);
        note = `${c.label} ${v}${next !== undefined ? `/${next}` : ''}${reached.length ? ` — tier ${reached.length} active` : ''}`;
      }
      const mods = def.moveModifiers?.filter((m) => (Array.isArray(m.pieceType) ? m.pieceType : [m.pieceType]).includes(p.type)) ?? [];
      if (mods.length && mods.every((m) => m.when)) {
        active = mods.some((m) => {
          const w = m.when!;
          if (w.counterAtLeast && (state.counters[w.counterAtLeast[0]] ?? 0) < evalNum(w.counterAtLeast[1], owned.stacks)) return false;
          if (w.pieceCapturesAtLeast !== undefined && p.captures < evalNum(w.pieceCapturesAtLeast, owned.stacks)) return false;
          if (w.pieceCounterAtLeast && (p.counters[w.pieceCounterAtLeast[0]] ?? 0) < evalNum(w.pieceCounterAtLeast[1], owned.stacks)) return false;
          return true;
        });
      }
      if (def.id === 'pawn_veteran') note = `${p.captures} capture${p.captures === 1 ? '' : 's'} this encounter`;
      modifiers.push({ id, name: stackedName(def.name, owned.stacks), detail: def.describe(owned.stacks), note, active, rarity: def.rarity });
    }
  } else {
    if (p.type === 'queen' && rules.heavyQueenRange !== null) {
      modifiers.push({ id: 'heavy_queen', name: 'Heavy Queen', detail: `Range limited to ${rules.heavyQueenRange} squares`, active: true });
    }
    for (const a of rules.affixes) {
      modifiers.push({ id: a.id, name: a.name, detail: a.description, active: true });
    }
  }
  const statuses: string[] = [];
  const wards = totalWards(p);
  if (p.wards > 0) statuses.push(`Ward ×${p.wards}`);
  for (const w of p.tempWards) statuses.push(`Ward ×${w.count} (${describeExpiry(w.expires)})`);
  if (wards === 0 && !p.statuses.length) statuses.push('—');
  for (const s of p.statuses) statuses.push(`Immobilized (${describeExpiry(s.expires)})`);
  for (const [k, v] of Object.entries(p.counters)) if (v) statuses.push(`${k === 'gambit' ? 'Gambit pierce' : k} ${v}`);
  const tags = p.tags.map((t) =>
    t === 'target' ? 'Marked target' : t === 'escapee' ? 'Must escape' : t === 'protectee' ? 'Must survive' : t === 'boss' ? 'Boss' : 'Locked start',
  );
  const squares = state.marks
    .filter((m) => m.sq === p.sq && !m.suppressed)
    .map((m) => ({ name: SQUARE_INFO[m.type].name, text: SQUARE_INFO[m.type].text, mine: m.side === p.side }));
  return {
    title: `${PIECE_NAME[p.type].toUpperCase()} (${sqName(p.sq)})`,
    side: p.side,
    base: p.promotedFrom ? `${BASE_TEXT[p.type]} (promoted Pawn)` : BASE_TEXT[p.type],
    modifiers,
    squares,
    statuses,
    tags,
  };
}
