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

## 2. Security follow-ups

- **Review `public.rls_auto_enable()`** — a `SECURITY DEFINER`, anon-executable function that **predates
  this rebuild** (not created here). Confirm what it does; `REVOKE EXECUTE ... FROM anon, authenticated`
  or drop it if unused. Flagged by the security advisor.
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

## 5. Deferred / needs external accounts

- **Cloudflare Stream** (video) — CF account + API token; the `video_assets` metadata model is ready.
- **EAS / Expo** — native mobile builds (custom dev client), an Expo account, and `npm install`.
- **Enterprise SSO** — per-tenant SAML/OIDC federated **into** this Supabase project (Authentication →
  Sign In / Providers), mapping onto the `profiles` tenant — NOT the OAuth Server feature. Deferred.
</content>
