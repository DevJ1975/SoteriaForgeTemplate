# Building & running the Soteria Forge learner app (Android / iOS)

`apps/mobile` is the **Android and iOS** learner app (React Native + Expo). It is a **custom dev
client** (native modules: `react-native-video`, `react-native-webview`, WatermelonDB, NetInfo), so
it runs via a dev-client build — **not Expo Go**. This repo keeps it **source-only**; the steps
below are what turn that source into something you can see on an Android device or emulator. None of
this runs in CI or the agent sandbox — run it on your own machine / Expo account.

Android package: `com.soteriaforge.learner` · slug `soteria-forge-mobile`.

> **Shortcut:** `scripts/setup-android.sh` (macOS/Linux) or `scripts/setup-android.ps1` (Windows)
> runs steps 0–3 for you — installs Claude Code, registers the Supabase MCP, installs deps, builds
> `@soteria-forge/shared`, and writes `apps/mobile/.env`. Then just launch an emulator and
> `cd apps/mobile && npx expo run:android`.

## 0. One-time prerequisites

- **Node 20+** and this monorepo checked out.
- A **Supabase `.env`** for the app (client-safe values only):
  ```bash
  cd apps/mobile
  cp .env.example .env
  # then set:
  #   EXPO_PUBLIC_SUPABASE_URL=https://bgnadngztngkwzneknhd.supabase.co
  #   EXPO_PUBLIC_SUPABASE_ANON_KEY=<the publishable/anon key>   # NEVER the service-role key
  ```
- Install workspace deps from the **repo root** (first build only): `npm install`.
- Build the shared packages first (their `dist/` feeds the app): `npm run build --workspace @soteria-forge/shared`.

Pick **one** of the two paths below.

## Path A — EAS cloud build → installable APK (no local Android SDK needed) ⭐ easiest

Best if you just want to **install and see it** on a phone. The build runs on Expo's servers and
gives you a downloadable `.apk`.

```bash
npm i -g eas-cli
eas login                                   # your Expo account (free tier is fine)

cd apps/mobile
# Link this app to an EAS project (writes the real projectId into app.json,
# replacing the REPLACE_WITH_EAS_PROJECT_ID placeholder):
eas init

# Make the client-safe Supabase values available to the cloud build:
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://bgnadngztngkwzneknhd.supabase.co" --environment preview
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --environment preview

# Build the installable APK (uses the "preview" profile in eas.json):
eas build -p android --profile preview
```

When it finishes, EAS prints a URL + QR code — open it on the phone (or `adb install <file>.apk`)
and the app installs. Sign in with a seeded account (e.g. `worker@atl.test` / `SoteriaForge!2026`)
to see real, tenant-scoped data.

## Path B — Local emulator / USB device (`expo run:android`)

Best if you want a live dev loop with fast reload. Requires **Android Studio + SDK** and an
emulator (AVD) or a USB device with USB debugging on.

```bash
# from repo root, first time:
npm install
npm run build --workspace @soteria-forge/shared

cd apps/mobile
npx expo run:android      # prebuilds the native android/ project, compiles, installs, launches
# subsequent runs / JS reload:
npm run start             # Metro (dev client)
```

## What you'll see (screen tour)

1. **Sign in** — email/password (Supabase Auth). New/invited users can redeem an invite ("Join your team").
2. **Home** — your assigned courses + a **My Certificates** section (with count).
3. **Course detail** — modules/lessons, progress, and a **"Certificate earned"** affordance once complete (opens the certificate).
4. **Lesson player** — a **video lesson** streams via the official Cloudflare Stream player in a WebView (online) or the cached MP4 (offline); **Mark complete** emits an append-only, idempotent xAPI statement that syncs (offline-first) and drives progress → certificate.

> Video playback shows a friendly "not available yet" placeholder until the Cloudflare Stream
> secrets are set on the edge function (see [`../../docs/OPERATIONS.md`](../../docs/OPERATIONS.md)
> → "Cloudflare Stream"). Everything else — sign-in, courses, completion, certificates — works
> without it.

## App icon & splash (operator step)

Binary image assets are **not authored in this repo** — generate them locally before a
distributable EAS build (a dev build works fine without them; Expo falls back to defaults):

1. Render PNGs from the forged-shield brand mark (the SVG geometry in
   `packages/ui/src/Logo.tsx`, or the console brand SVGs under
   `apps/console/src/assets/brand/logos/`):
   - `icon.png` — 1024×1024 app icon,
   - `adaptive-icon.png` — the Android adaptive-icon **foreground** (transparent background;
     `app.json` already sets the ink `#1A1D22` background layer),
   - `splash.png` — a centered splash mark (`app.json` already sets the paper `#F1EEE8`
     splash background, which is valid image-less config on its own).
2. Drop them in `apps/mobile/assets/` and point `app.json` at them (`expo.icon`,
   `expo.android.adaptiveIcon.foregroundImage`, `expo.splash.image`).
3. Rebuild (`eas build …` / `expo run:android`) — icons/splash are baked at build time.

## Notes

- The first EAS build generates an Android keystore for you (managed credentials) — no manual signing setup.
- `eas.json` defines three profiles: `development` (dev client APK), `preview` (installable APK — use this to *see* it), `production` (Play Store app-bundle).
- Do not commit `.env` or the service-role key. Only `.env.example` placeholders + the client-safe anon key belong anywhere near the client.
