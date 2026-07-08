/**
 * Soteria Forge — design tokens + theme provider.
 * Cross-platform (iOS / Android / Web via react-native-web).
 *
 * Usage:
 *   import { ThemeProvider, useTheme, lightTheme, darkTheme } from '@soteria-forge/ui';
 *   <ThemeProvider theme={darkTheme}> ...app... </ThemeProvider>
 *
 * Components call useTheme() internally. Without a provider they default to lightTheme.
 */
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { palette, radii, spacing, fonts } from './palette';

/* ---- Brand tokens + scales -----------------------------------------------
 * The raw `palette` and the `radii` / `spacing` / `fonts` scales now live in the
 * RN-free `./palette` module (so a Node/CI test can import them without dragging
 * in `react-native`). They are re-exported here to keep the historical public
 * surface (`import { palette, radii, spacing, fonts } from '@soteria-forge/ui'`)
 * byte-for-byte unchanged. */
export { palette, radii, spacing, fonts } from './palette';

export type ThemeColors = {
  primary: string;
  primaryPressed: string;
  accent: string;
  bg: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  placeholder: string;
  onPrimary: string;
  inputBg: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  /**
   * Accessible foreground (text/icon) colors for content placed ON the
   * `warning` and `info` fills. These are NOT interchangeable with `onPrimary`
   * or a hardcoded white: `warning` is a light amber, so white text on it is
   * only ~2:1 (WCAG fail) — `onWarning` is dark ink. `info` is a mid blue, and
   * its accessible on-color differs per scheme (white on the light-theme blue,
   * dark ink on the lighter dark-theme blue). Always pair `onWarning` with
   * `warning` and `onInfo` with `info`; each pairing is asserted >= 4.5:1 in
   * `a11y/__tests__/contrast.test.ts`.
   */
  onWarning: string;
  onInfo: string;
  overlay: string;
};

export type Theme = {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  radii: typeof radii;
  spacing: typeof spacing;
  fonts: typeof fonts;
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    primary: palette.ember,
    primaryPressed: palette.emberDeep,
    accent: palette.spark,
    bg: palette.paper,
    surface: palette.white,
    card: palette.white,
    border: palette.hairline,
    text: palette.ink,
    textMuted: palette.textMuted,
    placeholder: palette.muted,
    onPrimary: '#FFFFFF',
    inputBg: palette.white,
    success: palette.success,
    danger: palette.danger,
    warning: palette.warning,
    info: palette.info,
    // Dark ink on amber warning = ~7.8:1; white on info blue (#2A6FDB) = ~4.8:1.
    onWarning: palette.ink,
    onInfo: palette.white,
    overlay: 'rgba(20,20,24,0.45)',
  },
  radii,
  spacing,
  fonts,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: palette.emberHot,
    primaryPressed: palette.ember,
    accent: palette.spark,
    bg: palette.darkBg,
    surface: palette.darkPanel,
    card: palette.darkPanel,
    border: palette.darkHairline,
    text: palette.darkText,
    textMuted: palette.darkMuted,
    placeholder: '#7E848C',
    onPrimary: palette.ink,
    inputBg: palette.darkInput,
    success: '#33B983',
    danger: '#E4634F',
    warning: palette.spark,
    info: '#5B8DEF',
    // Dark ink on the spark warning = ~9.6:1. The dark-theme info blue (#5B8DEF)
    // is lighter than the light-theme blue, so WHITE on it is only ~3.2:1 (fail)
    // — the accessible on-color here is dark ink (~5.2:1), not white.
    onWarning: palette.ink,
    onInfo: palette.ink,
    overlay: 'rgba(0,0,0,0.6)',
  },
  radii,
  spacing,
  fonts,
};

/* ---- Provider / hook ------------------------------------------------------ */
const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider(props: { theme?: Theme; children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: props.theme ?? lightTheme }, props.children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/* ---- Cross-platform elevation/shadow helper ------------------------------- */
export function elevation(level: 1 | 2 | 3 = 1): ViewStyle {
  const map = {
    1: { o: 0.08, r: 6, y: 2, e: 2 },
    2: { o: 0.1, r: 14, y: 6, e: 4 },
    3: { o: 0.16, r: 26, y: 10, e: 9 },
  } as const;
  const s = map[level];
  return (
    Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: s.o, shadowRadius: s.r, shadowOffset: { width: 0, height: s.y } },
      android: { elevation: s.e },
      default: { boxShadow: `0px ${s.y}px ${s.r}px rgba(0,0,0,${s.o})` } as any, // web (react-native-web)
    }) as ViewStyle
  );
}
