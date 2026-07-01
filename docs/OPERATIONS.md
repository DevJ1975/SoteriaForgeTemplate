# Operations runbook — Soteria Forge (live Supabase project)

Operator actions that **cannot** be done in code / migrations and must be set in the Supabase
dashboard (or another console). Everything schema/RLS/policy-shaped lives in `supabase/migrations/`
and is applied via `supabase db push`; this file is only for the console-only knobs.

**Live project:** `Soteria Forge` · ref `bgnadngztngkwzneknhd` · org `Trainovations` ·
`https://bgnadngztngkwzneknhd.supabase.co`

## 1. Auth hardening toggles (dashboard only)

From the security review (`SECURITY_REVIEW.md`). Status column is the last known state.

| Setting | Where (Supabase dashboard) | Why | Status |
|---|---|---|---|
| **Confirm email** | Authentication → **Sign In / Providers** → Email → *Confirm email* | Makes a signup's email actually **verified**, so `redeem_invitation`'s email-match is a real second factor (review Finding 3). Mirrors `supabase/config.toml` `enable_confirmations = true`. | ⚠️ verify — set ON |
| **Leaked-password protection** | Authentication → **Attack Protection** → *Prevent use of compromised passwords* | Blocks known-breached passwords (HaveIBeenPwned). | 🔴 **OFF** — set ON |
| **OAuth Server (Beta)** | Authentication → **OAuth Server** | Makes the project an OAuth **identity provider for third-party apps** (needs an `/oauth/consent` page we don't have). **Not needed** for this platform. | Turn **OFF** unless intentionally building "Sign in with Soteria Forge" |

> After changing Auth settings, the fastest functional check for *Confirm email*: sign up a brand-new
> email in the app — if it must be confirmed before login, it's on.

### Alternative: script the Auth toggles via the Management API

The Supabase **MCP does not expose Auth config**, so the dashboard is the normal path. If you'd rather
script it, use the Management API — but note it needs a **Personal Access Token** (`sbp_…`, from
Account → Access Tokens; a broad account-scope secret) and a machine with **unrestricted network**
(this repo's CI/agent sandbox blocks `api.supabase.com`). **Never commit the token** — pass it via an
env var only.

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx          # your personal access token — DO NOT COMMIT
PROJECT_REF=bgnadngztngkwzneknhd

# 1) Inspect the CURRENT auth config (also confirms the exact field names for your API version)
curl -s "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq

# 2) PATCH the two hardening settings. Field names as of the current API:
#      mailer_autoconfirm=false   -> REQUIRE email confirmation (Finding 3)
#      password_hibp_enabled=true -> leaked-password (HaveIBeenPwned) protection
#    Verify these keys against the GET output above before applying — API fields evolve.
curl -s -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mailer_autoconfirm": false, "password_hibp_enabled": true }'
```

Then re-run `get_advisors(security)` (or dashboard → Advisors) to confirm the
`auth_leaked_password_protection` warning has cleared.

## 2. Security follow-ups

- **`public.rls_auto_enable()`** — investigated: it is a `SECURITY DEFINER` **event-trigger** function
  that auto-enables RLS on newly created `public` tables (predates this rebuild). A direct RPC call
  errors (`pg_event_trigger_ddl_commands()` only works inside a DDL event), so the risk is nil, but it
  was granted to `PUBLIC/anon/authenticated` (advisor 0028/0029). **Migration `12` revokes that EXECUTE**
  (the event trigger still fires — migrations run as `postgres`). Apply with `supabase db push`.
- **Migration `12` also carries perf remediations** from the live e2e debug: RLS init-plan `(select …)`
  wrapping (advisor 0003) and covering indexes on foreign keys (advisor 0001) — semantics unchanged.
- Re-run `get_advisors(security)` (or dashboard → Advisors) after the toggles above; the
  `auth_leaked_password_protection` warning should clear once leaked-password protection is on.
- The `current_tenant_id` / `current_user_role` / `provision_tenant` / `redeem_invitation` advisor
  warnings are **expected and accepted** (see `SECURITY_REVIEW.md`) — do not "fix" them by revoking
  `authenticated`, which would break RLS and the invite/provision RPCs.

## 3. App configuration (secrets stay out of git)

Real values go in **git-ignored `.env`** files, never committed. Only the public URL + the client-safe
**publishable/anon** key belong in a client bundle; the **service-role** key must never leave the server.

- `apps/mobile/.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `apps/console/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Templates with placeholders are tracked at `apps/*/.env.example`.

## 4. Database change workflow

The live project is already migrated + seeded. To evolve it (see `supabase/README.md`):

```bash
supabase link --project-ref bgnadngztngkwzneknhd
supabase db push                                   # apply any NEW supabase/migrations/*.sql
supabase gen types typescript --project-id bgnadngztngkwzneknhd \
  > packages/shared/src/supabase/database.types.ts # regenerate DB types after a schema change
```

Never edit an already-applied migration — add a new numbered one. Never run `supabase/seed.sql`
against production: it creates demo accounts (password `SoteriaForge!2026`) and a cross-tenant
`super@soteria.test` super-admin. Those are **dev-only** artifacts.

## 5. Cloudflare Stream (video)

Video bytes live on **Cloudflare Stream**, never in Postgres (ADR-0005 / ADR-0008). `public.video_assets`
holds metadata only (`provider`, `playback_id`, `download_url`, `course_id`, `lesson_id`, `tenant_id`).
Playback is authorized by the `supabase/functions/stream-signed-url` edge function, which reads the
`video_assets` row **through the caller's JWT so RLS scopes it to the caller's tenant** (never the
service-role key) and then mints a short-lived Cloudflare Stream signed credential. Until the secrets below
are set the function returns **501 `{ "error": "video provider not configured" }`**, so it is safe to deploy first.

On success it returns **both** delivery shapes from the one tenant-checked call, so every player surface
uses the same endpoint:

```jsonc
{
  "url":          "https://customer-<code>.cloudflarestream.com/<token>/manifest/video.m3u8", // native HLS (react-native-video)
  "token":        "<signed token>",   // src for the official Stream player (@cloudflare/stream-react / iframe)
  "customerCode": "<code>",           // the customer-<code> subdomain the player needs
  "videoId":      "<playback id>",
  "iframeUrl":    "https://customer-<code>.cloudflarestream.com/<token>/iframe", // WebView source / console preview
  "expiresAt":    "…"
}
```

The `token` is scoped to that one video and short-lived — safe to hand to a client player (the HLS `url`
already embeds it); it is **not** the Cloudflare API token.

**Player surfaces (all drive off this one function):** the **mobile** app plays the Stream player in a
React Native `WebView` (`iframeUrl`) online and falls back to `react-native-video` on the cached MP4
offline; the **console** shows an admin `<iframe>` preview (`iframeUrl`); the optional **React web**
reference (`docs/examples/StreamWebPlayer.tsx`) uses `@cloudflare/stream-react` with `token` +
`customerCode`.

> **Deployed state:** the function is **already deployed** to the live project (`stream-signed-url`,
> version 2, `verify_jwt=true`) and currently returns **501** — pending the `CF_*` secrets below. Setting
> the secrets makes it start minting signed tokens immediately; no redeploy is required for that (redeploy
> only when the function *code* changes).

### One-time Cloudflare setup (dashboard)

1. Create a **Cloudflare account** and add a **Stream** subscription (dash.cloudflare.com → Stream).
2. Note the **Account ID** (Stream → right sidebar / account home) → `CF_ACCOUNT_ID`.
3. Note the **customer subdomain** — playback URLs are `customer-<code>.cloudflarestream.com`; the
   `<code>` is `CF_STREAM_CUSTOMER_CODE`.
4. Create an **API token scoped to Stream** (My Profile → API Tokens → Create Token → *Stream* template,
   permission **Account · Stream · Edit/Read**, scoped to this account) → `CF_STREAM_API_TOKEN`.
   **This token is a secret — never commit it.**

### Set the function secrets + deploy (Supabase CLI)

```bash
# The function is already deployed (version 2). Setting these secrets flips it
# from 501 to minting signed tokens — no redeploy needed for that. Fill in the
# three values from your Cloudflare Stream account (see the setup steps above).
supabase secrets set \
  CF_ACCOUNT_ID=<your-account-id> \
  CF_STREAM_API_TOKEN=<your-stream-api-token> \
  CF_STREAM_CUSTOMER_CODE=<your-customer-code> \
  --project-ref bgnadngztngkwzneknhd     # secrets — DO NOT COMMIT the token

# Only re-deploy when the function CODE changes:
supabase functions deploy stream-signed-url --project-ref bgnadngztngkwzneknhd
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected into the function — do not set them. The
function is deployed with `verify_jwt=true`, so every call must carry a real user session.

### Upload flow (per lesson video)

1. **Upload the source video to Cloudflare Stream** (dashboard, `wrangler`, or the Stream API). Cloudflare
   transcodes it and returns a video/**playback id** and a downloadable **MP4** URL.
2. **Register the metadata in `video_assets`**, linked to a lesson — one row per lesson video:
   `provider = 'cloudflare-stream'`, `playback_id = <the CF id>`, `download_url = <the MP4 URL>`,
   `lesson_id`/`course_id` set. `tenant_id` is stamped by the `BEFORE INSERT` trigger from the author's
   verified session — do **not** pass a client-chosen tenant.
3. The client then calls `stream-signed-url` with `{ lesson_id }` (or `{ video_asset_id }`) to get the
   short-lived signed token / HLS URL / `iframeUrl` (see the response shape above). Mobile plays the
   Stream player in a WebView online and the cached `download_url` MP4 offline; the console renders an
   `<iframe>` preview.

## 6. Building the mobile app (Android / iOS)

`apps/mobile` is the Android + iOS learner app (React Native + Expo, custom dev client). It is
source-only in this repo; to build and run it on a device/emulator, follow the runbook in
[`apps/mobile/BUILD.md`](../apps/mobile/BUILD.md):

- **Local (Android Studio + emulator/device):** root `npm install` → build `@soteria-forge/shared`
  → set `apps/mobile/.env` (client-safe `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
  → `cd apps/mobile && npx expo run:android`.
- **EAS cloud build → installable APK (no local Android SDK needed):** `eas init` then
  `eas build -p android --profile preview` (profiles are defined in `apps/mobile/eas.json`).

## 7. Deferred / needs external accounts

- **App-store distribution** — an Expo/EAS account + `eas submit` (Play Store / App Store); the
  `production` profile in `eas.json` builds the app-bundle.
- **Enterprise SSO** — per-tenant SAML/OIDC federated **into** this Supabase project (Authentication →
  Sign In / Providers), mapping onto the `profiles` tenant — NOT the OAuth Server feature. Deferred.
</content>
