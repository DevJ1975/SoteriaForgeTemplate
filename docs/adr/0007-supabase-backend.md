# ADR-0007: Supabase (Postgres + RLS + Auth + Storage) replaces AWS/Amplify

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform / security / backend
- **Supersedes:** [ADR-0001](./0001-backend-amplify-gen2.md) (in full); the **AWS
  enforcement details** of [ADR-0003](./0003-single-pool-multitenancy.md) (its
  multi-tenant *intent* stands; only the Cognito/AppSync/DynamoDB mechanism is replaced).
- **Related:** [ADR-0002](./0002-offline-event-sourcing.md),
  [ADR-0004](./0004-turborepo-monorepo.md),
  [ADR-0005](./0005-video-cloudflare-stream.md)

## Context

The AWS-era rebuild ([ADR-0001](./0001-backend-amplify-gen2.md),
[ADR-0003](./0003-single-pool-multitenancy.md)) was **defined-as-code and never
deployed** — no Cognito pool, AppSync API, DynamoDB table, Lambda, or S3 bucket
was ever provisioned. Before any of that stood up, the owner chose a different
backend: **Supabase** (managed Postgres + Row-Level Security + Auth + Storage).

A **live Supabase project is already provisioned, migrated, and seeded** — so
this is not a proposal to evaluate but a decision already realized in
infrastructure and mirrored as code in `supabase/`:

| | |
|---|---|
| **ref** | `bgnadngztngkwzneknhd` |
| **url** | `https://bgnadngztngkwzneknhd.supabase.co` |
| **applied migrations** | `01_core_schema`, `02_rls_policies`, `03_storage`, `04_harden_function_grants`, `05_stamp_only_for_authenticated` |
| **seeded** | tenants `atl-curb-to-cabin`, `demo`; one demo course |

The **non-negotiable invariant is unchanged**: Soteria Forge is multi-tenant and
**no request may ever read or write another tenant's data**
([ADR-0003](./0003-single-pool-multitenancy.md)). What changes is *where and how*
that invariant is enforced — it moves from AppSync dynamic-group authorization
over DynamoDB to **Postgres RLS**.

## Decision

**We build the backend on Supabase. A single Postgres database, with tenant
isolation enforced by Row-Level Security, replaces the entire AWS/Amplify stack**
(Cognito → Supabase Auth, AppSync + DynamoDB → Postgres, Lambda authorizers +
triggers → RLS policies + `SECURITY DEFINER` functions + `BEFORE INSERT`
triggers, S3 → Supabase Storage). The definition-as-code lives in `supabase/`
(`config.toml`, `migrations/`, `seed.sql`); see [`supabase/README.md`](../../supabase/README.md).

### Data model — a normal relational schema, not a single table

Public tables: `tenants`, `profiles` (1:1 with `auth.users`; holds `tenant_id` +
`role`), `courses`, `modules`, `lessons`, `enrollments`, `completion_statements`
(xAPI, **append-only**, PK = the client-generated UUID = idempotency key), and
`video_assets` (**metadata only** — never video bytes). Roles:
`worker | supervisor | tenant-admin | super-admin`.

### Tenant isolation — RLS is the gate

- **Every table has RLS enabled.** Reads and writes are constrained to the
  caller's own tenant via `public.current_tenant_id()` — a `SECURITY DEFINER`
  function that reads the caller's `profiles` row for the tenant. This is the
  load-bearing control, at the row level, in the database.
- **INSERTs are tenant-stamped by a `BEFORE INSERT` trigger** from the verified
  auth context (`auth.uid()`), and **only when `auth.uid()` is present**. A
  client therefore **cannot choose another tenant's id**: the server derives the
  tenant from the session JWT, never from client input. **Clients must never
  send or trust a client-chosen `tenant_id` for authorization.**
- **`completion_statements` is insert-only** (own rows). There is deliberately
  **no** UPDATE and **no** DELETE policy, so statements cannot be mutated — the
  append-only, idempotent-by-UUID invariant of
  [ADR-0002](./0002-offline-event-sourcing.md) holds at the database level.
- **`super-admin` is the one cross-tenant role.**
- **Storage** bucket `tenant-media` is private and tenant-scoped by the **first
  path segment** (`<tenant_id>/...`), accessed via **signed URLs**.

