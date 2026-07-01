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
index.html               Vite entry (Inter font <link>s, #root, /src/main.tsx)
vite.config.ts           @vitejs/plugin-react; dev on :5182, preview on :4182 (host 0.0.0.0)
tsconfig.json            React (jsx react-jsx), strict, noEmit, moduleResolution Bundler
vercel.json              SPA rewrite (all routes → /index.html)
src/
  main.tsx               createRoot(...).render(<App/>) + imports theme/tokens.css, styles.css
  App.tsx                shell: config banner / SignIn / (header + CourseList↔CourseDetail)
  supabase.ts            typed createClient<Database>; isSupabaseConfigured (never throws at import)
  auth.tsx               AuthProvider + useAuth (tenantId + role from the caller's profile)
  api.ts                 RLS-scoped data layer (listCourses / getCourseTree) — the ONLY backend path
  components/            StreamWebPlayer (Cloudflare Stream via stream-signed-url edge function)
  screens/               SignIn, CourseList, CourseDetail
  theme/tokens.css       --sf-* design tokens (1:1 verbatim mirror of apps/console + packages/ui)
  styles.css             app/component styles — references ONLY --sf-* tokens
  vite-env.d.ts          Vite client types
```

Routing is intentionally **state-based** (no react-router) to keep the dependency surface minimal.

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

All colour/space/type come from `src/theme/tokens.css` (`--sf-*` custom properties), a **1:1
verbatim mirror** of `apps/console/src/theme/tokens.css` and `packages/ui`. Ink/Bone/Cobalt: ink
`#0E1A2E`, blue `#3DA9FC`, orange `#FF6B1F`, paper `#F5F4EF`. **Never hardcode a brand hex** in a
component or stylesheet — reference the `--sf-*` vars. If the token scale changes, the console and
`packages/ui` move with it.

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
