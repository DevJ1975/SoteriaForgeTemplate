# `@soteria-forge/web` — React + Vite learner/preview surface

A lightweight learner/preview web app: React 18 + Vite, shipped as an **installable PWA**
([ADR-0010](../../docs/adr/0010-web-installable-pwa.md)). A user signs in with **Supabase Auth**
(email/password), browses **their tenant's** RLS-scoped courses/lessons, and plays video lessons
with the official **Cloudflare Stream** player. Source-only in this repo (verify builds in a
throwaway install, never here); the Vercel deploy builds it for real.

Auto-included in the Turborepo via the root `apps/*` workspaces glob. See root `../../CLAUDE.md`
for the shared contract. Mirrors `apps/console` conventions.

## Scope (browse + play + record completions)

Browse, play, **and record lesson completions** ([ADR-0011](../../docs/adr/0011-web-completion-recording.md)).
Kiosk/desktop training now earns credit, so the compliance record no longer splits by device: this
surface records xAPI completions **identically to `apps/mobile`** — same shared
`createCompletionStatement` (client UUID = idempotency key), same append-only outbox drained by an
idempotent `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`, same
`context: { course_id, lesson_id }` the migration-12 progress trigger reads. The outbox is a
browser-native **IndexedDB** store (`src/offline/**`) — never a Workbox runtime cache — so it
persists a learner's own outbound writes without ever caching an RLS response.

**Certificates and content authoring still live elsewhere** (certificates: `apps/mobile`/backend;
authoring: `apps/console`) — do not add them here. `@cloudflare/stream-react` still fits this
surface natively (mobile is React Native, console is Vue, so neither can import that package).

Design tokens, tenant isolation, and the "never cache RLS responses" PWA rule are unchanged and
still binding; the outbox honors the last one by living in IndexedDB, and Supabase remains an
explicit Workbox `NetworkOnly` route (never added to a runtime cache).

## PWA (installable, app-shell offline)

