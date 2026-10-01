import { beginDraft, pushLog, snapshot, type Draft } from '../core/draft';
import type { Sq } from '../core/coords';
import type { EncounterState, LogKind } from '../core/state';
import { compileRules, type CompiledRules, type HookSubscriber } from './compile';
import { BUILTIN_SUBSCRIBERS, type BuiltinSubscriber } from './builtins';
import { runHook } from '../effects/apply';
import type { GameEvent, GameEventType } from './types';

/**
 * Layer C — the RuleEngine's event bus. Triggered events go into a FIFO queue;
 * effects that emit further events enqueue them behind current items
 * (breadth-first). Subscribers to one event resolve by priority → acquisition
 * order → upgrade id (D4).
 */

/**
 * Re-entrancy guard (D4). This is a technical safety limit, not a build cap:
 * a single action may resolve at most this many trigger events.
 */
export const CASCADE_LIMIT = 256;

export interface ResolveOptions {
  /** Skip combat-log output (AI planning and validator playouts). */
  silent?: boolean;
  /** Collect intermediate states for animation. */
  frames?: boolean;
}

type Subscriber =
  | { kind: 'builtin'; priority: number; order: number; key: string; sub: BuiltinSubscriber }
  | { kind: 'hook'; priority: number; order: number; key: string; sub: HookSubscriber };

/** Reported in dev builds when the cascade guard trips. */
export const cascadeReports: { turn: number; event: GameEventType }[] = [];

export class Resolver {
  readonly d: Draft;
  readonly rules: CompiledRules;
  readonly silent: boolean;
  readonly frames: EncounterState[] | null;
  private queue: GameEvent[] = [];
  private processed = 0;
  private halted = false;
  /** Snapshot of the state when the current action began (for pre-move queries). */
  pre: EncounterState;

  constructor(state: EncounterState, opts: ResolveOptions = {}) {
    this.d = beginDraft(state);
    this.rules = compileRules(state.rules);
    this.silent = !!opts.silent;
    this.frames = opts.frames ? [] : null;
    this.pre = state;
  }

  /** Start a new action: resets the cascade guard. */
  beginAction(): void {
    this.processed = 0;
    this.halted = false;
    this.queue.length = 0;
    this.pre = snapshot(this.d);
  }

  log(kind: LogKind, text: string, depth = 1, sqs?: Sq[]): void {
    pushLog(this.d, this, kind, text, depth, sqs);
  }

  emit(e: Omit<GameEvent, 'turn'>): void {
    if (this.halted) return;
    this.queue.push({ ...e, turn: this.d.turn } as GameEvent);
  }

  /** Process queued events until the queue is empty (or the guard trips). */
  drain(): void {
    while (this.queue.length > 0 && !this.halted) {
      const e = this.queue.shift()!;
      this.processed += 1;
      if (this.processed > CASCADE_LIMIT) {
        this.halted = true;
        this.queue.length = 0;
        this.log('warning', 'Cascade limit reached — remaining triggers skipped', 0);
        cascadeReports.push({ turn: this.d.turn, event: e.type });
        if (import.meta.env?.DEV) console.error(`[RuleEngine] Cascade limit reached on ${e.type} (turn ${this.d.turn})`);
        break;
      }
      this.dispatch(e);
    }
  }

  get cascadeHalted(): boolean {
    return this.halted;
  }

  private dispatch(e: GameEvent): void {
    const subs: Subscriber[] = [];
    for (const b of BUILTIN_SUBSCRIBERS) {
      if (b.event === e.type) subs.push({ kind: 'builtin', priority: b.priority, order: -1, key: b.id, sub: b });
    }
    for (const h of this.rules.hooks[e.type] ?? []) {
      subs.push({ kind: 'hook', priority: h.priority, order: h.order, key: h.upgradeId, sub: h });
    }
    if (subs.length === 0) return;
    subs.sort((a, b) => a.priority - b.priority || a.order - b.order || a.key.localeCompare(b.key));
    for (const s of subs) {
      if (this.d.outcome && e.type !== 'onEncounterWon' && e.type !== 'onEncounterLost') break;
      if (s.kind === 'builtin') s.sub.run(this, e);
      else runHook(this, s.sub, e);
    }
  }

  frame(): void {
    if (this.frames) this.frames.push(snapshot(this.d));
  }

  result(): EncounterState {
    return this.d;
  }
}
