import { PIECE_NAME, type PieceType } from '../core/pieces';
import { totalWards } from '../core/draft';
import type { EncounterState, Intent } from '../core/state';
import { createGenContext, hasMark, pieceMoves } from '../moves/generate';
import { makeHypo, mutableCopy, retarget } from '../moves/hypo';

/**
 * What each committed intent would do if the enemy phase started now (UI
 * preview). Intents are simulated in order on a hypothetical board, exactly as
 * they execute — so chained intents of one piece (bosses) are previewed from
 * where the previous step leaves it.
 */
export interface IntentPreview {
  intent: Intent;
  index: number;
  willLand: boolean;
  fizzleReason: string | null;
  victimId: string | null;
  victimType: PieceType | null;
  /** The victim has a Ward that would block the capture. */
  blockedByWard: boolean;
}

export function previewIntents(state: EncounterState): IntentPreview[] {
  const out: IntentPreview[] = [];
  runIntents(state, (p) => out.push(p));
  return out;
}

/** The board as it would stand after every committed intent resolves (bot look-ahead; no triggers). */
export function projectIntents(state: EncounterState): EncounterState {
  return runIntents(state, () => {});
}

function runIntents(state: EncounterState, visit: (p: IntentPreview) => void): EncounterState {
  const h = mutableCopy(state);
  let ctx = createGenContext(h);
  // A piece whose step fails abandons the rest of its route (chained boss intents).
  const broken = new Set<string>();
  state.intents.forEach((intent, index) => {
    const p = h.pieces[intent.pieceId];
    let reason: string | null = null;
    let move = null;
    if (!p) reason = 'piece captured';
    else if (broken.has(intent.pieceId)) reason = 'route broken';
    else if (p.statuses.some((s) => s.type === 'IMMOBILIZED')) reason = 'piece immobilized';
    else if (hasMark(ctx, intent.to, 'CONSECRATED', 'player')) reason = 'destination consecrated';
    else {
      move = pieceMoves(ctx, intent.pieceId).find((m) => m.to === intent.to) ?? null;
      if (!move) {
        const occ = h.board[intent.to];
        reason = occ && h.pieces[occ].side === 'enemy' ? 'destination occupied' : 'path blocked';
      }
    }
    const occId = h.board[intent.to];
    const victim = occId && h.pieces[occId].side === 'player' ? h.pieces[occId] : null;
    const wards = victim ? totalWards(victim) : 0;
    if (move) {
      // A Ward-blocked capture spends the Ward and leaves the attacker where it was.
      makeHypo(h, move, { wards: true });
      ctx = retarget(ctx, h);
    }
    if (reason !== null || wards > 0) broken.add(intent.pieceId);
    visit({
      intent,
      index,
      willLand: reason === null,
      fizzleReason: reason,
      victimId: victim?.id ?? null,
      victimType: victim?.type ?? null,
      blockedByWard: wards > 0,
    });
  });
  return h;
}

export function intentText(p: IntentPreview): string {
  const i = p.intent;
  const name = PIECE_NAME[i.pieceType];
  const sq = (n: number) => 'abcdefgh'[n & 7] + String((n >> 3) + 1);
  const base = `${name} ${sq(i.from)} → ${sq(i.to)}`;
  if (!p.willLand) return `${base} · fizzles (${p.fizzleReason})`;
  if (p.victimType) return `${base} · captures ${PIECE_NAME[p.victimType]}${p.blockedByWard ? ' (Ward blocks)' : ''}`;
  return base;
}
