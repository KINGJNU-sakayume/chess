import { useAppStore } from './state/appStore';
import { TitleScreen } from './screens/TitleScreen';
import { HotseatScreen } from './screens/HotseatScreen';
import { SandboxScreen } from './screens/SandboxScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);
  switch (screen) {
    case 'hotseat':
      return <HotseatScreen />;
    case 'sandbox':
      return <SandboxScreen />;
    default:
      return <TitleScreen />;
  }
}
