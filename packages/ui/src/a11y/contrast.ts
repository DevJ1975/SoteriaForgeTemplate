/**
 * WCAG 2.x contrast math — pure TypeScript, zero runtime imports.
 *
 * Deliberately free of any `react-native` / `expo-*` import so it can run in a
 * plain Node/CI type graph (see `__tests__/contrast.test.ts`, run via
 * `node --test`). This is the machine-checkable guard behind the ember/spark
 * design tokens: every foreground/background pairing the kit ships is asserted
 * to meet WCAG AA here, so a future brand tweak that quietly drops a pairing
 * below threshold fails CI instead of shipping an unreadable banner or button.
 *
 * Reference: WCAG 2.1 relative luminance + contrast ratio.
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** WCAG AA minimum contrast ratios. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0; // >= 18pt, or >= 14pt bold

/**
 * Parse a `#RGB` or `#RRGGBB` hex string to 0-255 channels.
 * Throws on anything else — these are compile-time brand constants, so a bad
 * value is a programming error we want to surface loudly, not silently ignore.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace(/^#/, '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG relative luminance of an sRGB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contrast ratio between two opaque hex colors, per WCAG: (L1 + 0.05) /
 * (L2 + 0.05) with L1 the lighter luminance. Range 1 (identical) → 21
 * (black/white). Order-independent.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Does a contrast ratio meet WCAG AA? `large` relaxes the floor to 3.0:1. */
export function meetsAA(ratio: number, large = false): boolean {
  return ratio >= (large ? AA_LARGE : AA_NORMAL);
}
