# `@soteria-forge/web` — React + Vite learner/preview surface

A lightweight learner/preview web app: React 18 + Vite. A user signs in with **Supabase Auth**
(email/password), browses **their tenant's** RLS-scoped courses/lessons, and plays video lessons
with the official **Cloudflare Stream** player. This app is source-only — it has NOT been
`npm install`ed, built, or deployed.

Auto-included in the Turborepo via the root `apps/*` workspaces glob. See root `../../CLAUDE.md`
for the shared contract. Mirrors `apps/console` conventions.

## Scope (deliberately narrow)

Browse + play, nothing more. Offline sync, certificates, and content authoring intentionally stay
in `apps/mobile` (learner) and `apps/console` (admin) — do not add them here. This is a preview
surface where `@cloudflare/stream-react` fits natively (mobile is React Native, console is Vue, so
neither can import that package).

## Layout

```
index.html               Vite entry (Google Fonts <link>s: Oswald + Barlow Semi Condensed, #root, /src/main.tsx)
vite.config.ts           @vitejs/plugin-react; dev on :5182, preview on :4182 (host 0.0.0.0)
tsconfig.json            React (jsx react-jsx), strict, noEmit, moduleResolution Bundler
vercel.json              SPA rewrite (all routes → /index.html)
src/
  main.tsx               createRoot(...).render(<App/>) + imports theme/tokens.css, styles.css
  App.tsx                shell: config banner / SignIn / (header: theme toggle + avatar chip +
                         sign-out) + CourseList↔CourseDetail, with History-API URL sync
  supabase.ts            typed createClient<Database>; isSupabaseConfigured (never throws at import)
  auth.tsx               AuthProvider + useAuth (tenantId + role from the caller's profile)
  api.ts                 RLS-scoped data layer (listCourses / getCourseTree) — the ONLY backend path
  components/            StreamWebPlayer (Cloudflare Stream via stream-signed-url edge function)
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

Build `@soteria-forge/shared` first so its `dist/` declarations exist. Do **NOT** `npm install`,
run vite/tsc, build, or deploy — author correct source only. No secrets — config via `.env`
(git-ignored); only `.env.example` placeholders are tracked. Any change to how this app authorizes
or scopes tenant data goes through **security-reviewer**.
