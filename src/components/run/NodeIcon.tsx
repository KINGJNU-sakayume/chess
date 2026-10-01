import type { NodeType } from '../../engine/run/types';
import { NODE_COLOR } from './nodeMeta';

/** Small glyphs for map nodes. */
const PATHS: Record<NodeType, React.ReactNode> = {
  combat: <path d="M20 78 L60 38 M30 30 L70 70 M58 30 L70 30 L70 42 M20 66 L32 78 M66 78 L78 66 M42 30 L30 42" strokeWidth="9" strokeLinecap="round" fill="none" stroke="currentColor" />,
  elite: (
    <g>
      <path d="M50 14 C30 14 18 30 18 48 C18 62 26 70 32 74 L32 86 L68 86 L68 74 C74 70 82 62 82 48 C82 30 70 14 50 14 Z" />
      <circle cx="38" cy="50" r="8" fill="#15111b" />
      <circle cx="62" cy="50" r="8" fill="#15111b" />
    </g>
  ),
  boss: <path d="M14 76 L20 30 L38 52 L50 22 L62 52 L80 30 L86 76 Z M14 82 H86 V90 H14 Z" />,
  upgrade: <path d="M50 12 L78 46 H60 V88 H40 V46 H22 Z" />,
  shop: (
    <g>
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="9" />
      <path d="M50 28 V72 M38 38 H58 C66 38 66 50 58 50 H42 C34 50 34 62 42 62 H62" stroke="currentColor" strokeWidth="7" fill="none" />
    </g>
  ),
  mutation: (
    <g>
      <rect x="16" y="16" width="30" height="30" />
      <rect x="54" y="54" width="30" height="30" />
      <rect x="54" y="16" width="30" height="30" opacity="0.4" />
      <rect x="16" y="54" width="30" height="30" opacity="0.4" />
    </g>
  ),
  recruit: (
    <g>
      <circle cx="42" cy="30" r="12" />
      <path d="M30 46 H54 L58 84 H26 Z" />
      <path d="M72 30 V58 M58 44 H86" stroke="currentColor" strokeWidth="8" />
    </g>
  ),
  event: <path d="M36 34 C36 20 64 20 64 34 C64 46 50 46 50 60 M50 74 V80" stroke="currentColor" strokeWidth="10" strokeLinecap="round" fill="none" />,
  sacrifice: <path d="M50 10 C60 30 76 38 70 60 C66 76 56 86 50 88 C44 86 34 76 30 60 C24 38 40 30 50 10 Z" />,
};

export function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" style={{ color: NODE_COLOR[type] }} aria-hidden="true">
      {PATHS[type]}
    </svg>
  );
}
