# @soteria-forge/ui

Soteria Forge's cross-platform React Native component library (iOS / Android / Web via
`react-native-web`). This is the **brand design language**: the ember/spark palette with
Oswald (display) + Barlow Semi Condensed (body). It is consumed as **source** by the app's
Metro bundler — there is no `dist/` build step.

> Scope: ember/spark is **the** brand platform-wide (ADR-0009). `src/theme.ts` is the canonical
> brand source; `apps/web/src/theme/tokens.css` and `apps/console/src/theme/tokens.css` mirror
> its **values** as CSS custom properties. Only `apps/mobile` imports this package's components
> (React Native primitives — wrong for the web apps).

## Install / consume

Already wired as a workspace dependency of `apps/mobile`. `package.json` `main` points at
`src/index.ts`, so Metro + Babel transpile the TSX directly. Runtime peer deps the app must
provide: `react`, `react-native`, and `react-native-svg` (all present in `apps/mobile`). The
display/body fonts (`Oswald_600SemiBold`, `BarlowSemiCondensed_500Medium`) are loaded by the
app via `expo-google-fonts` in `app/_layout.tsx`.

```tsx
import {
  ThemeProvider, useTheme, lightTheme, darkTheme, elevation, palette,
  ToastProvider, useToast, useReducedMotion,
  Button, Card, TextField, Skeleton, /* …32 components… */
  HomeIcon, CoursesIcon, ShowcaseIcon, AwardIcon, SunIcon, MoonIcon,
} from '@soteria-forge/ui';
```

Loading states use `Skeleton` (`variant: 'line' | 'block' | 'circle'`) — it pulses via core
`Animated` and renders static under OS reduced-motion. `useReducedMotion()` is exported for
app-level animations; every kit animation (button press scale, progress fill, toast entrance,
skeleton pulse) already honors it.

## Theme API (flat)

`useTheme()` returns a flat `Theme`:

- `theme.colors.{primary,primaryPressed,accent,bg,surface,card,border,text,textMuted,placeholder,onPrimary,inputBg,success,danger,warning,info,overlay}`
- `theme.radii`, `theme.spacing`
- `theme.fonts.{display,body}`
- `theme.mode` (`'light' | 'dark'`)

`ThemeProvider` takes a static `{ theme }` prop. `elevation(1|2|3)` returns a cross-platform
shadow. `palette`, `lightTheme`, `darkTheme` are exported for direct use.

In `apps/mobile` the app-level `src/theme/ThemeProvider` wraps this provider, selecting
`lightTheme`/`darkTheme` from the device color scheme (with an override for a light/dark toggle),
and re-exports the kit's `useTheme` + `elevation`.

## Typechecking

`tsc --noEmit` here is an editor convenience only; RN type declarations resolve in the consuming
app. The authoritative type-check is `apps/mobile`'s `typecheck`.

## Reference previews

`preview/preview.html`, `preview/badges-preview.html`, and `preview/KIT_README.md` are the
original kit's static previews and docs — reference material, not part of the built surface.
