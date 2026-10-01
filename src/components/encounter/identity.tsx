import type { ReactNode } from 'react';
import type { PieceType } from '../../engine/core/pieces';
import type { EncounterState, Piece } from '../../engine/core/state';
import { compileRules } from '../../engine/rules/compile';

/**
 * Visual build identity (F4): pieces are never replaced, only layered —
 * glows and base rings whose intensity grows with the upgrades that touch the
 * piece type.
 */
export const TYPE_AURA: Record<PieceType, string> = {
  pawn: '120, 220, 160',
  knight: '94, 200, 214',
  bishop: '232, 196, 106',
  rook: '170, 185, 210',
  queen: '200, 140, 255',
  king: '255, 150, 110',
};

const stackCache = new WeakMap<object, Record<string, number>>();

export function buildDepth(state: EncounterState): Record<string, number> {
  const cached = stackCache.get(state.rules);
  if (cached) return cached;
  const rules = compileRules(state.rules);
  const depth: Record<string, number> = {};
  for (const [id, owned] of rules.owned) {
    const def = rules.defs.get(id)!;
    for (const t of def.affects) depth[t] = (depth[t] ?? 0) + owned.stacks;
  }
  stackCache.set(state.rules, depth);
  return depth;
}

export function pieceAura(state: EncounterState, p: Piece): ReactNode {
  const depth = buildDepth(state)[p.type] ?? 0;
  if (depth <= 0) return null;
  const rgb = TYPE_AURA[p.type];
  const strength = Math.min(1, 0.25 + depth * 0.12);
  const rings = Math.min(3, Math.ceil(depth / 3));
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-[10%] rounded-full"
        style={{ background: `radial-gradient(circle, rgba(${rgb}, ${0.55 * strength}) 0%, rgba(${rgb}, 0) 70%)` }}
      />
      {Array.from({ length: rings }, (_, i) => (
        <div
          key={i}
          className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
          style={{
            bottom: `${6 + i * 3}%`,
            width: `${70 - i * 10}%`,
            height: '12%',
            border: `2px solid rgba(${rgb}, ${0.8 - i * 0.2})`,
            boxShadow: `0 0 8px rgba(${rgb}, 0.6)`,
          }}
        />
      ))}
    </div>
  );
}
