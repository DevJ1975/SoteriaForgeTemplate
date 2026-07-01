# @soteria-forge/mobile

The Soteria Forge learner app — React Native + Expo (**custom dev client**). A
worker signs in against the single Cognito user pool, sees **their tenant's**
assigned courses, plays lesson video, and (via a later offline layer) completes
training offline that syncs as append-only, idempotent xAPI statements.

> **NOT YET BUILT OR DEPLOYED.** This is defined-as-code scaffolding. Nothing
> here has been `npm install`ed, `prebuild`ed, or built into a native binary,
> and no AWS/Expo cloud resources exist. The AppSync backend is likewise
> undeployed, so there is no `amplify_outputs.json` yet — the app boots into an
> unauthenticated state and every data screen renders a "backend not deployed"
> empty state until it exists. See **Bring-up** below.

## Why a custom dev client (not Expo Go)

This app depends on native modules that are **not** in the Expo Go runtime:

- `react-native-video` (v7) — lesson playback
- `@nozbe/watermelondb` — the offline store (owned by the offline layer)
- `@react-native-community/netinfo` — connectivity
- `aws-amplify` + `@aws-amplify/react-native` — Cognito auth

So you must run a **development build** (custom dev client) rather than Expo Go.

## Architecture at a glance

```
app/                         expo-router route tree (thin wrappers only)
  _layout.tsx                providers + auth/app split
  (auth)/sign-in.tsx         signed-out stack
  (app)/(tabs)/home,courses  signed-in tabs (tenant-aware)
  (app)/course/[id].tsx      course detail (tenant-scoped lookup)
src/
  theme/                     ThemeProvider bridging @soteria-forge/ui tokens → RN
  auth/                      Amplify config + AuthProvider/useAuth (tenantId + groups)
  navigation/                AppProviders + the auth redirect guard
  api/                       tenant-scoped AppSync/Amplify Data client wrapper
  screens/                   SignIn, Home, CourseList, CourseDetail
  components/                Screen, OfflineBanner
  offline/  db/              OWNED BY THE OFFLINE AGENT — not in this scaffold
```

### Design tokens

All colors/spacing/type come from `@soteria-forge/ui` via `src/theme`. That
package is the canonical, framework-agnostic token set (Ink/Bone/Cobalt —
mirrors `apps/console/src/theme/tokens.css`). We never hardcode brand values in
this app.

### Tenant isolation (the #1 rule)

The `tenantId` the app operates under comes **only** from the verified Cognito
`custom:tenantId` token claim (`src/auth/AuthProvider.tsx`). It is never read
from user input, deep-link params, or editable storage. Every data read goes
through `src/api` scoped to that tenant, and the server (Lambda authorizer +
AppSync resolvers) is the real enforcement point: a forged tenantId is refused
cross-tenant. A session whose token lacks `custom:tenantId` is treated as
unauthenticated.

### Offline seams (owned by a later agent)

`src/offline/**` and `src/db/**` are intentionally absent — a following offline
agent owns them (WatermelonDB models + sync engine + NetInfo). This scaffold
leaves explicit, documented seams so that work drops in without touching the
shell:

- `src/api/useCourses.ts` — swap the source to a local WatermelonDB store.
- `src/components/OfflineBanner.tsx` — replace the local `useConnectivity()`
  fallback with the offline layer's NetInfo/queue-backed hook.
- `src/navigation/AppProviders.tsx` — wrap `AuthProvider` with `OfflineProvider`.

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
2. **Backend outputs.** In `backend/`, start a sandbox to generate the runtime
   config the app loads:
   ```bash
   npx ampx sandbox            # writes amplify_outputs.json
   ```
   Copy/symlink the generated `amplify_outputs.json` into `apps/mobile/` (it is
   git-ignored). `amplify_outputs.example.json` shows the expected shape.
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

Copy `.env.example` → `.env`. It holds **non-secret** build-time hints only
(`APP_ENV`, sync batch size). Real credentials live in the git-ignored
`amplify_outputs.json`, never in env or source.

## Type-check

```bash
npm --workspace @soteria-forge/mobile run typecheck
```

(Requires `@soteria-forge/shared` and `@soteria-forge/ui` to be built first so
their `dist/` type declarations exist.)
