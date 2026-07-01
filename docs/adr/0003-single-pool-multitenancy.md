# ADR-0003: Single Cognito pool + `custom:tenantId` + single-table DynamoDB

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform / security / backend
- **Related:** [ADR-0001](./0001-backend-amplify-gen2.md), [ADR-0002](./0002-offline-event-sourcing.md), [ADR-0004](./0004-turborepo-monorepo.md)

## Context

Soteria Forge is **multi-tenant**: many client organizations share one platform,
and a marketplace mode mints self-service buyer workspaces on demand. The
**non-negotiable** requirement is tenant isolation — no request may ever read or
write another tenant's data. This is the #1 security rule of the system.

We must choose (a) how tenants are represented in identity, and (b) how tenant
data is partitioned in storage, such that isolation is enforced *at the server*
and cannot be bypassed by a malicious or buggy client.

Prior art in the template resolved tenants from a request **header**
(`x-soteria-tenant`) or **subdomain** — trusting a value the client controls.
That is exactly the pattern we must not carry into the AWS rebuild.

## Decision

### One user pool, tenant in a verified claim

**We use a single Cognito user pool** (Lite tier) for the whole platform, with a
custom attribute **`custom:tenantId`** identifying each user's tenant, and four
groups for role tier: `worker`, `supervisor`, `tenant-admin`, `super-admin`.

- `custom:tenantId` is declared **immutable** in `auth/resource.ts`, so a user
  can never move themselves to another tenant.
- A **pre-token-generation** trigger stamps that stored, immutable attribute
  onto every issued token as a first-class claim.
- The tenant a request operates under is read **only** from that verified claim
  — never from request args, body, query string, or any header other than the
  verified `Authorization` bearer. **Never trust a tenantId from the request.**

Enterprise SSO is a **per-tenant SAML/OIDC IdP federated into this one pool**
(deferred — not built now). Federation keeps the single-pool model: the tenant
still resolves to `custom:tenantId`.

### One table, `TENANT#` partition

**We use a single DynamoDB table** (one AppSync/DynamoDB table) with a
partition-per-tenant key design:

```
PK = TENANT#<tenantId>
SK = TENANT#META
   | USER#<userId>
   | COURSE#<courseId>
   | MODULE#<courseId>#<moduleId>
   | LESSON#<courseId>#<moduleId>#<lessonId>
   | ENROLLMENT#<userId>#<courseId>
   | STMT#<statementId>        (xAPI completion statement)
   | VIDEO#<videoId>           (VideoAsset METADATA only — never video bytes)
```

Every item lives under its tenant's partition. GSIs cover the required access
patterns: **courses-by-tenant**, **enrollments-by-user**, **statements-by-user**,
**users-by-tenant**. The canonical key builders live in
`packages/shared/src/keys.ts`.

### The tenant-match invariant (row-level, enforced by AppSync)

**No caller may ever read or write another tenant's data.** An AppSync **Lambda
authorizer is request-level and cannot see per-row data**, so it cannot be the
row filter; tenant isolation is instead enforced **row-level by AppSync
dynamic-group authorization** keyed on each row's own `tenantId`. Enforcement is
layered:

| Layer | Where | What it does |
|------|------|------|
| Field | `data/resource.ts` | Every model carries a required `tenantId` (= partition owner); admin-authored + roster models also carry `adminGroup`. These should be stamped from the verified claim by the create resolver (see residual below). |
| Model auth (read) | `data/resource.ts` | `allow.groupDefinedIn('tenantId')` — the row's `tenantId` must be one of the caller's `cognito:groups`. **The load-bearing read control.** |
| Model auth (write) | `data/resource.ts` | `allow.groupDefinedIn('adminGroup')` (`adminGroup == 'admin::' + tenantId`) for admin/roster writes; `ownerDefinedIn('userId')` for a worker's own rows. Replaces tenant-blind `allow.group('tenant-admin')`. `defaultAuthorizationMode: 'userPool'` (no public/apiKey). |
| Token trigger | `functions/tenant-authorizer/pre-token-generation.ts` | Injects the caller's own immutable `custom:tenantId` (and `admin::<tenantId>` for tenant-admins) into `cognito:groups`, so a caller's groups only ever name their OWN tenant. |
| Lambda authorizer | `functions/tenant-authorizer/handler.ts` | **Defense-in-depth for custom operations** (e.g. a signed-URL mint), NOT the model gate. Verifies the **ID token** (which carries `custom:tenantId`) and reuses the shared guard. |
| Shared guard | `packages/shared/src/tenant.ts` | Canonical `assertTenantMatch` / `isSameTenant`: strict verbatim equality, empty ⇒ deny, no normalization, no wildcard, **no super-admin bypass**. |

