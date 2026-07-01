# Soteria Forge — repo conventions (root)

Multi-tenant LMS template for industrial / construction / field-service / austere-environment
training. This file is the shared contract every package agrees on. Per-package `CLAUDE.md`
files add local conventions; they never contradict this one.

> **Status: Supabase backend LIVE (provisioned + seeded); clients DEFINED-AS-CODE.** The backend
> pivoted **AWS/Amplify → Supabase** ([ADR-0007](docs/adr/0007-supabase-backend.md)); a live
> Supabase project (ref `bgnadngztngkwzneknhd`) is already migrated and seeded, mirrored as code in
> `supabase/`. The `apps/mobile` + `packages/ui` clients are still source-only — nothing here has
> been `npm install`ed, built native, or deployed to a device/store. The retired AWS/Amplify
> definition (`backend/`) has been **deleted** (preserved in git history), as were the legacy Vue web
> LMS (`apps/lms`) and Express/Mongo API (`apps/api`); `apps/console` is kept and is being repointed
> at Supabase.

## Layout (Turborepo monorepo)

| Path | What | State |
|------|------|-------|
| `apps/mobile/` | React Native + Expo learner app (supabase-js client) | NEW |
| `apps/console/` | Vue 3 admin / superadmin console (repointed at Supabase) | KEPT — must not break |
| `packages/shared/` | domain types, xAPI schemas, Supabase DB types + tenant helpers | contract source |
| `packages/ui/` | Soteria Forge React Native UI kit (ember/spark) | NEW |
| `supabase/` | Supabase-as-code: `config.toml`, `migrations/`, `seed.sql` (mirrors the live project) | LIVE |
| `docs/`, `.claude/` | docs + swarm scaffolding | — |

Root wiring (`package.json`, `turbo.json`, root `README`) is owned centrally — a subtree agent
does not edit it.

## Data model (Supabase Postgres)

A normal relational schema in `public`: `tenants`, `profiles` (1:1 with `auth.users`; holds
`tenant_id` + `role`), `courses`, `modules`, `lessons`, `enrollments`, `completion_statements`
(xAPI, **append-only**, PK = client-generated UUID = idempotency key), `video_assets` (**metadata
only** — never video bytes). Roles: `worker | supervisor | tenant-admin | super-admin`. The schema,
RLS policies, storage rules, and seed live in `supabase/migrations/` + `supabase/seed.sql`.

> **AWS-era code, now pruned:** the single-table DynamoDB key builders
> (`packages/shared/src/keys.ts`) and the Cognito `adminGroup` stamping helper
> (`stampTenantOwnership` in `tenant.ts`) were built for the AWS model and are **superseded** by
> RLS. They had no remaining callers and have been **removed** (git history preserves them; see
> [ADR-0007](docs/adr/0007-supabase-backend.md)). The tenant-equality guard
> (`isSameTenant`/`assertTenantMatch`) is retained as a defensive, RLS-independent utility.

## Tenant isolation invariant (the #1 rule — non-negotiable)

Every data access is scoped to the caller's own tenant, and **no caller may ever read or write
another tenant's data.** Enforcement is **row-level, by Postgres RLS** (not app code, not a
request-level authorizer):

- **Read + write gate:** every table has RLS enabled; policies constrain rows to the caller's own
  tenant via `public.current_tenant_id()` — a `SECURITY DEFINER` function that reads the caller's
  `profiles` row from the verified session JWT.
- **Insert stamping:** a `BEFORE INSERT` trigger tenant-stamps new rows from the verified auth
  context (`auth.uid()`), and **only when `auth.uid()` is present** — so a client **cannot choose
  another tenant's id**.
- The caller's tenant comes ONLY from the session JWT — **never** from request
  args/body/query/headers. **Clients must never send or trust a client-chosen `tenant_id` for
  authorization** — a request-sourced tenantId used for authorization is a security bug.
- `completion_statements` is **insert-only** (own rows): there is deliberately **no** UPDATE or
  DELETE policy, so statements cannot be mutated. Offline sync is idempotent by the client UUID —
  `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`.
- `super-admin` is the one legitimately global role (cross-tenant).
- Storage bucket `tenant-media` is private and tenant-scoped by the **first path segment**
  (`<tenant_id>/...`), accessed via **signed URLs**.

See `supabase/migrations/…02_rls_policies.sql` and `supabase/README.md`.

## Auth (Supabase Auth)

**Supabase Auth** (email/password) replaces Cognito. Each user has a 1:1 `profiles` row carrying
`tenant_id` and `role`. Roles (least→most privileged): `worker`, `supervisor`, `tenant-admin`,
`super-admin`. Legacy `UserRole` (`learner/manager/admin/superadmin`) is the stored DTO vocabulary;
`roles.ts` is the canonical bridge. The **publishable (anon) key is client-safe** (RLS-protected)
and belongs in each app's `.env`; the **service-role key bypasses RLS** and must **never** be
committed or placed in a client. Enterprise SSO = per-tenant SAML/OIDC into the same Supabase
project (deferred).

## xAPI completion statements

`{ id (CLIENT-GENERATED UUID), tenantId, actor, verb, object, result?, context?, timestamp }`.
**APPEND-ONLY.** Sync is **IDEMPOTENT by `id`** — the server dedupes on the UUID (it is the
primary key). There is **NO conflict resolution and there must never need to be** — immutable
rows keyed by a stable UUID can never disagree. Use `@soteria-forge/shared` builders
(`generateStatementId`, `createCompletionStatement`); the id — never the timestamp — is the
idempotency key.

## Brand tokens (Ink/Bone/Cobalt)

ink `#0E1A2E` · blue `#3DA9FC` · orange `#FF6B1F` · paper `#F5F4EF`. Canonical scale lives in
`apps/console/src/theme/tokens.css` and `packages/ui` (mirrored 1:1). Never hardcode a brand hex
in a component.

## House rules

- **Do NOT** run `npm install`, build native/cloud deps, or create Cloudflare/Expo resources or new
  Supabase projects. The client apps stay defined-as-code; only the Supabase backend is live, and
  this repo is *source* for it — **do not modify the live database from repo work** (add a new
  numbered migration and `db push` instead of editing an applied one; see `supabase/README.md`).
- **Do NOT** commit secrets. Only `.env.example` placeholders (and the public Supabase URL /
  publishable key) are tracked; real config lives in git-ignored files (`.env`). The **service-role
  key never enters source or a client.** The PreToolUse hooks (`.claude/hooks/block-secrets.sh`,
  `.claude/hooks/block-destructive-aws.sh`) enforce the secret + destructive-command guards.
- Write real, coherent, production-shaped code — no TODO stubs.
- Keep `apps/console` building. Type-check ordering: build `@soteria-forge/shared` and
  `@soteria-forge/ui` first (their `dist/` declarations feed everything else).

## The swarm

Specialized subagents live in `.claude/agents/*.md` (orchestrator, aws-infra, api-data, mobile,
video, offline-sync, console-web, security-reviewer, test-runner, docs). The workflow and roster
are documented in `docs/CLAUDE_SWARM.md`. Any change touching data access, auth, sync, or
storage goes through `security-reviewer` (read-only, holds the tenant-isolation release gate)
before it is done, and ends green under `test-runner`.