### Auth — Supabase Auth replaces Cognito

Email/password via Supabase Auth. Each user has a 1:1 `profiles` row carrying
`tenant_id` and `role`. The **publishable (anon) key is client-safe** — it is
RLS-protected — and belongs in each app's `.env` (placeholders in
`.env.example`). The **service-role key bypasses RLS** and must **never** be
committed or placed in a client; it lives in a git-ignored `.env` on the
server / in CI secrets only. Enterprise SSO remains deferred (Supabase supports
SAML/OIDC into the same project).

### Offline sync — unchanged in spirit, adapted in mechanism

Offline completion ([ADR-0002](./0002-offline-event-sourcing.md)) is still
**append-only and idempotent by the client UUID**. Against Supabase this is an
`upsert(..., { onConflict: 'id', ignoreDuplicates: true })` into
`completion_statements` — insert-on-conflict-do-nothing keyed on the UUID. Same
guarantee (at-least-once delivery + idempotent create = exactly-once effect), a
different client call.

### Video — unchanged

[ADR-0005](./0005-video-cloudflare-stream.md) stands: **Cloudflare Stream** holds
video bytes and powers offline via MP4 download; the database stores only
`video_assets` metadata. The AWS/Cloudflare split simply becomes a
Supabase/Cloudflare split.

## Alternatives considered

- **Stay on Amplify Gen 2 (the prior decision) — rejected.** It was defined but
  undeployed, so there was no sunk deployment to preserve. Supabase collapses
  four AWS services (Cognito, AppSync, DynamoDB, Lambda) and S3 into one managed
  Postgres + Auth + Storage product, and expresses tenant isolation as **RLS
  policies a reviewer can read in SQL** rather than as dynamic-group rules spread
  across an AppSync schema plus Lambda authorizers.
- **Self-hosted Postgres + a hand-rolled API — rejected.** Reintroduces the
  bespoke auth/tenancy plumbing the rebuild exists to kill, and loses Supabase's
  managed Auth, Storage, signed URLs, and migration tooling.
- **Keep DynamoDB single-table, swap only auth — rejected.** The single-table
  key design was chosen to fit DynamoDB; carrying it onto Postgres would forfeit
  relational integrity, RLS-per-table, and SQL-readable policies for no benefit.

## Consequences

**Easier**

- **One database, one place to reason about isolation.** RLS + `current_tenant_id()`
  is the single, SQL-readable tenant gate; there is no split between a
  request-level authorizer and row-level rules.
- **Isolation is enforced by the datastore, not app code.** Even a buggy or
  malicious client using the publishable key cannot escape its tenant, because
  RLS filters every row and the `BEFORE INSERT` trigger stamps the tenant from
  the JWT.
- **A relational schema** brings foreign keys, joins, and SQL migrations —
  simpler than composing/parsing single-table keys by hand.
- The backend is fully mirrored as code in `supabase/` and reproducible into a
  fresh project or a local stack.

**Harder / ongoing cost**

- **Isolation is still a property we must actively preserve.** Every new table
  needs RLS enabled and a tenant policy; a table shipped with RLS off, or a
  policy that reads a client-supplied `tenant_id` instead of
  `current_tenant_id()`, is a cross-tenant breach. This still warrants an
  adversarial security review before regulated production use.
- **The publishable key is exposed to clients by design** — its safety depends
  entirely on RLS being correct and enabled everywhere. The service-role key is
  now the crown-jewel secret to keep out of source and clients.
- **AWS-era artifacts are now dormant.** The DynamoDB single-table key builders
  (`packages/shared/src/keys.ts`: `tenantPk`/`userSk`/`courseSk`/… and
  `parseSk`) and the Cognito `adminGroup` tenant-stamping helper
  (`stampTenantOwnership` in the shared tenant module) were built for the AWS
  model and are **superseded**. They should be treated as **retained-but-dormant
  and pruned** once no client references them — leaving them in place invites
  drift and false signal that a single-table/Cognito model is still live. (The
  canonical `assertTenantMatch` / `isSameTenant` guard remains useful as a
  generic same-tenant check.)
- Postgres connection limits, RLS-policy performance, and Supabase's managed
  quotas are the new shared-capacity concerns in place of Cognito quotas and
  DynamoDB hot-partition behavior.
