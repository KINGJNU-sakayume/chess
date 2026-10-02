import type { BehaviorProfile } from '../engine/core/state';

/**
 * Enemy behaviour profiles (B4): how much each planning term weighs. Tuning
 * these changes how an encounter *feels* (reckless, turtling, racing,
 * hunting) without touching search depth, which is always one ply.
 */
export interface ProfileWeights {
  /** Value of captures. */
  capture: number;
  /** Value of attacking the player's King. */
  check: number;
  /** Fear of landing where the player can capture the mover. */
  safety: number;
  /** Progress toward the profile's goal (the hunted piece, the promotion rank, the line). */
  goal: number;
  /** Shielding the enemy King. */
  protect: number;
}

export const PROFILE_WEIGHTS: Record<BehaviorProfile['kind'], ProfileWeights> = {
  aggressive: { capture: 1.0, check: 1.0, safety: 0.45, goal: 0.7, protect: 0.15 },
  guard_king: { capture: 0.75, check: 0.45, safety: 0.9, goal: 0.35, protect: 1.0 },
  hold_line: { capture: 0.85, check: 0.45, safety: 0.9, goal: 0.8, protect: 0.4 },
  race_promotion: { capture: 0.6, check: 0.3, safety: 0.55, goal: 1.3, protect: 0.25 },
  hunter: { capture: 0.7, check: 0.6, safety: 0.5, goal: 1.1, protect: 0.2 },
};

/** Planner bonus for an intent whose destination covers one of a hunted King's escape squares. */
export const NET_BONUS = 45;
