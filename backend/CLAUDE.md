# `backend/` — Amplify Gen 2 backend (code-first, UNDEPLOYED)

The AWS-era backend defined as CODE: one Cognito user pool, a code-first AppSync data layer,
tenant-scoped S3 storage, and the tenant-isolation Lambda authorizer + pre-token-generation
trigger. **Phase 0 = defined-as-code only. Nothing here is deployed.** The deliverable is a
correct, coherent definition — `defineBackend` composes the CDK app; we never run it against a
real account here.

Owned by the **aws-infra** agent (infrastructure/auth/storage wiring) with **api-data** on the
data SHAPE. See root `../CLAUDE.md` for the shared contract.

## Files

| Path | Owns |
|------|------|
| `backend.ts` | Composition (`defineBackend`) + feeds pool id/client id to the authorizer. |
| `auth/resource.ts` | Single Cognito pool (Lite tier), immutable `custom:tenantId`, groups, trigger. |
| `data/resource.ts` | Code-first `a.schema(...)` models, secondary indexes, auth rules. |
| `storage/resource.ts` | S3 for binary assets; `private/{entity_id}/*` (per-user) + coarse `media/*` grants. Object-level tenant isolation is a signed-URL mint (follow-up). |
| `functions/tenant-authorizer/handler.ts` | The Lambda authorizer — defense-in-depth for CUSTOM ops, NOT the model gate. |
| `functions/tenant-authorizer/pre-token-generation.ts` | Echoes `custom:tenantId` into claims AND injects the tenant into `cognito:groups` for row-level auth. |
| `data/tenant-isolation.md` | The canonical reviewer's map of where isolation is enforced. |

## Tenant isolation (ROW-LEVEL, enforced by AppSync)

Amplify **static** group rules are **tenant-blind** (`tenant-admin` in tenant A is the SAME
Cognito group as tenant B; `allow.authenticated().to(['read'])` lets any tenant read any row).
Tenant isolation is therefore enforced **row-level by AppSync** via dynamic-group auth keyed on
each row's own `tenantId`:

1. **Field** — every model carries a required `tenantId` (partition owner, `PK =
   TENANT#<tenantId>`). Admin-authored + roster/assignment models also carry `adminGroup`. Create
   resolvers stamp both from the **verified claim**, never from client input.
2. **Row-level READ gate** — every model has `allow.groupDefinedIn('tenantId').to(['read'])`: the
   row's `tenantId` must be one of the caller's `cognito:groups`. The pre-token trigger injects
   the caller's own `custom:tenantId` into `cognito:groups`, so a caller only ever reads their own
   tenant. **This is the load-bearing read control.**
3. **Tenant-scoped WRITE gate** — admin-authored models (Tenant/Course/Module/Lesson/VideoAsset)
   and roster/assignment (User/Enrollment) grant writes via
   `allow.groupDefinedIn('adminGroup')`, where `adminGroup == 'admin::' + tenantId` (the trigger
   injects `admin::<tenantId>` for tenant-admins). Replaces tenant-blind `allow.group('tenant-admin')`.
4. **Owner rules** — `allow.ownerDefinedIn('userId').identityClaim('sub')` pin a worker to their
   own rows (`userId` == Cognito `sub`). Tenant-safe (a user only owns their own rows).
5. **Lambda authorizer = DEFENSE-IN-DEPTH for CUSTOM ops only** — NOT the model gate. An AppSync
   Lambda authorizer is request-level and cannot see per-row data, so it can't do row-level
   filtering. It is an optional `lambda` auth mode for custom operations (e.g. signed-URL mint) and
   verifies the **ID token** (which carries `custom:tenantId`; access tokens don't by default). Its
   inlined `assertTenantMatch` guard stays **byte-for-byte equivalent** to `@soteria-forge/shared`
   `tenant.ts`; if the shared guard changes, this mirror changes identically.

`super-admin` is the legitimately global operator and keeps a cross-tenant grant on the models
(the only role allowed cross-tenant). Never read a tenantId from GraphQL args / body / query /
non-Authorization headers to authorize.

## Auth conventions

- ONE user pool, **Lite tier** (no advanced-security add-ons — those push the pool off Lite).
  `defineAuth` has no literal "tier" flag; the tier is a console/pricing selection, recorded as
  the operational contract and honored by keeping advanced features off.
- `custom:tenantId` is **immutable** (`mutable: false`) — a user can never move themselves to
  another tenant. Groups: `worker`, `supervisor`, `tenant-admin`, `super-admin` (must match
  `@soteria-forge/shared` `COGNITO_GROUPS` exactly).
- The **pre-token-generation** trigger echoes the immutable `custom:tenantId` into the token
  claims AND injects the tenant into `cognito:groups` (the tenantId itself, plus `admin::<tenantId>`
  for tenant-admins) so AppSync `groupDefinedIn('tenantId')` / `groupDefinedIn('adminGroup')` can
  do row-level tenant auth. `cognito:groups` is present in both the ID and access tokens, so the
  row gate is token-source agnostic. Missing `custom:tenantId` ⇒ inject nothing (fail closed).
- Enterprise SSO is **deferred**: per-tenant SAML/OIDC federated into THIS pool via attribute
  mapping onto `custom:tenantId` — never a second pool. `externalProviders` stays omitted for now.

## Data-model conventions

- Ids compose the intended single-table sort keys (a Module knows its `courseId`; a Lesson knows
  `courseId`+`moduleId`) so a future hand-rolled single table maps 1:1 onto
  `@soteria-forge/shared` `keys.ts`.
- Secondary indexes reproduce the required access patterns: **courses-by-tenant,
  enrollments-by-user, statements-by-user, users-by-tenant** (plus modules-by-course,
  lessons-by-module, enrollments-by-course, videos-by-tenant).
- **`adminGroup` field** on admin-authored + roster/assignment models (Tenant/Course/Module/
  Lesson/VideoAsset/User/Enrollment) drives the tenant-scoped write gate. MUST be stamped
  `admin::<tenantId>` consistent with `tenantId` by the create resolver (tracked follow-up).
- **`CompletionStatement` is append-only + idempotent.** `id` = client-generated UUID =
  identifier ⇒ re-sends dedupe on the primary key. Grant only `create` + `read` — **never**
  `update`/`delete` to ANY group, and **no `adminGroup` write rule** (super-admin is deliberately
  read-only here). Same-tenant supervisors/admins read via `groupDefinedIn('tenantId')`.
- **`VideoAsset` is METADATA ONLY.** It references a provider handle / storage key; the bytes
  live in S3 under `media/videos/*`. DynamoDB never stores media. Per-tenant object isolation is
  enforced by a tenant-checked signed-URL mint (see `storage/resource.ts`), not by static S3 paths.

## Local workflow

```bash
npm run typecheck        --workspace @soteria-forge/backend   # tsc --noEmit
npx ampx sandbox         # OPTIONAL: a throwaway PERSONAL sandbox (writes amplify_outputs.json)
npx ampx generate outputs
```

- Do NOT run destructive AWS/Amplify/CDK commands (`delete-*`, `s3 rb`, `delete-stack`,
  `cdk destroy`, `ampx sandbox delete`, anything prod-targeting). The PreToolUse hook
  `.claude/hooks/block-destructive-aws.sh` refuses them; if a destructive step is truly needed,
  a human runs it.
- `amplify_outputs.json` is **git-ignored**; only `amplify_outputs.example.json` (placeholder
  shape) is tracked. Never commit real pool ids, client ids, or keys.
- Any change to auth/data/storage/authorizer goes through **security-reviewer** before it's done.
