/**
 * ThemeProvider — bridges the framework-agnostic `@soteria-forge/ui` tokens
 * into React Native.
 *
 * `@soteria-forge/ui` already ships fully-resolved light/dark `Theme` objects
 * (flat, value-only, RN-consumable — including RN-native `elevation` instead of
 * web `box-shadow`). This provider simply:
 *   1. Tracks the device color scheme (or an explicit override).
 *   2. Selects the matching `Theme` via the package's `getTheme`.
 *   3. Exposes it through context so screens/components read one source of truth.
 *
 * We deliberately do NOT redefine any color/spacing values here — the tokens
 * package is canonical (mirrors apps/console/src/theme/tokens.css). Duplicating
 * them would let the two drift.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getTheme, type ColorScheme, type Theme } from '@soteria-forge/ui';

interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
  /** Force a scheme regardless of the OS setting; `null` follows the device. */
  setSchemeOverride: (scheme: ColorScheme | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Optional initial override, mainly for tests / storybook. */
  initialScheme?: ColorScheme | null;
}

export function ThemeProvider({ children, initialScheme = null }: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const [override, setOverride] = useState<ColorScheme | null>(initialScheme);

  const scheme: ColorScheme = override ?? (deviceScheme === 'dark' ? 'dark' : 'light');

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(scheme),
      scheme,
      setSchemeOverride: setOverride,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active resolved theme. Throws if used outside <ThemeProvider>. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx.theme;
}

/** Access theme + scheme controls (for a light/dark toggle, etc.). */
export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeControls must be used within a <ThemeProvider>');
  }
  return ctx;
}