Ships via `vite-plugin-pwa` (Workbox), `registerType: 'prompt'` — an updated service worker
**waits**; `src/pwa/PwaNotices` surfaces a "new version" toast and reloads only on user consent
(never mid-lesson). The SW precaches the built app shell so a returning learner opens the app
offline. **Auth + tenant data are NEVER cached** — Supabase (`*.supabase.co`) and Cloudflare
Stream are explicit `NetworkOnly` routes in the Workbox config; caching an RLS response could
serve one user's data to another after a session change, or serve stale training state. Offline =
the shell renders; sign-in and fresh data still need the network (a connectivity bar + the
screens' fetch-error states make that visible). Google Fonts are cached so the offline shell keeps
its type. Manifest + icons live in `vite.config.ts` / `public/`; **iOS** needs the Apple `<meta>`
+ `apple-touch-icon` in `index.html` (it does not read the manifest for those). Icons are
rasterized from the forged-shield SVGs (`public/icon{,-maskable}.svg`) — maskable keeps the mark
inside the safe circle. `devOptions.enabled: false` keeps the SW out of `vite dev`.

## Sign-in background (jobsite photo / video + ember scrim)

`SignIn` renders a full-bleed jobsite background behind the card, subdued by a strong ember scrim
(`.signin__scrim`, `color-mix` ember wash) so the card stays high-contrast. On each load it
**randomly** shows either the looping muted video (`public/signin-bg.mp4`, `autoplay/muted/loop/
playsinline`) or the still (`public/signin-bg.jpg`, referenced from CSS); a slight **pointer
parallax** drifts the layer a few px (set via `--sf-parallax-*` CSS vars). All motion is disabled
under `prefers-reduced-motion` (→ always the still) and pointer parallax only runs for a fine
pointer. If the video can't decode, `onError` falls back to the still; if `signin-bg.jpg` is
absent, the still layer falls back to the ember gradient — so the screen is never broken. The
video/photo are **not** precached (not in the Workbox globs) — the login screen needs the network
anyway, and a 6.6 MB precache would bloat installs. (For scale, a jobsite clip is a candidate to
move to Cloudflare Stream later; for now it ships from `public/`.)

## Vercel deploy (config in `vercel.json`, not the dashboard)

Same discipline as `apps/console`: the `installCommand` prunes the ephemeral clone's `workspaces`
list to `apps/web` + `packages/shared` before `npm install` (npm resolves the FULL workspace tree
even under `--workspace`, so an unrelated sibling's bad dep would otherwise sink this deploy);
`buildCommand` builds `@soteria-forge/shared` then the web app; `framework` is pinned to `vite`.
`build.env` carries the two **client-safe** values Vite inlines at build time (`VITE_SUPABASE_URL`
+ the `sb_publishable_…` key — RLS-protected, ships in the bundle by design; the service-role key
never enters). `headers` set `must-revalidate` on `sw.js` + the manifest so updates propagate.
`index.html` carries a boot-failure fallback that paints a readable error instead of a white page.
CI's `verify-web` job builds the app and asserts the SW + manifest were emitted.

## Layout

```
index.html               Vite entry (Google Fonts <link>s: Oswald + Barlow Semi Condensed, #root, /src/main.tsx)
vite.config.ts           @vitejs/plugin-react + VitePWA (manifest + Workbox SW); dev on :5182
tsconfig.json            React (jsx react-jsx), strict, noEmit, moduleResolution Bundler
vercel.json              framework=vite, scoped install/build, VITE_SUPABASE_* build env,
                         sw.js/manifest cache headers, SPA rewrite (see "Vercel deploy")
public/                  favicon.svg + icon{,-maskable}.svg + rasterized PNG icons + apple-touch
src/
  main.tsx               createRoot(...).render(<App/>) + imports theme/tokens.css, styles.css
  App.tsx                shell: config banner / SignIn / (header: install + theme toggle + avatar
                         + sign-out) + CourseList↔CourseDetail, URL sync; mounts <PwaNotices/>
  pwa/                   PWA UX: PwaNotices (SW register + update/offline toasts), InstallButton,
                         useInstallPrompt, useOnlineStatus
  supabase.ts            typed createClient<Database>; isSupabaseConfigured (never throws at import)
  auth.tsx               AuthProvider + useAuth (tenantId + role from the caller's profile)
  api.ts                 RLS-scoped data layer (listCourses / getCourseTree; lessons carry parsed
                         content) — the ONLY backend read path
  offline/               completion recording (ADR-0011): outboxCore (pure logic), outbox
                         (IndexedDB store), transport (Supabase upsert — mirrors mobile), sync
                         (WebSyncEngine), OutboxProvider (React context: recordCompletion + counts)
  components/            StreamWebPlayer (Cloudflare Stream via stream-signed-url edge function),
                         LessonPlayer (body/quiz/mark-complete), QuizView (local scoring), SyncStatus
  screens/               SignIn, CourseList, CourseDetail
  theme/theme.ts         sf-theme preference module (getStoredTheme / applyTheme / setTheme)
  theme/tokens.css       --sf-* design tokens (VALUE-identical mirror of apps/console; canonical
                         brand source is packages/ui/src/theme.ts)
  styles.css             app/component styles — references ONLY --sf-* tokens
  vite-env.d.ts          Vite client types
```

Routing is **state-driven WITH History-API URL sync** (still no react-router, to keep the
dependency surface minimal): the open course is mirrored to `/courses/:id` via `pushState`, and a
`popstate` listener re-syncs state on browser back/forward. The URL carries **resource ids only**
— Postgres RLS gates every read server-side, so an unknown or foreign id simply renders the
not-found state. No tenant material ever appears in (or is read from) the URL.

## Tenant isolation (the #1 rule) — enforced by Postgres RLS

The `tenantId` this app operates under comes **only** from the caller's `public.profiles` row
(`src/auth.tsx`), fetched with the verified Supabase session — never from user input, query
params, or editable storage. A session with no profile/tenant is treated as **unauthenticated**
(this surface has no invite-redemption flow). The app **never sends a tenant_id (or user_id) for
authorization**: every read is constrained by **Postgres RLS** to the caller's own tenant via
`public.current_tenant_id()`. The `StreamWebPlayer` sends the edge function **only** a `lesson_id`;
the tenant is derived server-side. `super-admin` is the one cross-tenant role, expressed by RLS.

## Keys / secrets

Only the **anon/publishable** key belongs in this client bundle — it is client-safe precisely
because RLS is the real gate. The Supabase **service-role key must NEVER** appear here (it bypasses
RLS): never commit it, never inline it. Config comes from `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` in a git-ignored `.env` (copy from the tracked `.env.example`). Unlike the
console, `src/supabase.ts` does **not** throw at import when the env is unset — it exports
`isSupabaseConfigured = false` and a lazily-guarded client so the app renders a "backend not
configured" state (mirrors the mobile app's pattern).

### Environment variables

| Var | What | Notes |
|-----|------|-------|
| `VITE_SUPABASE_URL` | Supabase project URL (public) | client-safe |
| `VITE_SUPABASE_ANON_KEY` | Publishable/anon key (RLS-protected) | client-safe — **never** the service-role key |

## Design tokens

All colour/space/type come from `src/theme/tokens.css` (`--sf-*` custom properties). The brand is
**ember/spark** (warm industrial): the **canonical scale lives in `packages/ui/src/theme.ts`**,
and this file mirrors `apps/console/src/theme/tokens.css` with **byte-identical VALUES**.
Components reference semantic tokens (`--sf-text-*`, `--sf-bg-*`, `--sf-border-*`,
`--sf-status-*`, `--sf-focus-ring*`) or ramp steps (`--sf-color-ember-*`, `--sf-color-spark-*`,
`--sf-color-ink-*`) — **never hardcode a brand hex** in a component or stylesheet (inline SVG
glyphs use `currentColor`). If the scale changes, `packages/ui` moves first and the console + web
mirrors move with it.

## Theme (`sf-theme` contract)

`src/theme/theme.ts` owns the theme preference: the localStorage key **`sf-theme`** holds
`'light' | 'dark' | 'system'` (default `'system'`, try/catch-safe when storage is unavailable).
The preference is applied as a `data-theme` attribute on `document.documentElement` — `"light"` /
`"dark"` explicitly; for `'system'` the attribute is **ABSENT** so the `prefers-color-scheme`
block in `tokens.css` decides. The header toggle in `App.tsx` cycles light → dark → system, and
the stored preference is applied on startup.

## Shared contract

Import domain types (`CourseRecord`, `ModuleRecord`, `LessonRecord`, `LessonKind`) and the Supabase
row aliases (`CourseRow`, `ModuleRow`, `LessonRow`, `Database`) from `@soteria-forge/shared` /
`@soteria-forge/shared/supabase` — never redeclare them locally. `src/api.ts` maps rows onto the
shared records; keep its public shape stable when repointed.

## Local workflow

```bash
npm run dev        --workspace @soteria-forge/web   # vite dev  (http://localhost:5182)
npm run typecheck  --workspace @soteria-forge/web   # tsc --noEmit
npm run build      --workspace @soteria-forge/web   # tsc --noEmit && vite build
```

Build `@soteria-forge/shared` first so its `dist/` declarations exist. Do **NOT** `npm install` or
build **in the repo** — author correct source only; CI (`verify-web`) and the Vercel deploy do the
real install/build. No secrets — client config is the public URL + `sb_publishable_…` key (in
`vercel.json` `build.env` and a git-ignored `.env`; only `.env.example` placeholders are tracked);
the service-role key never appears here. Any change to how this app authorizes or scopes tenant
data goes through **security-reviewer**.
