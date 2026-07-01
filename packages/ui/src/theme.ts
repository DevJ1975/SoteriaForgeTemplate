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

/* ---- Raw brand palette ---------------------------------------------------- */
export const palette = {
  ember: '#E8551F',       // primary brand
  emberHot: '#FF7A3D',    // primary on dark
  emberDeep: '#D8451A',   // pressed / deep accent
  spark: '#FFB552',       // secondary accent
  ink: '#1A1D22',         // headings / text on light
  charcoal: '#1B1E23',    // dark surfaces
  steel: '#3A4048',       // secondary UI
  paper: '#F1EEE8',       // warm page background
  surface: '#F6F5F6',     // light neutral surface
  white: '#FFFFFF',
  hairline: '#E4DFD6',    // borders on light
  muted: '#8A8579',       // secondary text (warm)
  textMuted: '#5A5F66',   // body-muted (cool)
  success: '#1F8A5B',
  danger: '#C0392B',
  warning: '#E8A317',
  info: '#2A6FDB',
  // dark scheme
  darkBg: '#16181D',
  darkPanel: '#1E2127',
  darkHairline: 'rgba(255,255,255,0.12)',
  darkText: '#F4F2EE',
  darkMuted: '#AEB4BC',
  darkInput: '#22262C',
} as const;

/* ---- Scales --------------------------------------------------------------- */
export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/**
 * Font family tokens. You MUST load these fonts in your app (see README).
 * If a family is not registered the platform falls back to the system font.
 *
 * These strings are the exact family names `expo-google-fonts` registers, so the
 * mobile app (apps/mobile/app/_layout.tsx loads them via `useFonts`) can consume
 * these tokens directly. On any platform where the family isn't registered, RN
 * gracefully falls back to the system font — the names remain the single source
 * of truth, changed here in one place.
 */
export const fonts = {
  display: 'Oswald_600SemiBold',              // headings, numbers, buttons
  body: 'BarlowSemiCondensed_500Medium',      // body, labels, inputs
} as const;

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
