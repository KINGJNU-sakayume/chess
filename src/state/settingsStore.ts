import { create } from 'zustand';

export type AnimSpeed = 1 | 2 | 0;

export interface Settings {
  /** Animation speed: 1×, 2× or 0 = instant (F5). */
  animSpeed: AnimSpeed;
  /** End the turn automatically when no actions remain (B2). Off by default so Undo stays useful. */
  autoEndTurn: boolean;
  /** Show squares attacked by the enemy. */
  attackOverlay: boolean;
  /** Developer tools: debug panel, upgrade granting. */
  developer: boolean;
  /** Expanded piece inspector by default. */
  inspectorExpanded: boolean;
}

const KEY = 'breakchess.settings.v1';

const DEFAULTS: Settings = {
  animSpeed: 1,
  autoEndTurn: false,
  attackOverlay: false,
  developer: false,
  inspectorExpanded: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  const dev = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  return { ...DEFAULTS, developer: dev };
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    try {
      const { set: _ignored, ...rest } = { ...get(), ...patch };
      void _ignored;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable */
    }
  },
}));

/** Milliseconds per animation frame for the current speed. */
export const frameMs = (speed: AnimSpeed): number => (speed === 0 ? 0 : speed === 2 ? 190 : 380);
export const moveMs = (speed: AnimSpeed): number => (speed === 0 ? 0 : speed === 2 ? 110 : 220);
