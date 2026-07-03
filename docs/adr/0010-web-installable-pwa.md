# ADR-0010: Make the web learner surface an installable PWA

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Owner, Platform
- **Related:** [ADR-0005](./0005-video-cloudflare-stream.md) (Cloudflare Stream
  playback), [ADR-0007](./0007-supabase-backend.md) (Supabase + RLS)

## Context

`apps/web` is the React + Vite learner/preview surface: sign in with Supabase
Auth, browse the caller's RLS-scoped courses, play lesson video via the official
Cloudflare Stream player. It was source-only — never built or deployed, with no
deploy config, no install/offline story, and no CI gate — the same pre-flight
state `apps/console` and `apps/mobile` were in before they were hardened.

The owner asked to build it out as a **PWA**: installable to a home screen and
usable (as far as its cached shell allows) without a live connection.

Two constraints shape the design:

- **Tenant isolation is non-negotiable.** Every data read is RLS-scoped to the
  verified session. A service worker that cached Supabase responses could serve
  one user's tenant data to another after a session change, or serve stale
  training state — both unacceptable for a compliance product.
- **Minimal, verifiable dependencies.** The repo is defined-as-code; we verify
  builds in throwaway installs, never in the repo.

## Decision

Adopt **`vite-plugin-pwa`** (Workbox) and ship `apps/web` as an installable,
app-shell PWA.

- **Service worker (Workbox, `registerType: 'prompt'`).** Precache the built app
  shell (JS/CSS/HTML/icons) so a returning learner opens the app offline. An
  updated SW **waits**; the app surfaces a "new version" toast and reloads only
  when the user accepts — never mid-lesson.
- **No caching of authenticated/tenant data.** Supabase (`*.supabase.co`) and
  Cloudflare Stream are explicit **`NetworkOnly`** routes. Only our own static
  assets and Google Fonts are cached. Offline = the shell renders; sign-in and
  fresh course data still require the network, surfaced by a connectivity bar and
  the screens' existing fetch-error states.
- **Manifest + icons.** A web app manifest (standalone, ember/spark theme) plus
  full-bleed and maskable forged-shield PNG icons (192/512) and an iOS
  apple-touch-icon, rasterized from SVG. iOS Apple-specific `<meta>` cover the
  home-screen icon and standalone chrome it doesn't read from the manifest.
- **Install UX.** Capture `beforeinstallprompt` for a header Install button on
  Chromium; show an Add-to-Home-Screen hint on iOS Safari (no programmatic
  prompt exists there).
- **Deploy hardening (prerequisite).** `vercel.json` gains a pinned `vite`
  framework, a workspace-scoped install/build (web + shared), the two
  client-safe `VITE_SUPABASE_*` build vars, and `Cache-Control: must-revalidate`
  headers for `sw.js` + the manifest. `index.html` gains a boot-failure fallback
  (the same fix that resolved the console white page). A `verify-web` CI job
  type-checks and builds the app on every PR and asserts the SW + manifest were
  emitted.

## Alternatives considered

- **Hand-rolled service worker (no plugin).** Fewer deps, but Vite content-hashes
  asset filenames at build, so a hand-rolled SW cannot precache them without a
  build-time manifest — exactly what `vite-plugin-pwa`/Workbox generates. Rejected:
  more fragile, less correct, for no real dependency saving.
- **`registerType: 'autoUpdate'`.** Simpler, but silently reloads the page on
  update — hostile to a learner mid-lesson. Rejected in favour of the prompt flow.
- **Offline data (cache courses/lessons, queue completions).** The mobile app
  owns the durable-offline story (WatermelonDB + an append-only, per-user-fenced
  xAPI outbox). Replicating that safely on web needs the same per-user cache
  partitioning and is out of scope here; the web app stays **app-shell offline**.

## Consequences

- The web app is installable and opens offline (cached shell); it is deployable
  with the same repo-reviewed config discipline as the console.
- Offline is deliberately shallow: no data works offline. This is a security and
  scope choice, revisited only with a mobile-grade per-user offline cache.
- `apps/web` scope is unchanged (browse + play). Porting the mobile learner loop
  (progress, completion, certificates) to web remains a separate, larger decision.