Static group rules alone are **tenant-blind** — `tenant-admin` in tenant A and
tenant B are the *same* Cognito group, and `allow.authenticated().to(['read'])`
would let any tenant read any row — which is exactly why isolation uses **dynamic**
groups (`groupDefinedIn`) keyed on the row's own tenant rather than static role
groups. `super-admin` is the one legitimately global role and keeps a cross-tenant
grant on the models (still read-only on append-only `CompletionStatement`); every
other role is confined to its own tenant by the injected group set.

> **Tracked residual.** `adminGroup` must be kept consistent with `tenantId`
> (`'admin::' + tenantId`) by a create resolver / custom-mutation pre-hook so the
> two can never diverge, and per-tenant **S3 object** isolation is enforced by a
> tenant-checked **signed-URL mint** (a static S3 path cannot express it). Both are
> recorded in `docs/SECURITY_REVIEW.md`.

Append-only statements interlock with this:
`CompletionStatement` grants only `create` + `read` to any group (even
`super-admin` is read-only), keeping the append-only, idempotent-by-UUID
invariant from [ADR-0002](./0002-offline-event-sourcing.md) true even for staff.

## Alternatives considered

- **Pool-per-tenant (silo) — rejected.** Strong isolation, but N pools means N
  app-client configs, N sets of triggers, and painful cross-tenant staff tooling
  and marketplace onboarding. Isolation is better delivered by the verified
  claim + partition match than by pool count, and this scales to marketplace
  tenants minted on demand.
- **Table-per-tenant — rejected.** Operationally heavy (per-tenant provisioning,
  migrations, index management) and hostile to the marketplace's create-a-tenant-
  at-checkout flow. A single table with a `TENANT#` partition gives the same
  isolation with one schema to reason about.
- **Tenant from header/subdomain (the old template) — rejected.** The client
  controls those values, so they can be forged. Only a **verified token claim**
  is trustworthy. This is the specific pattern the rebuild exists to kill.
- **Trusting a tenantId in request args, with resolvers filtering by it —
  rejected.** Any control that reads the tenant from client input is one bug away
  from cross-tenant access. The tenant must come from the token, and the server
  must *refuse* mismatches, not merely *filter* on a client value.

## Consequences

**Easier**

- One pool and one table: a single auth config, one schema, one set of triggers,
  and one place (the shared guard) that defines what "same tenant" means.
- Marketplace onboarding can mint a new tenant (a new `TENANT#<id>` partition +
  users with the right `custom:tenantId`) without provisioning infrastructure.
- The isolation story is auditable end to end: a reviewer can follow
  `custom:tenantId` from the pool attribute through the token trigger to the
  authorizer and the partition (see `backend/data/tenant-isolation.md`).

**Harder / ongoing cost**

- **Isolation is a property we must actively preserve.** Because tenants share a
  pool and a table, *every* new resolver, index, and query must be tenant-scoped
  and must route through `assertTenantMatch`. A single unscoped access path is a
  cross-tenant breach. This warrants an adversarial security review before any
  regulated production use.
- Cognito quotas and DynamoDB hot-partition behavior are now **shared** across
  tenants; a very large tenant can affect neighbors and may need targeted
  mitigation.
- The immutability of `custom:tenantId` means legitimately moving a user between
  tenants is a deliberate admin operation (recreate under the new tenant), not an
  attribute edit — a correct constraint, but one support must understand.
- Per-tenant SSO federation is deferred; until built, all tenants authenticate
  against the pool's native flows.
