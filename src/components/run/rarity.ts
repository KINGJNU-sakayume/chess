import type { Rarity } from '../../engine/rules/types';

export const RARITY_STYLE: Record<Rarity, { label: string; ring: string; text: string; glow: string }> = {
  common: { label: 'Common', ring: 'border-ink-500', text: 'text-ink-200', glow: '' },
  uncommon: { label: 'Uncommon', ring: 'border-arcane-500', text: 'text-arcane-300', glow: 'shadow-[0_0_18px_rgba(94,200,214,0.25)]' },
  rare: { label: 'Rare', ring: 'border-gold-500', text: 'text-gold-300', glow: 'shadow-[0_0_22px_rgba(232,196,106,0.3)]' },
  legendary: { label: 'Legendary', ring: 'border-violet-400', text: 'text-violet-300', glow: 'shadow-[0_0_26px_rgba(180,140,255,0.4)]' },
};
