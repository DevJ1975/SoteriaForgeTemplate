# `@soteria-forge/mobile` — Expo/RN learner app conventions

The Soteria Forge learner app: React Native + Expo (**custom dev client**, never Expo Go). A
worker signs in with **Supabase Auth** (email/password), sees **their tenant's** assigned courses,
plays lesson video, and completes training that syncs as append-only, idempotent xAPI statements.

> **NOT BUILT OR DEPLOYED (app side).** Source-only scaffolding — no `npm install`, no `prebuild`,
> no native binary, no Expo resources. The **backend is a live Supabase project**; until this app
> is configured with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy
> `.env.example` → `.env`) it boots unauthenticated and every data screen shows an "unconfigured"
> empty state.

Owned by the **mobile** agent; the offline layer is owned by **offline-sync**. See root
`../../CLAUDE.md` for the shared contract.

## Custom dev client (why, not Expo Go)

Native modules absent from Expo Go force a development build: `react-native-video` (playback),
`react-native-webview` (Cloudflare Stream online player embed), `@nozbe/watermelondb` (offline
store — offline-sync's), `@react-native-community/netinfo` (connectivity). Run `expo run:ios` /
`run:android` for a dev client, not Expo Go. (`@supabase/supabase-js` is pure JS — no native
module needed.)

## Layout

```
app/                     expo-router route tree (THIN wrappers only)
  _layout.tsx            providers + auth/app split
  (auth)/sign-in.tsx     signed-out stack
  (app)/(tabs)/...       signed-in tabs (tenant-aware)
  (app)/course/[id].tsx  course detail (tenant-scoped lookup)
src/
  theme/                 ThemeProvider bridging @soteria-forge/ui tokens → RN StyleSheet
  supabase/              typed createClient<Database> (the ONE backend handle)
  auth/                  AuthProvider/useAuth (tenantId + role from the caller's profile)
  navigation/            AppProviders + the auth redirect guard
  api/                   tenant-scoped Supabase data client (RLS-enforced; the ONLY backend path)
  screens/ components/   SignIn, Home, CourseList, CourseDetail; Screen, OfflineBanner
  offline/  db/          OWNED BY offline-sync — leave the seams intact, do not implement here
```

Keep route files thin; put logic in `src/`.

## Tenant isolation on the client (the #1 rule)

The `tenantId` the app operates under comes **only** from the caller's `public.profiles` row
(`src/auth/AuthProvider.tsx`), fetched with the verified Supabase session. Never read it from user
input, deep-link params, or editable storage. A session with no profile/tenant is treated as
unauthenticated. The app **never sends a tenant_id for authorization** — every read/write is
constrained by **Postgres RLS** to the caller's own tenant via `public.current_tenant_id()`, and
inserts are tenant-stamped by a BEFORE INSERT trigger from the verified auth context. Reads still
go through `src/api` (`getDataClient(tenantId)`); the tenantId there tags the offline cache and
fails closed, it is NOT a scoping arg (RLS already scopes the query). A forged tenant_id cannot
widen access — Postgres refuses it. The `super-admin` role is the one cross-tenant role.

## Design tokens

All color/spacing/type come from `@soteria-forge/ui` via `src/theme` (Ink/Bone/Cobalt: ink
`#0E1A2E`, blue `#3DA9FC`, orange `#FF6B1F`, paper `#F5F4EF`). **Never hardcode a brand hex** in a
component.

## Offline invariants (seams here, engine in offline-sync)

`src/offline/**` and `src/db/**` belong to **offline-sync**. This shell leaves documented seams —
do not fill them yourself:

- `src/api/useCourses.ts` — swap the source to a local WatermelonDB store.
- `src/components/OfflineBanner.tsx` — replace the local `useConnectivity()` fallback with the
  offline layer's NetInfo/queue-backed hook.
- `src/navigation/AppProviders.tsx` — wrap `AuthProvider` with `OfflineProvider`.

xAPI statement ids are **client-generated UUIDs** (`@soteria-forge/shared` `generateStatementId`);
the `react-native-get-random-values` polyfill in `index.ts` provides the crypto RNG. Reusing the
SAME id on retry is what makes offline sync **idempotent** — there is **no conflict resolution**.

## Data client

`src/api` is the ONLY place feature code talks to the backend. It wraps the typed
`supabase.from<...>()` client (`src/supabase`, parameterized by `Database` from
`@soteria-forge/shared/supabase`) and maps rows to `@soteria-forge/shared` records. Queries carry
**no** `tenant_id` filter — RLS scopes them to the caller's tenant. When Supabase credentials are
unset the methods throw `BackendNotConfiguredError` so the shell degrades predictably — never fake
data.

## Local workflow

```bash
npm --workspace @soteria-forge/mobile run typecheck   # tsc --noEmit (needs shared + ui built first)
npm --workspace @soteria-forge/mobile run start        # Metro (dev client) — after a native build exists
```

- Do NOT `npm install`, `prebuild`, run native/EAS builds, or create Expo resources.
- `.env` holds the **client-safe** Supabase URL + publishable/anon key (RLS-protected) plus
  non-secret build hints (`APP_ENV`, `XAPI_SYNC_BATCH_SIZE`); copy from `.env.example`. The
  Supabase **service role key** must never appear in the app — never commit it, never inline it.
- Set `expo.extra.eas.projectId` only once an EAS project exists (currently a placeholder).
- Any change to auth-session or the data client goes through **security-reviewer**.
