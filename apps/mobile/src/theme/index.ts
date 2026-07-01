/**
 * Theme barrel. App code imports everything theme-related from `@/theme`:
 *   - the device-aware `ThemeProvider` + `useThemeControls` (light/dark toggle)
 *   - the kit's flat `useTheme()` and cross-platform `elevation()` helper
 *   - the canonical `Theme` type (owned by `@soteria-forge/ui`)
 */
export { ThemeProvider, useThemeControls } from './ThemeProvider';
export type { ThemeProviderProps, ColorScheme } from './ThemeProvider';

// Flat theme hook + shadow helper come straight from the kit (single source).
export { useTheme, elevation } from '@soteria-forge/ui';
export type { Theme, ThemeColors } from '@soteria-forge/ui';
