import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/noto-serif-kr/700.css';
import './index.css';
import { App } from './App';
import { useGame } from './state/gameStore';
import { useAppStore } from './state/appStore';
import { useRun } from './state/runStore';

// Dev-only handles for scripted UI checks (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__breakchess = { useGame, useAppStore, useRun };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
