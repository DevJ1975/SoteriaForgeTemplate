# Soteria Forge — repo conventions (root)

Multi-tenant LMS template for industrial / construction / field-service / austere-environment
training. This file is the shared contract every package agrees on. Per-package `CLAUDE.md`
files add local conventions; they never contradict this one.

> **Status: AWS-era rebuild, DEFINED-AS-CODE, UNDEPLOYED.** The new
> `apps/mobile` + `backend/` + `packages/ui` are source-only — nothing here has been
> `npm install`ed, built native, or deployed. No AWS/Cloudflare/Expo resources exist. The legacy
> Vue web LMS (`apps/lms`) and Express/Mongo API (`apps/api`) have been **retired** (preserved in
> git history); `apps/console` is kept and will be repointed at the new API in Phase 6.

## Layout (Turborepo monorepo)

| Path | What | State |
|------|------|-------|
| `apps/mobile/` | React Native + Expo learner app | NEW |
| `apps/console/` | Vue 3 admin / superadmin console | KEPT — must not break |
| `packages/shared/` | domain types, xAPI schemas, single-table keys + tenant helpers | contract source |
| `packages/ui/` | design tokens (Ink/Bone/Cobalt) | NEW |
| `backend/` | Amplify Gen 2 definition: `auth/ data/ storage/ functions/` | NEW |
| `docs/`, `.claude/` | docs + swarm scaffolding | — |

Root wiring (`package.json`, `turbo.json`, root `README`) is owned centrally — a subtree agent
does not edit it.

## Single-table DynamoDB key design (one AppSync/DynamoDB table)

```
PK = TENANT#<tenantId>
SK = TENANT#META
   | USER#<userId>
   | COURSE#<courseId>
   | MODULE#<courseId>#<moduleId>
   | LESSON#<courseId>#<moduleId>#<lessonId>
   | ENROLLMENT#<userId>#<courseId>
   | STMT#<statementId>     (xAPI completion statement, append-only)
   | VIDEO#<videoId>        (VideoAsset METADATA only — never video bytes)
```

GSIs: **courses-by-tenant, enrollments-by-user, statements-by-user, users-by-tenant.**
Keys are built and parsed ONLY through `packages/shared/src/keys.ts` (`tenantPk`, `userSk`,
`courseSk`, `moduleSk`, `lessonSk`, `enrollmentSk`, `stmtSk`, `videoSk`, `skPrefixes`,
`parseSk`). Never hand-concatenate a key string — `assertSegment` rejects empty ids and ids
containing the `#` delimiter for a reason (a raw `#` could forge a cross-entity key).

## Tenant isolation invariant (the #1 rule — non-negotiable)

Every data access is scoped by `TENANT#<tenantId>`, and **no caller may ever read or write another
tenant's data.** Enforcement is **row-level, by AppSync dynamic-group authorization** — a
request-level Lambda authorizer cannot see per-row data, so it is *not* the model gate:

- **Read gate:** every model has `allow.groupDefinedIn('tenantId')` — the row's `tenantId` must be
  one of the caller's `cognito:groups`. The pre-token trigger injects only the caller's own
  immutable `custom:tenantId` into `cognito:groups`, so a caller only ever reads their own tenant.
- **Write gate:** admin-authored + roster models carry an `adminGroup` field and use
  `allow.groupDefinedIn('adminGroup')` (`adminGroup == 'admin::' + tenantId`), replacing the
  tenant-blind `allow.group('tenant-admin')`. Owner rules (`ownerDefinedIn('userId')`) pin a worker
  to their own rows.
- The caller's tenant comes ONLY from the verified token claim — **never** from request
  args/body/query/headers. A request-sourced tenantId used for authorization is a security bug.
- `super-admin` is the one legitimately global role (cross-tenant); it is still read-only on
  append-only `CompletionStatement`.
- The Lambda authorizer (`functions/tenant-authorizer`) is **defense-in-depth for custom operations**
  (e.g. a signed-URL mint): it verifies the **ID token** and reuses the canonical
  `assertTenantMatch` / `isSameTenant` guard (`packages/shared/src/tenant.ts`; strict equality,
  empty ⇒ deny, no super-admin bypass). See `backend/data/tenant-isolation.md`.

## Auth (Cognito)

ONE user pool, **Lite tier**. Custom attribute `custom:tenantId` is **immutable**. Groups
(least→most privileged): `worker`, `supervisor`, `tenant-admin`, `super-admin`. Legacy
`UserRole` (`learner/manager/admin/superadmin`) is the stored DTO vocabulary; `roles.ts` is the
canonical bridge. Enterprise SSO = per-tenant SAML/OIDC federated into the SAME pool (deferred).

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

- **Do NOT** run `npm install`, build native/cloud deps, or create AWS/Cloudflare/Expo
  resources. Everything is defined-as-code and undeployed.
- **Do NOT** commit secrets. Only `.env.example` placeholders are tracked; real config lives in
  git-ignored files (`.env`, `amplify_outputs.json`). The PreToolUse hooks
  (`.claude/hooks/block-secrets.sh`, `.claude/hooks/block-destructive-aws.sh`) enforce this.
- Write real, coherent, production-shaped code — no TODO stubs.
- Keep `apps/console` building. Type-check ordering: build `@soteria-forge/shared` and
  `@soteria-forge/ui` first (their `dist/` declarations feed everything else).

## The swarm

Specialized subagents live in `.claude/agents/*.md` (orchestrator, aws-infra, api-data, mobile,
video, offline-sync, console-web, security-reviewer, test-runner, docs). The workflow and roster
are documented in `docs/CLAUDE_SWARM.md`. Any change touching data access, auth, sync, or
storage goes through `security-reviewer` (read-only, holds the tenant-isolation release gate)
before it is done, and ends green under `test-runner`.
