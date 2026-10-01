import { rankOf, sqOf, type Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import type { OwnedUpgrade } from '../core/state';
import { hasUpgradeDef, upgradeDef } from '../rules/registry';
import type { RosterEffect } from '../rules/types';
import type { RosterPiece } from './roster';

/**
 * Roster and formation operations (B6, B11). The roster is the persistent
 * list of the player's pieces; each has a formation square inside the
 * deployment zone or sits in Reserve (sq = null).
 */

/** Ranks 1–2, plus rank 3 with Forward Deployment, plus chosen rank-4 squares. */
export function deploymentZone(rank3: boolean, rank4: readonly Sq[] = []): Sq[] {
  const out: Sq[] = [];
  for (let r = 0; r <= (rank3 ? 2 : 1); r++) for (let f = 0; f < 8; f++) out.push(sqOf(f, r));
  for (const sq of rank4) if (rankOf(sq) === 3 && !out.includes(sq)) out.push(sq);
  return out;
}

/** Preferred free formation square for a new piece of `type`, or null (Reserve). */
export function freeFormationSquare(roster: readonly RosterPiece[], type: PieceType, zone: readonly Sq[]): Sq | null {
  const taken = new Set(roster.filter((r) => r.sq !== null).map((r) => r.sq as Sq));
  const free = zone.filter((sq) => !taken.has(sq));
  if (!free.length) return null;
  // Pawns prefer the front of the zone; pieces prefer the back rank.
  const rankPref = (sq: Sq) => {
    const rk = rankOf(sq);
    return type === 'pawn' ? -rk : rk;
  };
  const centre = (sq: Sq) => Math.abs((sq & 7) - 3.5);
  free.sort((a, b) => rankPref(a) - rankPref(b) || centre(a) - centre(b) || a - b);
  return free[0];
}

export function nextRosterId(roster: readonly RosterPiece[]): string {
  let n = roster.length;
  const ids = new Set(roster.map((r) => r.id));
  while (ids.has(`n${n}`)) n++;
  return `n${n}`;
}

export function addRosterPiece(roster: readonly RosterPiece[], type: PieceType, zone: readonly Sq[]): RosterPiece[] {
  return [...roster, { id: nextRosterId(roster), type, sq: freeFormationSquare(roster, type, zone) }];
}

export function applyRosterEffect(roster: readonly RosterPiece[], effect: RosterEffect, zone: readonly Sq[]): RosterPiece[] {
  switch (effect.type) {
    case 'ADD_PIECE': {
      let out = roster.slice();
      for (let i = 0; i < effect.count; i++) out = addRosterPiece(out, effect.pieceType, zone);
      return out;
    }
    case 'REMOVE_FILE_PAWNS':
      return roster.filter((r) => !(r.type === 'pawn' && r.sq !== null && effect.files.includes(r.sq & 7) && rankOf(r.sq) === 1));
  }
}

/** Sandbox helper: a roster with every ROSTER effect of the given upgrades applied (once per stack). */
export function rosterWithUpgrades(base: readonly RosterPiece[], upgrades: readonly OwnedUpgrade[], zone: readonly Sq[]): RosterPiece[] {
  let roster = base.slice();
  for (const u of upgrades.slice().sort((a, b) => a.order - b.order)) {
    if (!hasUpgradeDef(u.id)) continue;
    const def = upgradeDef(u.id);
    for (let s = 0; s < u.stacks; s++) for (const eff of def.roster ?? []) roster = applyRosterEffect(roster, eff, zone);
  }
  return roster;
}
