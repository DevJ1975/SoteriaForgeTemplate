# `@soteria-forge/backend` — Amplify Gen 2 backend definition

Code-first (TypeScript) Amplify Gen 2 backend for the AWS-era Soteria Forge
platform: a single Cognito user pool, an AppSync/DynamoDB data layer, tenant-
scoped S3 storage, and the tenant-isolation Lambda authorizer.

> **Phase 0 — DEFINED-AS-CODE ONLY.** Nothing here is deployed. **No AWS
> resources are provisioned.** This package is the *definition*; correctness of
> the definition is the deliverable. Do not run `npm install`, and do not create
> cloud resources from this checkout.

## Layout

```
backend/
  backend.ts                         defineBackend({ auth, data, storage, tenantAuthorizer, preTokenGeneration })
  auth/resource.ts                   single Cognito pool (Lite tier), custom:tenantId, groups, triggers
  data/resource.ts                   a.schema — 8 models, userPool default auth, GSIs, tenant authorizer
  data/tenant-isolation.md           reviewer note: where/how the tenant match is enforced
  storage/resource.ts                tenant-scoped S3 (tenant/{tenantId}/*)
  functions/tenant-authorizer/
    resource.ts                      defineFunction: authorizer + pre-token-generation
    handler.ts                       verifies JWT, matches custom:tenantId to target partition, denies cross-tenant
    pre-token-generation.ts          stamps the verified custom:tenantId claim onto issued tokens
  amplify_outputs.example.json       placeholder client config (NO secrets, NO real ids)
```

## Models (single-table intent)

Eight models map onto the intended single-table key design
(`packages/shared/src/keys.ts`): `Tenant`, `User`, `Course`, `Module`, `Lesson`,
`Enrollment`, `CompletionStatement`, `VideoAsset`. Every model carries `tenantId`
(PK = `TENANT#<tenantId>`). Secondary indexes provide the required access
patterns: **courses-by-tenant**, **enrollments-by-user**, **statements-by-user**,
**users-by-tenant** (plus a few supporting indexes).

## Tenant isolation

See [`data/tenant-isolation.md`](./data/tenant-isolation.md). In short: the
caller's tenant is read **only** from the verified `custom:tenantId` claim, and
the Lambda authorizer refuses any request whose target partition does not match
that claim — mirroring `assertTenantMatch` from `@soteria-forge/shared`.

## Running the sandbox (only when you intend to deploy — not in Phase 0)

Requires configured AWS credentials. This provisions real (ephemeral) cloud
resources into a personal sandbox, so it is **out of scope for Phase 0**.

```bash
# Type-check the definition WITHOUT touching AWS (safe, no resources):
npm run typecheck

# Provision a personal sandbox (DEPLOYS to AWS — do NOT run in Phase 0):
npm run sandbox           # ampx sandbox
npm run sandbox:once      # one-shot deploy, then exit

# Generate client config (amplify_outputs.json) from a running sandbox:
npm run generate:outputs
```

`ampx sandbox` writes a real `amplify_outputs.json` (git-ignored). Until then,
clients can shape against `amplify_outputs.example.json`, which contains only
placeholders.

## Secrets

No secrets live in this package. Deploy-time values (user pool id, app client id,
GraphQL endpoint) are produced by `ampx` at deploy time into the git-ignored
`amplify_outputs.json`. See `.env.example` conventions at the repo root for any
build-time toggles.
