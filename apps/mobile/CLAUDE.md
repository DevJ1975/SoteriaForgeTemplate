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

All color/spacing/type come from `@soteria-forge/ui` via `src/theme` — the **ember/spark** brand
(ember `#E8551F`, spark `#FFB552`, ink `#1A1D22`, paper `#F1EEE8`), which is THE brand
platform-wide per [ADR-0009](../../docs/adr/0009-unify-brand-ember-spark.md); the canonical
source is `packages/ui/src/theme.ts`. **Never hardcode a brand hex** in a component.

- **Appearance override** persists in AsyncStorage under key **`sf.appearance`**
  (`'light' | 'dark'`; key absent = follow the device). `src/theme/ThemeProvider.tsx` hydrates it
  async without gating first paint; the `AppearanceToggle` component (Home) sets it via
  `useThemeControls().setSchemeOverride`.
- **Haptics** go through `src/lib/haptics.ts` (`selection`/`success`/`error`), a fail-silent
  wrapper that lazy-imports `expo-haptics` — a missing native module is a no-op, so JS-only
  environments and older dev clients keep working.

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
npm --workspace @soteria-forge/mobile run test        # unit tests (node:test; see below)
npm --workspace @soteria-forge/mobile run start        # Metro (dev client) — after a native build exists
```

### Unit tests (`npm run test`)

Zero-dependency, same pattern as `packages/shared`: `tsconfig.test.json` seeds
tsc with `src/**/__tests__/**/*.test.ts`, pulls in their transitive imports,
and emits CommonJS to `.test-dist/` (git-ignored), which `node --test` runs
directly (Node ≥ 22.12 — the emitted CJS `require()`s shared's ESM dist).

**Only NODE-SAFE modules may enter the test import graph** — nothing that
imports `react-native`, `expo-*`, `@react-native-community/netinfo`, or
`../db` (the native SQLite adapter). The offline/auth layers are structured
for this: pure logic (`offline/queue.ts`, `offline/sync.ts`,
`supabase/chunkedSecureStorage.ts`, `auth/profileCacheCore.ts`,
`screens/courseSections.ts`, `api/lessonContent.ts`) takes its runtime
dependencies by INJECTION, and the native bindings live in
`offline/transport.ts`, `offline/singletons.ts`, and the thin
`secureSessionStorage.ts` / `profileCache.ts` wrappers. Test fakes:
`offline/__tests__/fakeDb.ts` interprets real WatermelonDB `Q` clauses (with
SQL null semantics) so the production query paths run unmodified; keystore
tests inject an in-memory `AsyncKeyValueStore` (`src/lib/secureStore.ts`).
Keep new tests importing the specific module under test — never the
`../offline` barrel (it drags in the native bindings).

- Do NOT `npm install`, `prebuild`, run native/EAS builds, or create Expo resources.
- `.env` holds the **client-safe** Supabase URL + publishable/anon key (RLS-protected) plus
  non-secret build hints (`APP_ENV`, `XAPI_SYNC_BATCH_SIZE`); copy from `.env.example`. The
  Supabase **service role key** must never appear in the app — never commit it, never inline it.
- Set `expo.extra.eas.projectId` only once an EAS project exists (currently a placeholder).
- Any change to auth-session or the data client goes through **security-reviewer**.
