import { create } from 'zustand';

export type Screen = 'title' | 'hotseat' | 'run' | 'sandbox' | 'settings';

interface AppStore {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  screen: 'title',
  go: (screen) => set({ screen }),
}));
