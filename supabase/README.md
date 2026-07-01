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
| `functions/` | Supabase Edge Functions (Deno). `stream-signed-url` mints tenant-checked Cloudflare Stream signed playback URLs. |

## The live project

| | |
|---|---|
| **ref** | `bgnadngztngkwzneknhd` |
| **url** | `https://bgnadngztngkwzneknhd.supabase.co` |
| **applied migrations** | `01_core_schema`, `02_rls_policies`, `03_storage`, `04_harden_function_grants`, `05_stamp_only_for_authenticated` |
| **seeded** | tenants `atl-curb-to-cabin`, `demo`; a published course (`Confined Space Entry`, 1 module + 2 lessons); 4 demo users (below) |

## Demo accounts (seeded — password `SoteriaForge!2026`)

Sign in with any of these (mobile or console) to see RLS tenant-scoping end-to-end:

| Email | Role | Tenant | Sees |
|---|---|---|---|
| `admin@atl.test` | tenant-admin | ATL Curb-to-Cabin | ATL data; may author courses |
| `worker@atl.test` | worker | ATL Curb-to-Cabin | the `Confined Space Entry` course (enrolled) |
| `worker@demo.test` | worker | Soteria Forge Demo | **none of ATL's data** — proves cross-tenant isolation |
| `super@soteria.test` | super-admin | (home: demo) | every tenant; can **provision new tenants** |

**Verified live against the RLS policies:** acting as `worker@atl.test` returns exactly
one course + one enrollment; acting as `worker@demo.test` returns **0 courses and only
its own profile** — the ATL↔demo tenant boundary holds under the caller's own JWT.
(Demo credentials are for this dev project only — never reuse this password in production.)

## Schema at a glance

`public.tenants`, `profiles` (1:1 with `auth.users`; holds `tenant_id` + `role`), `courses`,
`modules`, `lessons`, `enrollments`, `completion_statements` (xAPI, **append-only**, PK is the
client-generated UUID = idempotency key), `video_assets` (**metadata only** — never bytes);
`invitations` (pending tenant memberships, redeemed via `public.redeem_invitation(token)`);
`certificates` (course-completion certificates — **trigger-issued and immutable to clients**, see below).
Roles: `worker | supervisor | tenant-admin | super-admin`.

### Certificates (migration `11`)

`certificates` are **system-issued, never client-written**. A `SECURITY DEFINER` trigger
(`issue_certificate`) fires when an enrollment first reaches `status = 'completed'` and inserts exactly
**one certificate per `(user_id, course_id)`** (`on conflict do nothing` — idempotent). RLS grants
`select` only (owner / same-tenant `supervisor`/`tenant-admin` / `super-admin`, all tenant-scoped); there
is **no INSERT/UPDATE/DELETE policy**, so clients can neither forge nor mutate a certificate. `revoked_at`
/ `expires_at` are reserved for future privileged server logic.

### Video pipeline (`functions/stream-signed-url` + `video_assets`)

Video bytes live on **Cloudflare Stream** (ADR-0005 / ADR-0008); `video_assets` stores metadata only
(`provider`, `playback_id`, `download_url`, `course_id`, `lesson_id`, `tenant_id`), RLS-scoped to the
tenant. The `supabase/functions/stream-signed-url` edge function reads the requested `video_assets` row
**through the caller's JWT (RLS scopes it to the caller's tenant — never the service-role key)** and mints
a short-lived Cloudflare Stream **signed** playback URL; it returns **501** until the `CF_*` secrets are
configured (safe to deploy first). Offline playback uses the cached MP4 `download_url`. See
[`functions/stream-signed-url/README.md`](functions/stream-signed-url/README.md) and
[`../docs/OPERATIONS.md`](../docs/OPERATIONS.md) → "Cloudflare Stream (video)".

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

## Joining a tenant (invitations)

New users don't self-pick a tenant — they're **invited** into one. The flow (migration `06`):

1. A **tenant-admin** creates an invitation for an email + role — `insert into invitations`.
   RLS allows this only for `tenant-admin`/`super-admin`; the `tenant_id` + `invited_by` are
   **stamped from the admin's verified session**, never chosen by the client. A worker attempting
   this is rejected by RLS (verified live: SQLSTATE `42501`).
2. The invitee **signs up / signs in** via Supabase Auth (gets an `auth.users` row, no profile yet).
3. On first sign-in they call **`redeem_invitation(token)`** — a `SECURITY DEFINER` function that
   validates the token is pending, unexpired, and issued to *their verified email*, then creates
   their `profiles` row in the invite's tenant + role. Idempotent (an existing profile is returned
   unchanged, so a member can never be silently re-tenanted).

Verified live end-to-end: admin invites → new user redeems → provisioned as an ATL worker who then
sees exactly the ATL course.

### Provisioning a new tenant (super-admin)

A brand-new tenant has no admin to send the first invite, so a **super-admin** bootstraps it via
`public.provision_tenant(name, slug, admin_email)` (migration `07`) — a `SECURITY DEFINER` RPC,
super-admin-gated, that atomically creates the tenant **and** a `tenant-admin` invitation for
`admin_email`, returning the tenant + invite token. The first admin then signs up and redeems that
token through the same flow above. Super-admin is the one role allowed to set `tenant_id` explicitly
(the stamp triggers auto-pin every *other* role to their own tenant).

Verified live: `super@soteria.test` provisioned tenant `acme` + its first-admin invite; the invited
`admin@acme.test` redeemed it, became `acme`'s `tenant-admin`, and could see **only** `acme` (1
tenant, 0 courses) — none of ATL's or demo's data.

## Completions & progress

Learning activity is recorded as **append-only xAPI completion statements** — one row per completed
lesson, keyed by a client-generated UUID (idempotent; safe to sync-retry, offline-first). A worker
inserts only their own statements (RLS `user_id = auth.uid()`); there is deliberately no UPDATE/DELETE
policy, so the record is immutable. Each statement's `context` carries `{ course_id, lesson_id }`, and
an `AFTER INSERT` trigger (`sync_enrollment_progress`, migration `08`) recomputes the worker's
`enrollments.progress` / `status` from their completed **required** lessons — server-side, so a worker
who cannot directly write `enrollments` still gets progress reflected. Verified live: completing both
seeded lessons drove the enrollment to `completed` / 100%.

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
