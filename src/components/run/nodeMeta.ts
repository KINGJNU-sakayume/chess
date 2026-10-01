import type { NodeType } from '../../engine/run/types';

export const NODE_LABEL: Record<NodeType, string> = {
  combat: 'Combat',
  elite: 'Elite',
  boss: 'Boss',
  upgrade: 'Upgrade',
  shop: 'Shop',
  mutation: 'Board Mutation',
  recruit: 'Recruitment',
  event: 'Event',
  sacrifice: 'Sacrifice',
};

export const NODE_COLOR: Record<NodeType, string> = {
  combat: '#e5675d',
  elite: '#f2958c',
  boss: '#e8c46a',
  upgrade: '#5ec8d6',
  shop: '#e8c46a',
  mutation: '#b48cff',
  recruit: '#7fe0a8',
  event: '#cbc1d8',
  sacrifice: '#ff8a5c',
};
