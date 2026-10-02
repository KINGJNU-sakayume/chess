import { create } from 'zustand';
import type { EncounterState } from '../engine/core/state';
import { applyPlayerAction, endTurn, noActionsLeft, type PlayerActionInput } from '../engine/encounters/flow';
import { deriveFx, type FxEvent } from './fx';

/**
 * The active encounter session: current state, the per-turn undo stack
 * (immutable snapshots), and frames queued for animation. No rules live here —
 * every change goes through the engine.
 */
export interface SessionCallbacks {
  /** Called after every committed change (for run autosave / action logs). */
  onAction?: (action: SessionAction, state: EncounterState, history: EncounterState[]) => void;
}

/** Drop frames that would not change what the board shows (keeps playback short). */
export function visualFrames(prev: EncounterState, frames: EncounterState[]): EncounterState[] {
  const sig = (s: EncounterState) =>
    `${s.board.join(',')}|${s.terrain.join(',')}|${s.marks.length}|${Object.values(s.pieces)
      .map((p) => `${p.type}${p.wards}${p.tempWards.length}${p.statuses.length}`)
      .join('')}`;
  const out: EncounterState[] = [];
  let last = sig(prev);
  for (const f of frames) {
    const k = sig(f);
    if (k !== last) out.push(f);
    last = k;
  }
  return out;
}

export type SessionAction = { type: 'act'; action: PlayerActionInput } | { type: 'endTurn' } | { type: 'undo' };

/** A live visual effect (F5), keyed for React and stamped for pruning. */
export interface LiveFx {
  key: string;
  event: FxEvent;
  born: number;
}

/** Effects older than this are dropped (every effect is shorter at 1×). */
const FX_LIFETIME_MS = 2000;
let fxSeq = 0;

function withFx(current: LiveFx[], prev: EncounterState | null, next: EncounterState): LiveFx[] {
  const now = Date.now();
  const alive = current.filter((f) => now - f.born < FX_LIFETIME_MS);
  if (!prev) return alive;
  const events = deriveFx(prev, next);
  return events.length ? [...alive, ...events.map((event) => ({ key: `fx${fxSeq++}`, event, born: now }))] : alive;
}

interface SessionStore {
  state: EncounterState | null;
  history: EncounterState[];
  /** States waiting to be displayed (animation playback). */
  frames: EncounterState[];
  display: EncounterState | null;
  /** Effects for the frames shown so far (empty when animations are skipped). */
  fx: LiveFx[];
  error: string | null;
  callbacks: SessionCallbacks;
  start: (s: EncounterState, callbacks?: SessionCallbacks, history?: EncounterState[]) => void;
  act: (a: PlayerActionInput, autoEnd?: boolean) => void;
  endTurn: () => void;
  undo: () => void;
  advanceFrame: () => void;
  skipFrames: () => void;
  /** Drop finished effects. */
  pruneFx: () => void;
  clear: () => void;
}

export const useSession = create<SessionStore>((set, get) => ({
  state: null,
  history: [],
  frames: [],
  display: null,
  fx: [],
  error: null,
  callbacks: {},
  start: (s, callbacks = {}, history: EncounterState[] = []) => set({ state: s, display: s, history, frames: [], fx: [], error: null, callbacks }),
  act: (a, autoEnd = false) => {
    const { state, history, callbacks } = get();
    if (!state) return;
    try {
      const res = applyPlayerAction(state, a, { frames: true });
      const frames = [...visualFrames(state, res.frames.slice(0, -1)), res.state];
      const nextHistory = [...history, state];
      // The first frame shows at once (no input lag); the rest play back at the chosen speed.
      const { display, fx } = get();
      set({ state: res.state, history: nextHistory, display: frames[0], frames: frames.slice(1), fx: withFx(fx, display, frames[0]), error: null });
      callbacks.onAction?.({ type: 'act', action: a }, res.state, nextHistory);
      if (autoEnd && !res.state.outcome && noActionsLeft(res.state)) get().endTurn();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
  endTurn: () => {
    const { state, callbacks, frames: pending } = get();
    if (!state || state.phase !== 'player' || state.outcome) return;
    const res = endTurn(state, { frames: true });
    const frames = [...pending, ...visualFrames(pending[pending.length - 1] ?? state, res.frames), res.state];
    const { display, fx } = get();
    set({ state: res.state, history: [], display: frames[0], frames: frames.slice(1), fx: withFx(fx, display, frames[0]), error: null });
    callbacks.onAction?.({ type: 'endTurn' }, res.state, []);
  },
  undo: () => {
    const { history, callbacks } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    set({ state: prev, display: prev, history: nextHistory, frames: [], fx: [], error: null });
    callbacks.onAction?.({ type: 'undo' }, prev, nextHistory);
  },
  advanceFrame: () => {
    const { frames, display, fx } = get();
    if (!frames.length) return;
    set({ display: frames[0], frames: frames.slice(1), fx: withFx(fx, display, frames[0]) });
  },
  skipFrames: () => {
    const { state } = get();
    set({ display: state, frames: [], fx: [] });
  },
  pruneFx: () => {
    const now = Date.now();
    const { fx } = get();
    const alive = fx.filter((f) => now - f.born < FX_LIFETIME_MS);
    if (alive.length !== fx.length) set({ fx: alive });
  },
  clear: () => set({ state: null, display: null, history: [], frames: [], fx: [], error: null, callbacks: {} }),
}));
