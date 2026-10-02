import { create } from 'zustand';
import type { MatchAction, MatchState } from '../engine/match/match';
import { battleSetup, createRun, runAction } from '../engine/run/reducer';
import type { BattleOutcome, Difficulty, RunAction, RunState } from '../engine/run/types';
import { onMatchChange, useGame } from './gameStore';

const RUN_KEY = 'breakchess.run.v1';

interface SavedRun {
  run: RunState;
  /** Actions of the battle in progress, if any. */
  battle: MatchAction[] | null;
}

interface RunStore {
  run: RunState | null;
  /** Last refused action's reason (shown briefly). */
  error: string | null;
  start: (difficulty: Difficulty) => void;
  act: (a: RunAction) => boolean;
  resume: () => boolean;
  /** Start the battle of the pre-battle screen and hand it to the game screen. */
  launchBattle: () => void;
  /** Report the finished battle back to the run. */
  finishBattle: (outcome: BattleOutcome) => void;
  /** Spend one of the run's undos; false if none are left. */
  spendUndo: () => boolean;
  abandon: () => void;
}

let battleActions: MatchAction[] | null = null;

function persist(run: RunState | null): void {
  try {
    if (!run || run.phase === 'victory' || run.phase === 'defeat') localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify({ run, battle: run.phase === 'battle' ? battleActions : null } satisfies SavedRun));
  } catch {
    /* storage unavailable */
  }
}

export function hasSavedRun(): boolean {
  try {
    return !!localStorage.getItem(RUN_KEY);
  } catch {
    return false;
  }
}

export const useRun = create<RunStore>((set, get) => {
  const apply = (a: RunAction): boolean => {
    const run = get().run;
    if (!run) return false;
    try {
      const next = runAction(run, a);
      set({ run: next, error: null });
      persist(next);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  return {
    run: null,
    error: null,

    start: (difficulty) => {
      const seed = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const run = createRun(seed, difficulty);
      battleActions = null;
      set({ run, error: null });
      persist(run);
    },

    act: apply,

    resume: () => {
      try {
        const raw = localStorage.getItem(RUN_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw) as SavedRun;
        if (saved.run?.version !== 1) throw new Error('old save');
        battleActions = saved.battle;
        set({ run: saved.run, error: null });
        if (saved.run.phase === 'battle') useGame.getState().restore(battleSetup(saved.run), saved.battle ?? []);
        return true;
      } catch {
        try {
          localStorage.removeItem(RUN_KEY);
        } catch {
          /* ignore */
        }
        return false;
      }
    },

    launchBattle: () => {
      if (!apply({ type: 'begin-battle' })) return;
      battleActions = [];
      useGame.getState().start(battleSetup(get().run!));
      persist(get().run);
    },

    finishBattle: (outcome) => {
      const run = get().run;
      if (!run || run.phase !== 'battle') return;
      battleActions = null;
      apply({ type: 'battle-end', outcome, undos: run.undos });
      useGame.getState().quit();
    },

    spendUndo: () => apply({ type: 'spend-undo' }),

    abandon: () => {
      battleActions = null;
      set({ run: null, error: null });
      persist(null);
    },
  };
});

/** Keep the battle in progress saved with the run. */
onMatchChange((m: MatchState) => {
  if (m.setup.context !== 'run') return;
  const run = useRun.getState().run;
  if (!run || run.phase !== 'battle' || m.setup.seed !== run.battleSeed) return;
  battleActions = m.actions.slice();
  persist(run);
});
