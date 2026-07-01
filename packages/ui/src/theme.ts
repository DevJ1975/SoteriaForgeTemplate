/**
 * Soteria FORGE — themes.
 *
 * Builds concrete light + dark `Theme` objects from the primitive `tokens`.
 * The shape is deliberately flat and value-only (no CSS var indirection) so a
 * React Native theme provider / `StyleSheet` can consume it directly, while web
 * consumers may prefer the `tokens.css` custom properties instead.
 */

import {
  tokens,
  ink,
  blue,
  brand,
  semantic,
  status,
  chart,
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacingPx,
  spacing,
  radii,
  duration,
  easing,
  layout,
} from "./tokens.js";

export type ColorScheme = "light" | "dark";

/** Resolved, scheme-specific surface/text/border colors. */
export interface ThemeColors {
  /** Brand anchors (scheme-invariant). */
  brand: {
    ink: string;
    blue: string;
    orange: string;
    paper: string;
  };
  bg: {
    base: string;
    surface: string;
    elevated: string;
    overlay: string;
    subtle: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    link: string;
  };
  border: {
    subtle: string;
    default: string;
    strong: string;
    focus: string;
  };
  /** Semantic feedback colors (scheme-invariant). */
  semantic: typeof semantic;
  /** LMS status colors (scheme-invariant). */
  status: typeof status;
  /** Chart ramp (scheme-invariant). */
  chart: typeof chart;
}

/**
 * RN-native elevation. `box-shadow` strings do not work in React Native, so we
 * expose iOS `shadow*` props plus an Android `elevation` integer per step.
 */
export interface Elevation {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  fontSize: typeof fontSize;
  fontFamily: typeof fontFamily;
  fontWeight: typeof fontWeight;
  lineHeight: typeof lineHeight;
  letterSpacing: typeof letterSpacingPx;
  duration: typeof duration;
  easing: typeof easing;
  layout: typeof layout;
  elevation: {
    xs: Elevation;
    sm: Elevation;
    md: Elevation;
    lg: Elevation;
    xl: Elevation;
  };
  /** Web focus-ring `box-shadow` strings (used by the console; harmless in RN). */
  focusRing: {
    default: string;
    error: string;
  };
}

/* ── Scheme-invariant slices shared by both themes ──────────────────────── */

const brandColors: ThemeColors["brand"] = {
  ink: brand.ink,
  blue: brand.blue,
  orange: brand.orange,
  paper: brand.paper,
};

const shadowColor = brand.ink; // #0E1A2E

const elevation: Theme["elevation"] = {
  xs: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  sm: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  md: { shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 6 },
  lg: { shadowColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 32, elevation: 12 },
  xl: { shadowColor, shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.28, shadowRadius: 60, elevation: 24 },
};

const focusRing: Theme["focusRing"] = {
  default: "0 0 0 3px rgba(61, 169, 252, 0.45)",
  error: "0 0 0 3px rgba(200, 77, 47, 0.45)",
};

/**
 * Non-color scales are identical across schemes. Spread into each theme so the
 * final object is self-contained (no cross-theme references).
 */
const scaleSlice = {
  spacing,
  radii,
  fontSize,
  fontFamily,
  fontWeight,
  lineHeight,
  letterSpacing: letterSpacingPx,
  duration,
  easing,
  layout,
  elevation,
  focusRing,
} as const;

/* ── Light ──────────────────────────────────────────────────────────────── */

export const lightTheme: Theme = {
  scheme: "light",
  colors: {
    brand: brandColors,
    bg: {
      base: brand.paper,
      surface: "#FFFFFF",
      elevated: "#FFFFFF",
      overlay: "rgba(14, 26, 46, 0.55)",
      subtle: ink[50],
    },
    text: {
      primary: ink[800],
      secondary: ink[500],
      muted: ink[400],
      inverse: "#FFFFFF",
      link: blue[600],
    },
    border: {
      subtle: "rgba(14, 26, 46, 0.07)",
      default: "rgba(14, 26, 46, 0.14)",
      strong: "rgba(14, 26, 46, 0.28)",
      focus: blue[500],
    },
    semantic,
    status,
    chart,
  },
  ...scaleSlice,
};

/* ── Dark ───────────────────────────────────────────────────────────────── */

export const darkTheme: Theme = {
  scheme: "dark",
  colors: {
    brand: brandColors,
    bg: {
      base: ink[900],
      surface: ink[800],
      elevated: ink[700],
      overlay: "rgba(0, 0, 0, 0.65)",
      subtle: "rgba(255, 255, 255, 0.04)",
    },
    text: {
      primary: brand.paper,
      secondary: "rgba(245, 244, 239, 0.72)",
      muted: "rgba(245, 244, 239, 0.45)",
      inverse: ink[900],
      link: blue[400],
    },
    border: {
      subtle: "rgba(255, 255, 255, 0.06)",
      default: "rgba(255, 255, 255, 0.12)",
      strong: "rgba(255, 255, 255, 0.24)",
      focus: blue[500],
    },
    semantic,
    status,
    chart,
  },
  ...scaleSlice,
};

/** Both themes keyed by scheme — convenient for a provider. */
export const themes: Record<ColorScheme, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

/** Default theme (light). */
export const defaultTheme: Theme = lightTheme;

/**
 * Resolve a theme by scheme. Falls back to light for any unrecognized value.
 */
export function getTheme(scheme: ColorScheme = "light"): Theme {
  return themes[scheme] ?? lightTheme;
}

/* ── Token-path helper ──────────────────────────────────────────────────── */

type Primitive = string | number;

/**
 * Look up a token by dot-path against the raw `tokens` object, e.g.
 *   getToken("color.blue.500")   → "#3DA9FC"
 *   getToken("spacing.4")        → 16
 *   getToken("status.overdue")   → "#C84D2F"
 *
 * Returns `undefined` if the path does not resolve to a primitive. Numeric
 * scale keys (e.g. `500`, `4`) are matched as their string form.
 */
export function getToken(path: string): Primitive | undefined {
  const segments = path.split(".");
  let current: unknown = tokens;

  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" || typeof current === "number"
    ? current
    : undefined;
}

/**
 * Strict variant of {@link getToken} that throws on a missing path. Useful when
 * a caller wants a hard failure at development time instead of a silent
 * `undefined`.
 */
export function requireToken(path: string): Primitive {
  const value = getToken(path);
  if (value === undefined) {
    throw new Error(`[@soteria-forge/ui] Unknown token path: "${path}"`);
  }
  return value;
}
