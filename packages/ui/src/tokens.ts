/**
 * Soteria FORGE — design tokens (TypeScript source of truth).
 *
 * These values are the canonical, framework-agnostic palette + scales for the
 * whole product. They are mirrored 1:1 by `tokens.css` (CSS custom properties,
 * `--sf-*`) and by `apps/console/src/theme/tokens.css`. Keep all three aligned.
 *
 * Consumers:
 *   - React Native (apps/mobile) — imports this module and `theme.ts`.
 *   - Vue console (apps/console) — imports `tokens.css` for `--sf-*` vars.
 *
 * NOTE: colors are plain strings (hex / rgba) so both RN `StyleSheet` and web
 * consumers can use them without transformation.
 */

/* ── Brand ──────────────────────────────────────────────────────────────── */

export const brand = {
  /** primary / foreground */
  ink: "#0E1A2E",
  /** system signal */
  blue: "#3DA9FC",
  /** live / industrial signal */
  orange: "#FF6B1F",
  /** primary background */
  paper: "#F5F4EF",
} as const;

/* ── Color scales ───────────────────────────────────────────────────────── */

/** Brand blue scale — hover/active/focus states. */
export const blue = {
  50: "#EFF7FF",
  100: "#D4ECFE",
  200: "#ABDAFD",
  300: "#7DC6FC",
  400: "#5BB6FC",
  500: "#3DA9FC",
  600: "#2563EB",
  700: "#1D4ED8",
  800: "#1E40AF",
  900: "#1E3A8A",
} as const;

/** Brand orange scale — hover/active/focus states. */
export const orange = {
  50: "#FFF4ED",
  100: "#FFE3D1",
  200: "#FEC9A6",
  300: "#FDA572",
  400: "#FB8843",
  500: "#FF6B1F",
  600: "#F97316",
  700: "#C2410C",
  800: "#9A3412",
  900: "#7C2D12",
} as const;

/** Ink scale — warm-cool neutral used for text, surfaces, borders. */
export const ink = {
  50: "#FAFAF7",
  100: "#EFECE7",
  200: "#D8D4CC",
  300: "#A8A39B",
  400: "#7A7670",
  500: "#5A5650",
  600: "#3A3F4A",
  700: "#2A2F3A",
  800: "#0E1A2E",
  900: "#0A1119",
} as const;

/** All color scales grouped for programmatic access. */
export const palette = {
  blue,
  orange,
  ink,
} as const;

/* ── Semantic ───────────────────────────────────────────────────────────── */

export const semantic = {
  success: "#2F6F4A",
  warning: "#E0A03B",
  danger: "#C84D2F",
  info: "#3DA9FC",
} as const;

/**
 * LMS-specific status colors. These map to learner-facing states across the
 * mobile app and console (course readiness, sync state, compliance windows).
 */
export const status = {
  ready: "#3DA9FC",
  progress: "#FF6B1F",
  complete: "#2F6F4A",
  lapsing: "#E0A03B",
  expired: "#C84D2F",
  overdue: "#C84D2F",
  synced: "#2F6F4A",
  offline: "#7A7670",
} as const;

/** LMS-friendly chart ramp (blues → orange → green). */
export const chart = {
  1: "#3DA9FC",
  2: "#FF6B1F",
  3: "#2F6F4A",
  4: "#7DC6FC",
  5: "#C2410C",
  6: "#6B7280",
} as const;

/* ── Typography ─────────────────────────────────────────────────────────── */

export const fontFamily = {
  display:
    "'Inter Tight', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  body: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/**
 * Type scale in pixels (RN uses unitless px). The CSS mirror expresses the same
 * values in rem assuming a 16px root.
 */
export const fontSize = {
  "3xs": 10,
  "2xs": 11,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
  "5xl": 48,
  "6xl": 60,
} as const;

/** Line heights as unitless multipliers. */
export const lineHeight = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.65,
} as const;

/**
 * Letter spacing. `em` values for CSS; the numeric `px` equivalents (at 16px)
 * are provided for RN which needs absolute `letterSpacing`.
 */
export const letterSpacing = {
  tight: "-0.02em",
  normal: "0",
  wide: "0.06em",
  caps: "0.18em",
} as const;

/** Absolute letter spacing in px (16px reference) for React Native. */
export const letterSpacingPx = {
  tight: -0.32,
  normal: 0,
  wide: 0.96,
  caps: 2.88,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/* ── Spacing (4px base) ─────────────────────────────────────────────────── */

/** Spacing scale in px. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

/* ── Radii ──────────────────────────────────────────────────────────────── */

/** Border radii in px. */
export const radii = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  full: 9999,
} as const;

/* ── Shadows ────────────────────────────────────────────────────────────── */

/**
 * Web shadows as CSS `box-shadow` strings. React Native cannot consume these
 * directly — see `theme.ts` `elevation` for the RN-native equivalents.
 */
export const shadow = {
  xs: "0 1px 2px rgba(14, 26, 46, 0.06)",
  sm: "0 1px 3px rgba(14, 26, 46, 0.08), 0 1px 2px rgba(14, 26, 46, 0.05)",
  md: "0 4px 12px rgba(14, 26, 46, 0.10), 0 2px 4px rgba(14, 26, 46, 0.06)",
  lg: "0 12px 32px rgba(14, 26, 46, 0.14), 0 4px 8px rgba(14, 26, 46, 0.06)",
  xl: "0 24px 60px -10px rgba(14, 26, 46, 0.28)",
} as const;

/* ── Motion ─────────────────────────────────────────────────────────────── */

export const easing = {
  out: "cubic-bezier(0.2, 0.7, 0.3, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Durations in ms. */
export const duration = {
  quick: 120,
  base: 180,
  slow: 320,
} as const;

/* ── Layout ─────────────────────────────────────────────────────────────── */

export const layout = {
  /** iOS HIG / WCAG minimum touch target (px). */
  touchTarget: 44,
  container: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
} as const;

/* ── Aggregate ──────────────────────────────────────────────────────────── */

/**
 * The complete token set as one frozen object. This is the single source of
 * truth in TS form; `theme.ts` composes light/dark themes from it.
 */
export const tokens = {
  brand,
  palette,
  color: {
    // Full scales (keyed 50–900).
    blue,
    orange,
    ink,
    // Brand anchors as flat primitives (distinct keys so scales aren't clobbered).
    brandInk: brand.ink,
    brandBlue: brand.blue,
    brandOrange: brand.orange,
    paper: brand.paper,
  },
  semantic,
  status,
  chart,
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
  letterSpacingPx,
  fontWeight,
  spacing,
  radii,
  shadow,
  easing,
  duration,
  layout,
} as const;

/* ── Types ──────────────────────────────────────────────────────────────── */

export type Tokens = typeof tokens;
export type Brand = typeof brand;
export type ColorScale = typeof blue;
export type ScaleStep = keyof ColorScale;
export type SemanticColor = keyof typeof semantic;
export type StatusColor = keyof typeof status;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
export type LineHeightToken = keyof typeof lineHeight;
export type FontFamilyToken = keyof typeof fontFamily;

export default tokens;
