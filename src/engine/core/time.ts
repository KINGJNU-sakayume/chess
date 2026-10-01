import type { Expiry, TimePoint } from './state';

const ORDER: readonly TimePoint[] = ['turnStart', 'turnEnd', 'phaseStart', 'phaseEnd'];

/** Monotonic index of a time point within the encounter. */
export const timeIndex = (e: Expiry): number => e.turn * 4 + ORDER.indexOf(e.at);

/** True once `now` has reached the expiry point. */
export const hasExpired = (e: Expiry, now: Expiry): boolean => timeIndex(e) <= timeIndex(now);

export function describeExpiry(e: Expiry): string {
  switch (e.at) {
    case 'turnStart':
      return `until the start of turn ${e.turn}`;
    case 'turnEnd':
      return `until the end of turn ${e.turn}`;
    case 'phaseStart':
      return `until enemy phase ${e.turn} begins`;
    default:
      return `through enemy phase ${e.turn}`;
  }
}
