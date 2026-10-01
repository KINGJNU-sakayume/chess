import { create } from 'zustand';
import type { EncounterState } from '../engine/core/state';
import { newRun, runReducer } from '../engine/run/reducer';
import type { RunAction, RunState } from '../engine/run/types';
import { deserializeRun, serializeRun } from '../engine/serialize/save';

/**
 * UI adapter for the run reducer (no rules here). Autosaves after every node
 * and every End Turn (G1). Encounter actions are executed by the session store
 * (which also produces animation frames) and recorded here without recomputing.
 */
const SAVE_KEY = 'breakchess.run.v1';

function save(run: RunState): void {
  try {
    localStorage.setItem(SAVE_KEY, serializeRun(run));
  } catch {
    /* storage unavailable or full */
  }
}

export function loadSavedRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserializeRun(raw) : null;
  } catch {
    return null;
  }
}

export function hasSavedRun(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSavedRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

interface RunStore {
  run: RunState | null;
  error: string | null;
  start: (seed: string) => void;
  resume: () => boolean;
  dispatch: (action: RunAction) => boolean;
  /** Record an encounter action already executed by the session store. */
  recordEncounter: (action: RunAction, encounter: EncounterState, undo: EncounterState[]) => void;
  abandon: () => void;
  close: () => void;
}

const MID_TURN: RunAction['type'][] = ['encounterAct', 'undo'];

export const useRun = create<RunStore>((set, get) => ({
  run: null,
  error: null,
  start: (seed) => {
    const run = newRun(seed);
    save(run);
    set({ run, error: null });
  },
  resume: () => {
    const run = loadSavedRun();
    if (!run) return false;
    set({ run, error: null });
    return true;
  },
  dispatch: (action) => {
    const { run } = get();
    if (!run) return false;
    try {
      const next = runReducer(run, action);
      set({ run: next, error: null });
      if (!MID_TURN.includes(action.type)) save(next);
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },
  recordEncounter: (action, encounter, undo) => {
    const { run } = get();
    if (!run) return;
    const next: RunState = { ...run, encounter, undo, actions: [...run.actions, action] };
    set({ run: next });
    if (!MID_TURN.includes(action.type)) save(next);
  },
  abandon: () => {
    clearSavedRun();
    set({ run: null, error: null });
  },
  close: () => set({ run: null, error: null }),
}));
