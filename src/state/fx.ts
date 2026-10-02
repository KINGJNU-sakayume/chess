import { chebyshev, type Sq } from '../engine/core/coords';
import type { Side } from '../engine/core/pieces';
import type { EncounterState, Piece } from '../engine/core/state';

/**
 * Juice (F5): visual effects derived from the difference between two displayed
 * frames — the new combat-log entries plus piece changes. Pure data, so the
 * board stays a pure view and effects can never disagree with the log.
 */
export type FxKind = 'trail' | 'capture' | 'pulse' | 'popup' | 'promotion' | 'flash' | 'extra';

export type FxTone =
  | 'bishop' // long Bishop move: golden diagonal light
  | 'slide' // other long player slides
  | 'enemy' // long enemy slides
  | 'trigger'
  | 'ward'
  | 'blocked'
  | 'immobile'
  | 'fizzle'
  | 'gold' // player promotion
  | 'mass'; // enemy (mass) promotion

export interface FxEvent {
  kind: FxKind;
  /** Delay before the effect starts, in ms at 1× (chained triggers fire one after another). */
  delay: number;
  tone?: FxTone;
  sq?: Sq;
  from?: Sq;
  to?: Sq;
  text?: string;
  side?: Side;
  /** Popups on the same square stack upwards instead of overlapping. */
  lane?: number;
}

/** Spacing of chained effects at 1×. */
export const FX_STEP = 110;

/** "Long Cathedral II: extra action (other Bishop)" → "Long Cathedral II". */
export function popupLabel(text: string): string {
  const head = text.split(':')[0].trim();
  return head.length > 26 ? `${head.slice(0, 25)}…` : head;
}

const wardsOf = (p: Piece) => p.wards + p.tempWards.reduce((n, w) => n + w.count, 0);
const immobile = (p: Piece) => p.statuses.some((s) => s.type === 'IMMOBILIZED');

export function deriveFx(prev: EncounterState, next: EncounterState): FxEvent[] {
  if (prev === next || prev.config.id !== next.config.id) return [];
  const lastId = prev.log.length ? prev.log[prev.log.length - 1].id : -1;
  const fresh = next.log.filter((l) => l.id > lastId);
  // Undo or restart: the log went backwards — nothing to celebrate.
  if (next.log.length < prev.log.length) return [];

  const out: FxEvent[] = [];
  let step = 0;
  let anchor: Sq | null = null;
  const at = () => step * FX_STEP;

  for (const l of fresh) {
    const sqs = l.sqs ?? [];
    switch (l.kind) {
      case 'move':
      case 'enemy': {
        // Boss and enemy announcements (anything but a from → to move) become a banner across the top of the board.
        const isMove = sqs.length === 2 && l.text.includes('→');
        if (l.kind === 'enemy' && l.depth === 0 && !isMove) {
          out.push({ kind: 'popup', tone: 'enemy', text: l.text.length > 64 ? `${l.text.slice(0, 63)}…` : l.text, delay: at() });
          step += 1;
          break;
        }
        if (l.depth !== 0 || !isMove) break;
        const [from, to] = sqs;
        anchor = to;
        const moverId = prev.board[from] ?? next.board[to];
        const mover = moverId ? (prev.pieces[moverId] ?? next.pieces[moverId]) : undefined;
        if (!mover) break;
        const dist = chebyshev(from, to);
        if (mover.side === 'player' && mover.type === 'bishop' && dist >= 2) out.push({ kind: 'trail', tone: 'bishop', from, to, delay: at(), side: 'player' });
        else if ((mover.type === 'rook' || mover.type === 'queen' || mover.type === 'bishop') && dist >= 3) {
          out.push({ kind: 'trail', tone: mover.side === 'player' ? 'slide' : 'enemy', from, to, delay: at(), side: mover.side });
        }
        break;
      }
      case 'capture':
        if (sqs.length) out.push({ kind: 'capture', sq: sqs[0], delay: at() });
        step += 1;
        break;
      case 'trigger': {
        const where = sqs.length ? sqs : anchor !== null ? [anchor] : [];
        for (const sq of where.slice(0, 4)) out.push({ kind: 'pulse', tone: 'trigger', sq, delay: at() });
        out.push({ kind: 'popup', tone: 'trigger', sq: where[0], text: popupLabel(l.text), delay: at() });
        step += 1;
        break;
      }
      case 'blocked':
        if (sqs.length) {
          out.push({ kind: 'pulse', tone: 'blocked', sq: sqs[0], delay: at() });
          out.push({ kind: 'popup', tone: 'blocked', sq: sqs[0], text: 'Ward!', delay: at() });
        }
        step += 1;
        break;
      case 'fizzle': {
        const sq = sqs[1] ?? sqs[0];
        if (sq !== undefined) {
          out.push({ kind: 'pulse', tone: 'fizzle', sq, delay: at() });
          out.push({ kind: 'popup', tone: 'fizzle', sq, text: 'Fizzled', delay: at() });
        }
        step += 1;
        break;
      }
      default:
        break;
    }
  }

  // Piece changes the log does not pinpoint: promotions, new Wards, fresh immobilizations.
  const promoted: Piece[] = [];
  for (const id in next.pieces) {
    const p = next.pieces[id];
    const before = prev.pieces[id];
    if (!before) continue;
    if (before.type !== p.type) promoted.push(p);
    else if (wardsOf(p) > wardsOf(before)) out.push({ kind: 'pulse', tone: 'ward', sq: p.sq, delay: at() });
    if (immobile(p) && !immobile(before)) out.push({ kind: 'pulse', tone: 'immobile', sq: p.sq, delay: at() });
  }
  if (promoted.length) {
    const enemy = promoted.some((p) => p.side === 'enemy');
    const tone: FxTone = enemy ? 'mass' : 'gold';
    out.push({ kind: 'flash', tone, sq: promoted[0].sq, delay: at() });
    promoted.forEach((p, i) => out.push({ kind: 'promotion', tone, sq: p.sq, side: p.side, delay: at() + i * 40 }));
    if (promoted.length >= 3) out.push({ kind: 'popup', tone, sq: promoted[0].sq, text: `Mass promotion ×${promoted.length}`, delay: at() });
  }

  // Extra actions granted during the same Player Turn get their own flourish.
  if (prev.phase === 'player' && next.phase === 'player' && prev.turn === next.turn) {
    const gained = next.actions.filter((t) => !prev.actions.some((o) => o.id === t.id));
    if (gained.length) {
      out.push({ kind: 'extra', sq: anchor ?? undefined, text: `+${gained.length} action${gained.length > 1 ? 's' : ''}`, delay: at() });
    }
  }
  const lanes = new Map<string, number>();
  for (const e of out) {
    if (e.kind !== 'popup' && e.kind !== 'extra') continue;
    const key = String(e.sq ?? 'board');
    e.lane = lanes.get(key) ?? 0;
    lanes.set(key, e.lane + 1);
  }
  return out;
}

/** How long an effect lives at 1× (ms), so the layer can drop it afterwards. */
export function fxDuration(e: FxEvent): number {
  switch (e.kind) {
    case 'trail':
      return e.tone === 'bishop' ? 900 : 600;
    case 'flash':
      return 700;
    case 'popup':
    case 'extra':
      return 1100;
    case 'promotion':
      return 900;
    default:
      return 650;
  }
}
