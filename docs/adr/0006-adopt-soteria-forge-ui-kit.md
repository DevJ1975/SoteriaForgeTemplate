# ADR-0006: Adopt the Soteria Forge UI kit as `packages/ui`

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform, Design
- **Related:** [ADR-0004](./0004-turborepo-monorepo.md)

## Context

`packages/ui` was created by [ADR-0004](./0004-turborepo-monorepo.md) as a
placeholder: a **tokens-only stub** meant to be shared with mobile. It carried
brand tokens but shipped no components — `apps/mobile` had nothing real to render
against, and every screen would have had to hand-build buttons, inputs, cards,
badges, charts, and report surfaces from raw React Native primitives.

Separately, a **complete, coherent cross-platform React Native component kit** was
authored and uploaded — the "Soteria Forge UI" kit. It is a single-token-source
library (`theme.ts`) that renders on iOS, Android, and Web (via
`react-native-web`), with:

- a **flat theme API** — `ThemeProvider` / `useTheme` / `lightTheme` / `darkTheme`
  / `elevation()`, plus a `palette` export, and built-in **light and dark**
  schemes;
- ~31 components across form controls (`Button`, `TextField`, `Select`, `Slider`,
  `Switch`, `Checkbox`, `RadioGroup`, `DatePicker`), surfaces/feedback (`Card`,
  `Badge`, `Chip`, `ProgressBar`, `Divider`, `Dialog`, `Tabs`, `Accordion`,
  `Avatar`, `Toast` via `ToastProvider` + `useToast`), **gamification**
  (`AchievementBadge`, `RankMedal`, `LeaderboardRow`, `BadgeGlyph`), and
  **reporting** (`SectionHeading`, `StatTile`, `DataTable`, `TrendChart`,
  `ReportPage` / `ScaledSurface`, `Certificate`, `Logo` / `Wordmark`);
- an **ember/spark** palette and **Oswald** (display) + **Barlow Semi Condensed**
  (body) type — a warm, industrial identity distinct from the placeholder tokens.

The forces in play:

- `apps/mobile` needs a real, production-shaped component surface *now*; building
  one from scratch duplicates work the uploaded kit already does well.
- The kit is self-contained and cross-platform, so it drops into the
  Expo/Metro learner app with only well-known peer deps (`react-native-svg` for
  the SVG logo/icons/charts/medals; Google-hosted Oswald + Barlow fonts).
- The kit's **ember/spark** identity does **not** match the repo-canonical
  **Ink/Bone/Cobalt** brand that `apps/console` and the root `CLAUDE.md` define
  (`ink #0E1A2E`, `blue #3DA9FC`, `orange #FF6B1F`, `paper #F5F4EF`). Adopting the
  kit therefore introduces a **brand divergence** between mobile and console that
  must be recorded, not glossed over.

This decision must not break the [ADR-0004](./0004-turborepo-monorepo.md)
constraint that `apps/console` keeps building, nor the house rule against running
`npm install` / native / cloud builds — the kit is adopted **defined-as-code and
undeployed** (no native build, no `npm install`).

## Decision

**We adopt the uploaded Soteria Forge UI kit as the real `packages/ui`, consumed
by `apps/mobile`.** The tokens-only stub is replaced by the kit's source.

- **`packages/ui` ships the kit as source.** `package.json` `main`/`types` point
  at `src/index.ts`; there is **no `dist/` build step**. Metro + Babel in
  `apps/mobile` transpile the TSX directly (source-consumed via Metro), matching
  the monorepo's "shared/ui feed consumers" ordering from
  [ADR-0004](./0004-turborepo-monorepo.md).
- **`apps/mobile` is the sole consumer.** It declares `@soteria-forge/ui` as a
  workspace dependency, provides the peer deps — `react`, `react-native`, and
  **`react-native-svg`** (`15.8.0`) — and loads the display/body fonts
  (`Oswald_600SemiBold`, `BarlowSemiCondensed_500Medium`, plus extra weights) via
  `@expo-google-fonts/oswald` + `@expo-google-fonts/barlow-semi-condensed` in
  `app/_layout.tsx`. Those exact family names are the kit's `fonts` tokens, so the
  app and kit stay in sync from one source.
- **The app wraps the kit's provider.** `apps/mobile/src/theme/ThemeProvider`
  tracks the device color scheme (with a light/dark override) and renders the
  kit's `<ThemeProvider theme={lightTheme | darkTheme}>`, re-exporting the kit's
  `useTheme` + `elevation`.
