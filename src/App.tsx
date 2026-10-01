import { useAppStore } from './state/appStore';
import { TitleScreen } from './screens/TitleScreen';
import { HotseatScreen } from './screens/HotseatScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);
  switch (screen) {
    case 'hotseat':
      return <HotseatScreen />;
    default:
      return <TitleScreen />;
  }
}
