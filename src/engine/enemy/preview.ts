import { PIECE_NAME, type PieceType } from '../core/pieces';
import type { EncounterState, Intent } from '../core/state';
import { createGenContext, hasMark, pieceMoves } from '../moves/generate';

/** What each committed intent would do if the enemy phase started now (UI preview). */
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
  const ctx = createGenContext(state);
  return state.intents.map((intent, index) => {
    const p = state.pieces[intent.pieceId];
    let reason: string | null = null;
    if (!p) reason = 'piece captured';
    else if (p.statuses.some((s) => s.type === 'IMMOBILIZED')) reason = 'piece immobilized';
    else if (hasMark(ctx, intent.to, 'CONSECRATED', 'player')) reason = 'destination consecrated';
    else if (!pieceMoves(ctx, intent.pieceId).some((m) => m.to === intent.to)) {
      const occ = state.board[intent.to];
      reason = occ && state.pieces[occ].side === 'enemy' ? 'destination occupied' : 'path blocked';
    }
    const occId = state.board[intent.to];
    const victim = occId && state.pieces[occId].side === 'player' ? state.pieces[occId] : null;
    const wards = victim ? victim.wards + victim.tempWards.reduce((n, w) => n + w.count, 0) : 0;
    return {
      intent,
      index,
      willLand: reason === null,
      fizzleReason: reason,
      victimId: victim?.id ?? null,
      victimType: victim?.type ?? null,
      blockedByWard: wards > 0,
    };
  });
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
