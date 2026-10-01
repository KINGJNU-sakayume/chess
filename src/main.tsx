import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './index.css';
import { App } from './App';
import { useRun } from './state/runStore';
import { useSession } from './state/sessionStore';
import { useAppStore } from './state/appStore';

// Dev-only handles for scripted UI checks (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__breakchess = { useRun, useSession, useAppStore };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
