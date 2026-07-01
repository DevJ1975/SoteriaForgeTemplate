# `@soteria-forge/mobile` — Expo/RN learner app conventions

The Soteria Forge learner app: React Native + Expo (**custom dev client**, never Expo Go). A
worker signs in against the single Cognito pool, sees **their tenant's** assigned courses, plays
lesson video, and completes training that syncs as append-only, idempotent xAPI statements.

> **NOT BUILT OR DEPLOYED.** Source-only scaffolding — no `npm install`, no `prebuild`, no native
> binary, no AWS/Expo resources. The AppSync backend is undeployed, so there is no
> `amplify_outputs.json`; the app boots unauthenticated and every data screen shows a
> "backend not deployed" empty state until it exists.

Owned by the **mobile** agent; the offline layer is owned by **offline-sync**. See root
`../../CLAUDE.md` for the shared contract.

## Custom dev client (why, not Expo Go)

Native modules absent from Expo Go force a development build: `react-native-video` (playback),
`@nozbe/watermelondb` (offline store — offline-sync's), `@react-native-community/netinfo`
(connectivity), `aws-amplify` + `@aws-amplify/react-native` (Cognito auth). Run `expo run:ios` /
`run:android` for a dev client, not Expo Go.

## Layout

```
app/                     expo-router route tree (THIN wrappers only)
  _layout.tsx            providers + auth/app split
  (auth)/sign-in.tsx     signed-out stack
  (app)/(tabs)/...       signed-in tabs (tenant-aware)
  (app)/course/[id].tsx  course detail (tenant-scoped lookup)
src/
  theme/                 ThemeProvider bridging @soteria-forge/ui tokens → RN StyleSheet
  auth/                  Amplify config + AuthProvider/useAuth (tenantId + groups from token)
  navigation/            AppProviders + the auth redirect guard
  api/                   tenant-scoped AppSync/Amplify Data client wrapper (the ONLY backend path)
  screens/ components/   SignIn, Home, CourseList, CourseDetail; Screen, OfflineBanner
  offline/  db/          OWNED BY offline-sync — leave the seams intact, do not implement here
```

Keep route files thin; put logic in `src/`.

## Tenant isolation on the client (the #1 rule)

The `tenantId` the app operates under comes **only** from the verified Cognito `custom:tenantId`
token claim (`src/auth/AuthProvider.tsx`). Never read it from user input, deep-link params, or
editable storage. A session whose token lacks `custom:tenantId` is treated as unauthenticated.
Every read goes through `src/api`, which is tenant-scoped by construction
(`getDataClient(tenantId)`) — there is **no unscoped query**; it's unspellable at the type level.
The server (Lambda authorizer + resolvers) is the real boundary; the client simply never sends a
tenantId it didn't get from the token, and a forged one is refused server-side.

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

`src/api` is the ONLY place feature code talks to the backend, and it is typed against
`@soteria-forge/shared` records (not raw GraphQL). Until the backend deploys it throws
`BackendNotConfiguredError` so the shell degrades predictably — never fake data. When the backend
ships, wire `generateClient<Schema>()` into the existing `runQuery`/`runGet` seam.

## Local workflow

```bash
npm --workspace @soteria-forge/mobile run typecheck   # tsc --noEmit (needs shared + ui built first)
npm --workspace @soteria-forge/mobile run start        # Metro (dev client) — after a native build exists
```

- Do NOT `npm install`, `prebuild`, run native/EAS builds, or create Expo resources.
- `.env` holds **non-secret** build hints only (`APP_ENV`, `SYNC_BATCH_SIZE`); copy from
  `.env.example`. Real config is the git-ignored `amplify_outputs.json` — never commit it, never
  inline credentials.
- Set `expo.extra.eas.projectId` only once an EAS project exists (currently a placeholder).
- Any change to auth-session or the data client goes through **security-reviewer**.
