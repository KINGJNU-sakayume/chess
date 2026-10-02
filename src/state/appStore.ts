import { create } from 'zustand';

export type Screen = 'title' | 'setup' | 'game' | 'codex' | 'rules';

interface AppStore {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  screen: 'title',
  go: (screen) => set({ screen }),
}));
