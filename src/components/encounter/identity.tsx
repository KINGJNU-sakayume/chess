import type { EncounterState, Piece } from '../../engine/core/state';
import type { Primitive } from '../../engine/rules/types';
import { buildDepth, pieceSigils, SIGIL_LABEL, TYPE_AURA } from './buildIdentity';

/**
 * Visual build identity (F4), drawing side: a glow and base rings that grow
 * with the upgrades touching the piece type, and primitive sigils.
 */
export function PieceAura({ state, p }: { state: EncounterState; p: Piece }) {
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

function SigilGlyph({ prim }: { prim: Primitive }) {
  switch (prim) {
    case 'MOVE_PATTERN':
      return <path d="M50 14 V86 M14 50 H86 M50 14 l-12 14 M50 14 l12 14 M86 50 l-14 -12 M86 50 l-14 12" />;
    case 'PIERCE':
      return <path d="M18 24 L46 50 L18 76 M50 24 L78 50 L50 76" />;
    case 'EXTRA_ACTION':
      return <path d="M50 10 L60 40 L90 50 L60 60 L50 90 L40 60 L10 50 L40 40 Z" fill="currentColor" />;
    case 'WARD':
      return <path d="M50 10 L84 22 V48 C84 70 68 84 50 92 C32 84 16 70 16 48 V22 Z" />;
    case 'STATUS':
      return <path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31" />;
    case 'PROMOTION_RULE':
      return <path d="M14 78 L20 30 L38 52 L50 22 L62 52 L80 30 L86 78 Z" />;
    case 'REPOSITION':
      return <path d="M78 36 A30 30 0 1 0 82 58 M78 36 L80 16 M78 36 L58 34" />;
    default:
      return <circle cx="50" cy="50" r="30" />;
  }
}

/** Up to three tiny sigils in the piece's top-left corner, tinted by its type's aura. */
export function PieceSigils({ state, p }: { state: EncounterState; p: Piece }) {
  if (p.side !== 'player') return null;
  const sigils = pieceSigils(state, p.type).slice(0, 3);
  if (!sigils.length) return null;
  const rgb = TYPE_AURA[p.type];
  return (
    <div className="absolute left-[3%] top-[3%] flex gap-[2%]" title={sigils.map((x) => SIGIL_LABEL[x]).join(' · ')}>
      {sigils.map((prim) => (
        <svg
          key={prim}
          viewBox="0 0 100 100"
          className="h-[min(12px,1.5vmin)] w-[min(12px,1.5vmin)] rounded-full p-[1px] opacity-90"
          style={{ color: `rgb(${rgb})`, background: 'rgba(14, 11, 18, 0.7)', boxShadow: `0 0 3px rgba(${rgb}, 0.7)` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <SigilGlyph prim={prim} />
        </svg>
      ))}
    </div>
  );
}
