/**
 * ThemeProvider — bridges `@soteria-forge/ui` into the RN app.
 *
 * `@soteria-forge/ui` ships fully-resolved, flat light/dark `Theme` objects
 * (`lightTheme` / `darkTheme`) plus its own `ThemeProvider` (static `{ theme }`)
 * and a flat `useTheme()`. This wrapper adds device-awareness on top:
 *   1. Tracks the OS color scheme via `useColorScheme()` (with an optional
 *      explicit override for a light/dark toggle).
 *   2. Selects `lightTheme` / `darkTheme` accordingly.
 *   3. Renders the kit's `<ThemeProvider theme={...}>` so every kit component
 *      (and app screen) reads one source of truth.
 *
 * We deliberately do NOT redefine any color/spacing/type values here — the kit
 * package is canonical. Duplicating them would let the two drift.
 *
 * PERSISTENCE: the explicit scheme override survives restarts via AsyncStorage
 * (key `sf.appearance`, value 'light' | 'dark'; the key is REMOVED for "follow
 * the system"). Hydration is async and deliberately does NOT gate first paint —
 * the app renders immediately with the device scheme and may flash to the
 * persisted override a few ms later. That flash is accepted: blocking the whole
 * tree on an AsyncStorage read would delay EVERY cold start to avoid a rare,
 * barely-perceptible correction.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeProvider as KitThemeProvider,
  lightTheme,
  darkTheme,
  type Theme,
} from '@soteria-forge/ui';

/** AsyncStorage key for the persisted appearance override. */
const APPEARANCE_STORAGE_KEY = 'sf.appearance';

/** Light/dark scheme selector — the app's own control vocabulary. */
export type ColorScheme = 'light' | 'dark';

interface ThemeControlsValue {
  theme: Theme;
  scheme: ColorScheme;
  /** The explicit override currently in effect; `null` = following the device. */
  schemeOverride: ColorScheme | null;
  /** Force a scheme regardless of the OS setting; `null` follows the device. */
  setSchemeOverride: (scheme: ColorScheme | null) => void;
}

const ThemeControlsContext = createContext<ThemeControlsValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Optional initial override, mainly for tests / storybook. */
  initialScheme?: ColorScheme | null;
}

export function ThemeProvider({ children, initialScheme = null }: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const [override, setOverride] = useState<ColorScheme | null>(initialScheme);
  // True once the user (or hydration) has actively set a value this session —
  // guards the hydration read from clobbering a faster user interaction.
  const touched = useRef(false);

  // Hydrate the persisted override once, WITHOUT gating first paint (see the
  // header comment: an ms-scale scheme flash is accepted over a blocked boot).
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((stored) => {
        if (cancelled || touched.current) return;
        if (stored === 'light' || stored === 'dark') setOverride(stored);
      })
      .catch(() => {
        /* unreadable storage — fall back to the device scheme */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSchemeOverride = useMemo(
    () => (next: ColorScheme | null) => {
      touched.current = true;
      setOverride(next);
      // Best-effort persistence; the in-memory value is already applied.
      if (next === null) {
        void AsyncStorage.removeItem(APPEARANCE_STORAGE_KEY).catch(() => {});
      } else {
        void AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next).catch(() => {});
      }
    },
    [],
  );

  const scheme: ColorScheme = override ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  const controls = useMemo<ThemeControlsValue>(
    () => ({ theme, scheme, schemeOverride: override, setSchemeOverride }),
    [theme, scheme, override, setSchemeOverride],
  );

  return (
    <ThemeControlsContext.Provider value={controls}>
      <KitThemeProvider theme={theme}>{children}</KitThemeProvider>
    </ThemeControlsContext.Provider>
  );
}

/** Access theme + scheme controls (for a light/dark toggle, etc.). */
export function useThemeControls(): ThemeControlsValue {
  const ctx = useContext(ThemeControlsContext);
  if (!ctx) {
    throw new Error('useThemeControls must be used within a <ThemeProvider>');
  }
  return ctx;
}
