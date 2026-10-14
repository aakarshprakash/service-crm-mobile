import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { applyScheme, type Scheme } from '@/components/theme';

export type AppearancePref = 'system' | 'light' | 'dark';

const file = new File(Paths.document, 'appearance.txt');

/** Read synchronously at start-up so the first frame already has the right colours. */
function loadPref(): AppearancePref {
  try {
    const v = file.exists ? file.textSync().trim() : '';
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const Ctx = createContext<{ pref: AppearancePref; scheme: Scheme; setPref: (p: AppearancePref) => void }>({ pref: 'system', scheme: 'light', setPref: () => {} });

export function useAppearance() {
  return useContext(Ctx);
}

/**
 * Light / dark mode. "System" follows the phone's setting. Changing it re-renders `children`
 * from scratch (keyed by scheme) because screens read the palette while rendering.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState(loadPref);
  const [system, setSystem] = useState(Appearance.getColorScheme());
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  applyScheme(scheme); // before children render, so they read the right palette

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  const setPref = (p: AppearancePref) => {
    try {
      file.write(p);
    } catch {
      /* not saved: applies until the app restarts */
    }
    setPrefState(p);
  };

  return (
    <Ctx.Provider value={{ pref, scheme, setPref }}>
      <Fragment key={scheme}>{children}</Fragment>
    </Ctx.Provider>
  );
}
