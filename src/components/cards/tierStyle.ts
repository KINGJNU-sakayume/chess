import type { Tier } from '../../engine/augments/cards';

/** Frame class, accent colour, glow and badge classes per tier. */
export const TIER_STYLE: Record<Tier, { frame: string; accent: string; glow: string; badge: string }> = {
  silver: { frame: 'tier-silver', accent: '#e3e8f0', glow: 'rgba(200, 210, 225, 0.30)', badge: 'bg-[#cfd6e0] text-[#1d2330]' },
  gold: { frame: 'tier-gold', accent: '#f3d98f', glow: 'rgba(232, 196, 106, 0.38)', badge: 'bg-gold-400 text-[#2a1d05]' },
  prism: { frame: 'tier-prism', accent: '#dccbff', glow: 'rgba(180, 140, 255, 0.45)', badge: 'tier-prism text-[#1b1230]' },
};
