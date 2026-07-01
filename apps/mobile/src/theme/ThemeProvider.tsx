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
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  ThemeProvider as KitThemeProvider,
  lightTheme,
  darkTheme,
  type Theme,
} from '@soteria-forge/ui';

/** Light/dark scheme selector — the app's own control vocabulary. */
export type ColorScheme = 'light' | 'dark';

interface ThemeControlsValue {
  theme: Theme;
  scheme: ColorScheme;
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

  const scheme: ColorScheme = override ?? (deviceScheme === 'dark' ? 'dark' : 'light');
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  const controls = useMemo<ThemeControlsValue>(
    () => ({ theme, scheme, setSchemeOverride: setOverride }),
    [theme, scheme],
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
