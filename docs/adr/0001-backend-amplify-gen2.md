# ADR-0001: Backend on Amplify Gen 2 (over raw CDK)

- **Status:** **Superseded by [ADR-0007](./0007-supabase-backend.md).**
- **Date:** 2026-07-01
- **Deciders:** Platform / backend
- **Related:** [ADR-0002](./0002-offline-event-sourcing.md), [ADR-0003](./0003-single-pool-multitenancy.md)

> **Superseded by [ADR-0007](./0007-supabase-backend.md) (2026-07-01).** The
> backend moved off AWS/Amplify to **Supabase** (Postgres + RLS + Auth + Storage)
> before anything here was deployed. The Amplify Gen 2 definition (`backend/`) has
> been deleted; this record is kept for history. Read [ADR-0007](./0007-supabase-backend.md)
> for the current backend.

## Context

The rebuild moves Soteria Forge off the Vercel + Express + MongoDB template onto
AWS. The backend has to provide, as **defined-as-code** (Phase 0 ships nothing
deployed):

- one Cognito user pool with a custom `custom:tenantId` attribute, four groups,
  and pre-token-generation + authorizer triggers,
- an AppSync GraphQL API backed by a **single** DynamoDB table with the key
  design and GSIs in [ADR-0003](./0003-single-pool-multitenancy.md),
- tenant-scoped S3 storage,
- a Lambda authorizer that enforces the tenant-match invariant.

Two credible ways to author that on AWS:

- **Option A — Amplify Gen 2.** Code-first TypeScript (`defineBackend`,
  `defineAuth`, `defineData` with an `a.schema`, `defineStorage`,
  `defineFunction`). Generates the AppSync API, DynamoDB tables, and Cognito
  wiring from a typed schema, and emits a typed data client + `amplify_outputs`
  for the clients.
- **Option B — raw AWS CDK.** Hand-assemble AppSync, VTL/JS resolvers, DynamoDB,
  Cognito, and Lambda as CDK constructs.

Key forces: this is a **small team building a template**, not a bespoke
platform; the two clients (`apps/mobile`, `apps/console`) both want a typed data
client and generated config; and the tenant-isolation invariant must be
expressible *and reviewable* in the schema and a Lambda authorizer, not buried
in hand-written VTL.

## Decision

**We build the backend with Amplify Gen 2 (Option A).** The definition lives in
`backend/`:

- `backend.ts` — `defineBackend({ auth, data, storage, tenantAuthorizer, preTokenGeneration })`.
- `auth/resource.ts` — the single pool, `custom:tenantId` (immutable), groups,
  triggers.
- `data/resource.ts` — the `a.schema` with all models, `userPool` default auth,
  group/owner rules, GSIs, and the Lambda authorizer wired in.
- `storage/resource.ts` — tenant-prefixed S3.
- `functions/tenant-authorizer/` — the authorizer + pre-token-generation Lambdas.

Amplify Gen 2 is escape-hatchable: where the generated resolvers are not enough
for the tenant-match check, we drop to a Lambda authorizer and (where needed)
custom resolvers / CDK overrides via the same backend object — so choosing
Gen 2 does **not** forfeit CDK-level control.

## Alternatives considered

- **Raw CDK (Option B) — rejected.** It gives maximum control but makes us
  hand-write and hand-maintain the AppSync schema, resolvers, DynamoDB indexes,
  and the typed client that Gen 2 generates for free. For a template meant to be
  re-stamped per client, that is a large, error-prone surface with no offsetting
  benefit — and the tenant-isolation logic we most care about (the Lambda
  authorizer) is identical either way. We keep CDK available *through* Gen 2's
  escape hatches instead of adopting it wholesale.
- **Amplify Gen 1 (CLI/CloudFormation, `amplify add`) — rejected.** Config-driven
  rather than code-first, weaker TypeScript story, and superseded by Gen 2. It
  also historically leaned on DataStore for offline, which we explicitly reject
  in [ADR-0002](./0002-offline-event-sourcing.md).
- **A hand-rolled Node/Express API on Lambda + a document store — rejected.**
  That is essentially the template we are migrating *away from*; it reintroduces
  bespoke auth and tenancy plumbing that Cognito + AppSync give us declaratively.

## Consequences

**Easier**

- One typed schema (`a.schema`) is the source of truth for models, auth rules,
  and indexes; the data client and `amplify_outputs` are generated, so clients
  stay in sync with the backend contract.
- Per-developer sandboxes (`ampx sandbox`) give isolated, ephemeral stacks for
  iteration without shared-environment contention.
- Auth, data, storage, and functions live in one code-first definition that
  reviewers can read end to end.

**Harder / ongoing cost**

- We accept Amplify Gen 2's conventions and its release cadence; some advanced
  AppSync/DynamoDB shapes require dropping to escape hatches, which are less
  documented than first-class constructs.
- The single-table key design in [ADR-0003](./0003-single-pool-multitenancy.md)
  is expressed *through* Amplify models + secondary indexes rather than authored
  directly, so the mapping from the intended `PK`/`SK`/GSI design to Amplify
  models must be kept honest (see `packages/shared/src/keys.ts` and
  `backend/data/tenant-isolation.md`).
- **Phase 0 is definition-only.** Nothing is deployed and no AWS resources
  exist; correctness of the *definition* is the deliverable. `amplify_outputs`
  is produced only when someone runs a sandbox/deploy, so clients shape against
  `amplify_outputs.example.json` until then.
