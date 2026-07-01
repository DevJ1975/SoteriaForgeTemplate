# `supabase/` — the in-repo source of truth for the Soteria Forge backend

Backend pivot: **AWS/Amplify → Supabase.** Tenant isolation (the #1 rule) is now enforced by
**Postgres RLS**, not app code. This directory is the defined-as-code mirror of the LIVE project.

> **The live project is already provisioned, migrated, and seeded.** This directory does not need
> to be applied to bring the platform up — it exists so the schema, RLS, storage rules, and seed
> live in version control and can reproduce the backend (locally, or in a fresh project) exactly.

| Path | What |
|------|------|
| `config.toml` | Supabase CLI config (`project_id`, db major version, storage, auth). |
| `migrations/` | One `.sql` per applied migration, **exact copies** of the live `schema_migrations`. |
| `seed.sql` | Idempotent tenant + demo-course seed (matches what the live project was seeded with). |

## The live project

| | |
|---|---|
| **ref** | `bgnadngztngkwzneknhd` |
| **url** | `https://bgnadngztngkwzneknhd.supabase.co` |
| **applied migrations** | `01_core_schema`, `02_rls_policies`, `03_storage`, `04_harden_function_grants`, `05_stamp_only_for_authenticated` |
| **seeded** | tenants `atl-curb-to-cabin`, `demo`; a published course (`Confined Space Entry`); 3 demo users (below) |

## Demo accounts (seeded — password `SoteriaForge!2026`)

Sign in with any of these (mobile or console) to see RLS tenant-scoping end-to-end:

| Email | Role | Tenant | Sees |
|---|---|---|---|
| `admin@atl.test` | tenant-admin | ATL Curb-to-Cabin | ATL data; may author courses |
| `worker@atl.test` | worker | ATL Curb-to-Cabin | the `Confined Space Entry` course (enrolled) |
| `worker@demo.test` | worker | Soteria Forge Demo | **none of ATL's data** — proves cross-tenant isolation |

**Verified live against the RLS policies:** acting as `worker@atl.test` returns exactly
one course + one enrollment; acting as `worker@demo.test` returns **0 courses and only
its own profile** — the ATL↔demo tenant boundary holds under the caller's own JWT.
(Demo credentials are for this dev project only — never reuse this password in production.)

## Schema at a glance

`public.tenants`, `profiles` (1:1 with `auth.users`; holds `tenant_id` + `role`), `courses`,
`modules`, `lessons`, `enrollments`, `completion_statements` (xAPI, **append-only**, PK is the
client-generated UUID = idempotency key), `video_assets` (**metadata only** — never bytes).
Roles: `worker | supervisor | tenant-admin | super-admin`.

## Tenant isolation — enforced by RLS (read `migrations/…02_rls_policies.sql`)

- Every table has RLS; reads/writes are constrained to the caller's own tenant via
  `public.current_tenant_id()` — a `SECURITY DEFINER` function that reads the caller's `profiles`
  row. Clients **never** pass a `tenant_id` for authorization; RLS derives it from the session JWT.
- A `BEFORE INSERT` trigger tenant-stamps new rows from the verified auth context **only when
  `auth.uid()` is present**, so a client cannot choose another tenant's id.
- `completion_statements` is **insert-only** (own rows) — there is deliberately **no** update or
  delete policy, so they cannot be mutated. Offline sync must be idempotent by the client UUID:
  `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`.
- `super-admin` is the one cross-tenant role. Storage bucket `tenant-media` is private and
  tenant-scoped by the first path segment (`<tenant_id>/...`); access via **signed URLs**.

## Keys

- **Publishable (anon) key** — client-safe (RLS-protected); belongs in each app's `.env`
  (`apps/mobile/.env.example`, `apps/console/.env.example` carry the placeholders).
- **Service-role key** — bypasses RLS. **NEVER** committed, and **NEVER** placed in a client.
  Keep it in a git-ignored `.env` on the server / in CI secrets only.

## CLI workflow

Requires the Supabase CLI and being logged in (`supabase login`). Run from the repo root.

```bash
# 1. Link this repo to the live project (prompts for the DB password).
supabase link --project-ref bgnadngztngkwzneknhd

# 2. Push any NEW local migrations to the live project.
#    (All five current migrations are ALREADY applied — nothing to push today.)
supabase db push

# 3. Regenerate the shared TypeScript types after a schema change.
#    (Output is committed at packages/shared/src/supabase/database.types.ts.)
supabase gen types typescript --project-id bgnadngztngkwzneknhd \
  > packages/shared/src/supabase/database.types.ts

# Local dev (optional): bring up a full local stack from ./migrations + ./seed.sql.
supabase start
supabase db reset      # re-run migrations, then apply seed.sql
```

## House rules

- Migration files here are **exact copies** of what is applied live — do not edit an
  already-applied migration; add a new numbered one and `db push` it.
- No secrets in this directory. Only the public URL and publishable-key **placeholders** are
  tracked (in the apps' `.env.example`); real values live in git-ignored `.env`.