- **The kit's palette/type is the mobile design language;** `apps/console` (Vue)
  stays on its own Ink/Bone/Cobalt tokens (`apps/console/src/theme/tokens.css`)
  and does **not** import this package.
- **Brand hexes are never hardcoded** in components — everything themes through
  `theme.ts` (`palette` / `lightTheme` / `darkTheme`), so a future rebrand is a
  single-file edit.

The brand mismatch between mobile (ember/spark) and console/root (Ink/Bone/Cobalt)
is a **known, documented divergence** (see Consequences) — an **open decision left
to the owner**, not silently resolved here.

## Alternatives considered

- **Keep the tokens-only stub and build components by hand — rejected.** It
  re-implements a library that already exists, coherently, cross-platform. It is
  slower, more error-prone, and would still owe the same ember-vs-Ink brand
  conversation once real screens shipped.
- **Re-skin the kit to Ink/Bone/Cobalt *before* adopting it — deferred, not
  chosen now.** This is one of the two reconciliation paths below, but doing it
  up front would delay getting a working component surface into mobile and
  entangles a design/brand call with a plumbing change. We adopt the kit as-is
  and record the divergence as an explicit open decision instead.
- **Publish `packages/ui` as a built `dist/` package — rejected.** The monorepo
  consumes shared packages as source through Metro/Babel; a build step adds
  tooling and a stale-artifact failure mode for no benefit to a single in-repo
  consumer. `tsc --noEmit` here is an editor convenience; the authoritative
  type-check is `apps/mobile`'s.
- **Use a third-party RN component library (e.g. a Material/Paper kit) —
  rejected.** None carries the Soteria Forge identity or the domain-specific
  gamification (achievement badges, rank medals, leaderboards) and reporting
  (branded report pages, certificates, trend charts) surfaces the training
  product needs. The uploaded kit already provides them, on-brand.

## Consequences

**Easier**

- `apps/mobile` builds screens against a complete, themed, cross-platform kit
  (form controls, surfaces, gamification, reporting) instead of raw primitives.
- Light/dark is free and device-driven: the app-level provider selects
  `lightTheme` / `darkTheme` from the OS scheme; every kit component follows.
- One token source (`theme.ts`) means a rebrand — including the reconciliation
  below — is a single-file change, never a component-by-component hunt.
- Reporting/certificate/leaderboard UI that matches the print templates now
  renders live in-app, no separate design system to maintain.

**Harder / ongoing cost — the brand divergence (OPEN DECISION)**

- **Mobile is now ember/spark while `apps/console` and the root `CLAUDE.md`
  remain Ink/Bone/Cobalt.** The product currently speaks two visual languages.
  This is deliberate and recorded here, but it is **not resolved** — the owner
  must pick one of two reconciliation paths:
  1. **Rebrand the console (and root brand tokens) to ember/spark** — make the
     kit's `ember #E8551F` / `spark #FFB552` / Oswald + Barlow the one Soteria
     Forge identity, and update `apps/console/src/theme/tokens.css` + the root
     `CLAUDE.md` brand section to match. Larger blast radius (touches the kept
     console), but yields a single brand.
  2. **Re-skin the kit to Ink/Bone/Cobalt** — rewrite `palette` / `lightTheme` /
     `darkTheme` in `packages/ui/src/theme.ts` to the canonical
     `ink #0E1A2E` / `blue #3DA9FC` / `orange #FF6B1F` / `paper #F5F4EF` (and
     swap the type if desired), so mobile and console share one brand with the
     console untouched. Smaller blast radius; loses the kit's authored ember look.

  Until the owner decides, treat the divergence as intentional. **Do not**
  "fix" it by hardcoding console hexes into the kit or kit hexes into the
  console — reconcile at the token source.

> **Resolution (2026-07-01):** the open brand decision recorded above was
> decided — path 1 won; **ember/spark is the one Soteria Forge brand**. See
> [ADR-0009](./0009-unify-brand-ember-spark.md).

**Other ongoing costs**

- New runtime peer deps for mobile: **`react-native-svg`** (logo, icons, charts,
  medals) and the Google-hosted **Oswald + Barlow** fonts. If a font family isn't
  registered the platform falls back to the system font — the app still runs, but
  off-design.
- **Undeployed / not native-built.** Per the house rules, the kit is adopted
  defined-as-code only: no `npm install`, no `pod install`, no native build, no
  deploy has been run. Correctness of the *definition* (source, workspace wiring,
  peer-dep declarations) is the deliverable; a native build is future work.
- `apps/console` is explicitly out of scope for this package and must keep
  building — importing `@soteria-forge/ui` into the Vue app is a mistake (wrong
  platform primitives).
