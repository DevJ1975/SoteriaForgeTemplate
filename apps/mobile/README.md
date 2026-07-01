# @soteria-forge/mobile

The Soteria Forge learner app — React Native + Expo (**custom dev client**). A
worker signs in with **Supabase Auth** (email/password), sees **their tenant's**
assigned courses, plays lesson video, and completes training offline that syncs
as append-only, idempotent xAPI statements.

> **NOT YET BUILT OR DEPLOYED.** This is defined-as-code scaffolding. Nothing
> here has been `npm install`ed, `prebuild`ed, or built into a native binary,
> and no Expo cloud resources exist. The **backend is a live Supabase project**,
> but until this app is configured with `EXPO_PUBLIC_SUPABASE_URL` /
> `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`) it boots into an
> unauthenticated state and every data screen renders an "unconfigured" empty
> state. See **Bring-up** below.

## Why a custom dev client (not Expo Go)

This app depends on native modules that are **not** in the Expo Go runtime:

- `react-native-video` (v7) — lesson playback
- `@nozbe/watermelondb` — the offline store (owned by the offline layer)
- `@react-native-community/netinfo` — connectivity

So you must run a **development build** (custom dev client) rather than Expo Go.
(`@supabase/supabase-js` is pure JS and needs no native module.)

## Architecture at a glance

```
app/                         expo-router route tree (thin wrappers only)
  _layout.tsx                providers + auth/app split
  (auth)/sign-in.tsx         signed-out stack
  (app)/(tabs)/home,courses  signed-in tabs (tenant-aware)
  (app)/course/[id].tsx      course detail (tenant-scoped lookup)
src/
  theme/                     ThemeProvider bridging @soteria-forge/ui tokens → RN
  supabase/                  typed createClient<Database> (the one backend handle)
  auth/                      AuthProvider/useAuth (tenantId + role from the profile)
  navigation/                AppProviders + the auth redirect guard
  api/                       tenant-scoped Supabase data client (RLS-enforced)
  screens/                   SignIn, Home, CourseList, CourseDetail
  components/                Screen, OfflineBanner
  offline/  db/              OWNED BY THE OFFLINE AGENT — WatermelonDB + sync
```

### Design tokens

All colors/spacing/type come from `@soteria-forge/ui` via `src/theme`. That
package is the canonical, framework-agnostic token set (Ink/Bone/Cobalt —
mirrors `apps/console/src/theme/tokens.css`). We never hardcode brand values in
this app.

### Tenant isolation (the #1 rule)

The `tenantId` the app operates under comes **only** from the caller's
`public.profiles` row (`src/auth/AuthProvider.tsx`), fetched with the verified
Supabase session. It is never read from user input, deep-link params, or editable
storage, and the app **never sends a tenant_id for authorization**. Enforcement is
**Postgres RLS**: every read is constrained to the caller's tenant via
`public.current_tenant_id()`, and every insert is tenant-stamped by a BEFORE
INSERT trigger from the verified auth context — a forged tenant_id cannot widen
access. A session with no profile/tenant is treated as unauthenticated.

### Offline layer (owned by the offline agent)

`src/offline/**` and `src/db/**` hold the WatermelonDB models + append-only
completion outbox + sync engine + NetInfo. The sync engine's transport now
targets Supabase: it upserts each queued statement into
`public.completion_statements` with `onConflict: 'id', ignoreDuplicates: true`
(append-only + idempotent by the client UUID). The WatermelonDB queue and its
no-conflict design are unchanged — only the network target is Supabase:

- `src/api/useCourses.ts` — reads local WatermelonDB cache when offline, Supabase
  (RLS-scoped) when online, hydrating the cache.
- `src/components/OfflineBanner.tsx` — consumes the offline layer's
  NetInfo/queue-backed `useConnectivity()` hook.
- `src/navigation/AppProviders.tsx` — wraps `AuthProvider` with `OfflineProvider`.

xAPI statement ids are **client-generated UUIDs** (`@soteria-forge/shared`
`generateStatementId`), which is what makes offline retry idempotent — the
polyfill in `index.ts` (`react-native-get-random-values`) provides the crypto
RNG that depends on.

## Bring-up (when you're ready to actually run it)

> None of these steps have been run yet.

1. **Install** (from the monorepo root, so workspaces link):
   ```bash
   npm install
   npm run build --workspace @soteria-forge/shared
   npm run build --workspace @soteria-forge/ui
   ```
2. **Configure Supabase.** Copy `.env.example` → `.env` and set the
   client-safe (RLS-protected) publishable key + project URL:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://bgnadngztngkwzneknhd.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   The SERVICE ROLE key must NEVER go in the app. The publishable key is safe to
   ship — RLS is the boundary.
3. **Native project + dev client:**
   ```bash
   npm --workspace @soteria-forge/mobile run ios      # or: run android
   ```
   This runs `expo run:*`, which prebuilds the native project and installs the
   dev client on a simulator/device.
4. **Start Metro** (dev client):
   ```bash
   npm --workspace @soteria-forge/mobile run start
   ```

### EAS builds (cloud dev/preview binaries)

Distributing dev clients or preview builds uses EAS:

```bash
npx eas login
npx eas build:configure                 # creates eas.json (not committed yet)
npx eas build --profile development --platform ios     # dev client
npx eas build --profile preview --platform android     # internal testers
```

Set `expo.extra.eas.projectId` in `app.json` once the EAS project exists
(currently a `REPLACE_WITH_EAS_PROJECT_ID` placeholder). **No EAS project has
been created.**

## Env

Copy `.env.example` → `.env`. It holds the **client-safe** Supabase URL +
publishable/anon key (RLS-protected — meant to ship) plus non-secret build hints
(`APP_ENV`, sync batch size). The Supabase **service role key** must never appear
in this app or in env; only `.env.example` placeholders are tracked, and the real
`.env` is git-ignored.

## Type-check

```bash
npm --workspace @soteria-forge/mobile run typecheck
```

(Requires `@soteria-forge/shared` and `@soteria-forge/ui` to be built first so
their `dist/` type declarations exist.)
