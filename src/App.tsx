import { useAppStore } from './state/appStore';
import { CodexScreen } from './screens/CodexScreen';
import { GameScreen } from './screens/GameScreen';
import { RulesScreen } from './screens/RulesScreen';
import { RunScreen } from './screens/run/RunScreen';
import { SetupScreen } from './screens/SetupScreen';
import { TitleScreen } from './screens/TitleScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);
  switch (screen) {
    case 'setup':
      return <SetupScreen />;
    case 'game':
      return <GameScreen />;
    case 'codex':
      return <CodexScreen />;
    case 'rules':
      return <RulesScreen />;
    case 'run':
      return <RunScreen />;
    default:
      return <TitleScreen />;
  }
}
