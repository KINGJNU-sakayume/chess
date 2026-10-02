import { create } from 'zustand';

export type AnimSpeed = 1 | 2 | 0;

export interface Settings {
  /** Animation speed: normal, fast or instant. */
  animSpeed: AnimSpeed;
  /** Mark moves that leave your own King capturable. */
  dangerHints: boolean;
  /** Show the squares of the last move and check highlights. */
  showCoords: boolean;
  /** Two-player games: turn the board toward the side to move. */
  autoFlip: boolean;
}

const KEY = 'breakchess.settings.v2';

const DEFAULTS: Settings = {
  animSpeed: 1,
  dangerHints: true,
  showCoords: true,
  autoFlip: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
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

/** Piece slide duration for the current speed. */
export const moveMs = (speed: AnimSpeed): number => (speed === 0 ? 0 : speed === 2 ? 110 : 220);
/** Pause before the AI's move lands, so it can be followed. */
export const aiDelayMs = (speed: AnimSpeed): number => (speed === 0 ? 60 : speed === 2 ? 220 : 450);
