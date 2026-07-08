/**
 * Soteria Forge — raw brand palette + dimensionless scales (RN-free).
 *
 * This module is deliberately free of any `react-native` / `expo-*` import so it
 * can be pulled into a plain Node/CI type graph (see `a11y/contrast.ts` and its
 * `node --test` suite, which assert WCAG AA on these exact values). `theme.ts`
 * re-exports everything here, so the public `@soteria-forge/ui` surface is
 * unchanged — `palette`, `radii`, `spacing`, and `fonts` still import from the
 * package root exactly as before.
 *
 * The raw brand hexes (ember / spark / ink / paper …) are the canonical brand
 * source that `apps/web/src/theme/tokens.css` and `apps/console/src/theme/tokens.css`
 * mirror 1:1. Never hardcode a brand hex in a component — read from here (raw) or
 * from `useTheme()` (semantic).
 */

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
