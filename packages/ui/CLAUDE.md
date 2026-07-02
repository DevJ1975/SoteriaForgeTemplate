# packages/ui — conventions (Soteria Forge UI kit)

The **Soteria Forge UI kit**: a cross-platform React Native component library
(iOS / Android / Web via `react-native-web`) that is the **mobile design
language**. This file is the local contract for anyone editing this package; it
adds to — and never contradicts — the root `CLAUDE.md`.

> **State: adopted defined-as-code, undeployed.** Adopted per
> [ADR-0006](../../docs/adr/0006-adopt-soteria-forge-ui-kit.md), replacing the
> earlier tokens-only stub. Not `npm install`ed, not native-built, not deployed.

## What this is

- **Ember/spark** palette + **Oswald** (display) / **Barlow Semi Condensed**
  (body) type, with built-in **light and dark** schemes — one token source in
  `src/theme.ts`.
- ~32 components: form controls, surfaces/feedback, **gamification**, and
  **reporting**, plus motion/loading utilities (`Skeleton`, `useReducedMotion`).
  Single import surface is `src/index.ts`.

## Scope (read this first)

- **`apps/mobile` is the only consumer of the components.** `apps/console` (Vue)
  and `apps/web` (React DOM) must **not** import this package — these are React
  Native primitives, wrong for web apps.
- **Ember/spark is THE brand, platform-wide** (see
  [ADR-0009](../../docs/adr/0009-unify-brand-ember-spark.md)).
  `src/theme.ts` is the **canonical brand source**: `apps/web/src/theme/tokens.css`
  and `apps/console/src/theme/tokens.css` mirror its **values** as CSS custom
  properties. A brand change starts here (`palette` / `lightTheme` / `darkTheme`)
  and is then mirrored 1:1 into both `tokens.css` files — never the other way
  around, and never by hardcoding hexes in components.

## Consumed as source via Metro (no build step)

`package.json` `main`/`types`/`exports` all point at `src/index.ts`. There is **no
`dist/`** — `apps/mobile`'s Metro + Babel transpile the TSX directly. Do not add a
build step or emit artifacts; just export new components from `src/index.ts`.

**Peer deps the consuming app must provide** (declared in `package.json`
`peerDependencies`): `react` (>=18), `react-native` (>=0.76), and
**`react-native-svg` (>=15)** — the SVG dep powers `Logo`/`Wordmark`, the icon set,
`TrendChart`, `AchievementBadge`, and `RankMedal`. `apps/mobile` pins
`react-native-svg@15.8.0`.

**Fonts** are loaded by the app, not the kit. `src/theme.ts` `fonts` tokens are the
exact `expo-google-fonts` family names (`Oswald_600SemiBold`,
`BarlowSemiCondensed_500Medium`); `apps/mobile/app/_layout.tsx` loads them via
`useFonts`. If a family isn't registered, RN falls back to the system font — the
app still runs, off-design.

## Theme API (flat)

`useTheme()` returns a flat `Theme`:

- `theme.colors.{primary,primaryPressed,accent,bg,surface,card,border,text,`
  `textMuted,placeholder,onPrimary,inputBg,success,danger,warning,info,overlay}`
- `theme.radii`, `theme.spacing`, `theme.fonts.{display,body}`, `theme.mode`
  (`'light' | 'dark'`)

Exports (all from `src/theme.ts`, re-exported by `src/index.ts`):

- `ThemeProvider` — takes a **static** `{ theme }` prop; without a provider,
  components default to `lightTheme`.
- `lightTheme` / `darkTheme` — fully-resolved `Theme` objects. Pick per device
  scheme at the app level (`apps/mobile/src/theme/ThemeProvider` does this and
  re-exports the kit's `useTheme` + `elevation`).
- `palette` — the raw brand palette (ember, emberHot, emberDeep, spark, ink,
  charcoal, steel, paper, …). The **only** place brand hexes live.
- `elevation(1 | 2 | 3)` — cross-platform shadow (iOS shadow / Android elevation /
  web box-shadow).
- `ToastProvider` + `useToast()` (from `src/Toast.tsx`) — overlay snackbar; wrap
  the app root **once**, inside `ThemeProvider`.

## Component inventory

- **Form controls:** `Button` (pressed-scale feedback), `TextField` (forwards a
  ref to the inner `TextInput` + `returnKeyType`/`onSubmitEditing`/`blurOnSubmit`
  passthrough for focus chains), `Select`, `Slider`, `Switch`, `Checkbox`,
  `RadioGroup`, `DatePicker`.
- **Surfaces / feedback:** `Card`, `Badge`, `Chip`, `ProgressBar` (animated fill,
  `animated?: boolean`), `Divider`, `Dialog`, `Tabs`, `Accordion`, `Avatar`,
  `Toast` (fade + slide entrance), `Skeleton` (pulsing loading placeholder —
  `line`/`block`/`circle`).
- **Gamification:** `AchievementBadge` (metallic medallion — tiers/shapes/locked),
  `RankMedal`, `LeaderboardRow`, `BadgeGlyph` (13 achievement glyphs).
- **Reporting / brand:** `SectionHeading`, `StatTile`, `DataTable`, `TrendChart`
  (react-native-svg), `ReportPage` / `ScaledSurface`, `Certificate`, `Logo` /
  `Wordmark`, `icons` (`Check`, `ChevronDown`, `Close`, `Search`, `HomeIcon`,
  `CoursesIcon`, `ShowcaseIcon`, `AwardIcon`, `SunIcon`, `MoonIcon`).
- **Motion / a11y:** `useReducedMotion()` (from `src/motion.ts`) — all kit
  animations honor OS reduced-motion; interactive/informational components ship
  accessibility roles + labels by default.
- **Demo screens (default exports):** `ForgeUIShowcase`, `ReportScreen`.

## House rules (local)

- **Never hardcode a brand hex in a component.** Read colors from `useTheme()`
  (`theme.colors.*`) or, for raw brand values, from the `palette` export. New
  brand colors are added to `palette` + both themes in `src/theme.ts`, nowhere
  else.
- **Every new component is exported from `src/index.ts`** and reads its colors,
  radii, spacing, and fonts from `useTheme()` — so light/dark and any future
  rebrand just work.
- **No native-only modules** beyond `react-native-svg`. `Select` and `Slider` are
  built from core primitives to behave identically on web; keep it that way.
- **Stay defined-as-code.** Do not add a build step, run `npm install`, or pull in
  native deps — per the root house rules.

## Typechecking

`npm run typecheck` (`tsc --noEmit`) here is an **editor convenience only**; RN
type declarations resolve in the consuming app. The authoritative type-check is
`apps/mobile`'s `typecheck`.

## Reference previews

`preview/preview.html`, `preview/badges-preview.html`, and `preview/KIT_README.md`
are the original kit's static previews and README — reference material, not part
of the shipped surface. `README.md` is the human-facing package doc.
