/**
 * Theme barrel. Re-exports the RN ThemeProvider/hooks and the canonical `Theme`
 * type so app code imports everything theme-related from `@/theme`.
 */
export { ThemeProvider, useTheme, useThemeControls } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
export type { Theme, ColorScheme } from '@soteria-forge/ui';
