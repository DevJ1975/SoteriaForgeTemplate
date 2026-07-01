# Tenant isolation in the data layer

> The #1 security rule of this system: **every data access is scoped by
> `TENANT#<tenantId>`, and a caller may only ever touch their own tenant's
> partition.** This note tells a reviewer exactly where that is enforced.

## The one trusted source of the caller's tenant

The caller's tenant is **only** ever read from the verified Cognito
`custom:tenantId` claim, and it reaches authorization in two verified forms:

- `custom:tenantId` is declared **immutable** (`auth/resource.ts`), so a user can
  never move themselves to another tenant.
- The **pre-token-generation** trigger
  (`functions/tenant-authorizer/pre-token-generation.ts`):
  1. echoes that stored, immutable attribute into every issued token as the
     `custom:tenantId` claim, **and**
  2. injects the tenant into the caller's **`cognito:groups`** (the tenantId
     itself, plus `admin::<tenantId>` for a tenant-admin). `cognito:groups`
     appears in **both** the ID and access tokens, which is what lets AppSync do
     row-level tenant checks regardless of token source.
- Nothing downstream ever reads a tenant from request args, body, query string,
  or any header other than the verified `Authorization` bearer.

## Where isolation is enforced — ROW-LEVEL, by AppSync itself (the primary gate)

Row-level tenant isolation is enforced by **dynamic-group authorization on each
row's own `tenantId`**, evaluated by AppSync per row:

| Layer | File | What it does |
|------|------|--------------|
| **Field** | `data/resource.ts` | Every model carries a required `tenantId` (the partition owner, `PK = TENANT#<tenantId>`). Admin-authored models + roster/assignment models also carry `adminGroup`. The `create*Stamped` custom mutations stamp both from the verified claim (see below); they are never trusted from the client. |
| **Row-level READ gate** | `data/resource.ts` | Every model has `allow.groupDefinedIn('tenantId').to(['read'])`: the record's `tenantId` value must be one of the caller's `cognito:groups`. A caller's groups only ever contain their **own** tenantId, so cross-tenant reads are impossible. |
| **Tenant-scoped WRITE gate** | `data/resource.ts` | Admin-authored models (Tenant/Course/Module/Lesson/VideoAsset) and roster/assignment models (User/Enrollment) grant `create/update/delete` via `allow.groupDefinedIn('adminGroup')`, where `adminGroup == 'admin::' + tenantId`. Only a tenant's **own** admins hold that group, so cross-tenant writes are impossible. This replaces the tenant-**blind** `allow.group('tenant-admin')`. |
| **Owner rules** | `data/resource.ts` | `allow.ownerDefinedIn('userId').identityClaim('sub')` — User read-own, Enrollment read/update-own, CompletionStatement create+read-own. Tenant-safe because a user only ever owns their own rows. |
| **Shared guard (custom ops)** | `packages/shared/src/tenant.ts` | The canonical `assertTenantMatch` / `isSameTenant` / `stampTenantOwnership`: strict verbatim equality, empty ⇒ deny, no normalization, no wildcard, **no super-admin bypass**. Mirrored by the Lambda authorizer, the tenant stamp, and the media-URL mint. |
| **Create-time STAMP** | `functions/tenant-stamp/` + `data/resource.ts` | `create*Stamped` mutations stamp `tenantId` + `adminGroup` from the verified `custom:tenantId` claim, discarding client values (see "Server-side tenant STAMP" below). |
| **S3 signed-URL MINT** | `functions/media-url/` + `data/resource.ts` | `getMediaUrl(key, op)` refuses to sign unless the `media/<kind>/<tenantId>/…` key's tenant equals the verified claim (see "Object-layer (S3) isolation" below). |

## The Lambda authorizer is DEFENSE-IN-DEPTH for custom ops — NOT the model gate

`functions/tenant-authorizer/handler.ts` is **not** the model read/write gate. An
AppSync Lambda authorizer is **request-level**: it runs before resolution and
cannot see per-row data, so it **cannot** do row-level tenant filtering. It is
available as an **optional** `lambda` auth mode for **custom operations** (e.g. a
tenant-checked signed-URL mint, offline-sync stamping) that want a coarse
request-level tenant match as belt-and-suspenders. It verifies the **ID token**
(which carries `custom:tenantId`; access tokens do not by default) — or, if a
custom op can only forward the access token, keys off the injected
`cognito:groups` tenant group. It is not load-bearing for the models.

## Why plain group/owner rules were NOT sufficient — and how this fixes it

Amplify **static** group rules are **tenant-blind**: `tenant-admin` in tenant A
and `tenant-admin` in tenant B are the *same* Cognito group, and
`allow.authenticated().to(['read'])` lets **any** authenticated user from **any**
tenant read **any** row. Those were the confirmed cross-tenant read/write holes.
The fix makes the gate **dynamic** and per-row: `groupDefinedIn('tenantId')`
(reads) and `groupDefinedIn('adminGroup')` (writes) compare the *row's* tenant to
the *caller's* injected tenant group, so the group check is now tenant-aware.

## Elevated roles do not weaken isolation

`super-admin` is the legitimately **global** platform operator and keeps a
cross-tenant grant on the models (it is the only role for which cross-tenant
access is allowed). For `CompletionStatement`, `super-admin` is deliberately
granted **read only** so the append-only invariant holds even for staff.

## Append-only / idempotent statements

`CompletionStatement` uses the **client-generated UUID `id`** as its identifier,
so a re-sent statement (offline retry) collides on the primary key and is a
no-op create — dedupe by construction. Auth grants only `create` + `read`: the
owner creates+reads their own; same-tenant supervisors/admins read via
`groupDefinedIn('tenantId')`; super-admin reads. **No `update`/`delete` to ANY
group, and no `adminGroup` write rule** — statements are immutable. There is no
conflict resolution and none is needed. See `packages/shared/src/xapi.ts`.

## Server-side tenant STAMP — `create*Stamped` custom mutations (CLOSED)

`tenantId` and `adminGroup` are the two fields the read gate
(`groupDefinedIn('tenantId')`) and the write gate (`groupDefinedIn('adminGroup')`)
key on. A client must never set them. They are stamped **server-side** by the
`create*Stamped` custom mutations (`createTenantStamped`, `createUserStamped`,
`createCourseStamped`, `createModuleStamped`, `createLessonStamped`,
`createEnrollmentStamped`, `createVideoAssetStamped` in `data/resource.ts`),
backed by the **`tenant-stamp` Lambda** (`functions/tenant-stamp/`):

- The handler reads the caller's tenant ONLY from AppSync's VERIFIED
  `event.identity.claims['custom:tenantId']` — never from the request input.
- `applyTenantStamp(callerTenant, input)` (a byte-for-byte mirror of
  `@soteria-forge/shared` `stampTenantOwnership`) OVERWRITES `tenantId` and
  `adminGroup` (`admin::<tenantId>`) on the create input, discarding any
  client-supplied values, so the two can **never diverge or be forged**.
- A create with **no** verified tenant claim throws `TenantIsolationError`
  (fail closed) — nothing is written.

The raw auto-generated `create*` mutations still exist and are still safe against
cross-tenant WRITE (the `adminGroup` write gate blocks a row whose group the
caller does not hold); the stamp adds the guarantee that `tenantId ≡ adminGroup`
and that neither is client-controlled. Production admin/roster clients call the
`*Stamped` variants. The pure stamp logic lives in
`functions/tenant-stamp/tenant-stamp.ts` (no AWS imports) so it is unit-testable.

## Object-layer (S3) isolation — via a tenant-checked signed-URL mint (CLOSED)

Static S3 path rules **cannot** express per-tenant object isolation (there is no
`{tenantId}` placeholder bound to `custom:tenantId`; `{entity_id}` is the
per-**user** identity, not the tenant). `storage/resource.ts` therefore grants
only coarse least-privilege capabilities (authenticated read; tenant-admin
author) and enforces WHICH-tenant at a **tenant-checked signed-URL mint**: the
`getMediaUrl(key, op)` custom query (`data/resource.ts`) backed by the
**`media-url` Lambda** (`functions/media-url/`):

- The handler reads the caller's tenant ONLY from the VERIFIED
  `event.identity.claims['custom:tenantId']` (with a defense-in-depth fallback
  that VERIFIES a forwarded ID token) — never from the request key/args/headers.
- `assertKeyTenant(callerTenant, key)` (pure logic in `media-url/key-tenant.ts`,
  a byte-for-byte mirror of `assertTenantMatch`) parses the requested
  `media/<kind>/<tenantId>/…` key and **refuses to sign** unless the key's tenant
  segment equals the caller's verified tenant. A mismatch OR an unparseable /
  traversal-y key yields a null target ⇒ deny (empty ⇒ deny). No URL is signed on
  refusal.
- Only after the match succeeds does it return a short-lived (300s) pre-signed
  GET/PUT URL for that ONE object. The pure parse+assert logic is AWS-free and
  unit-testable.

That mint — NOT the static S3 paths — is the enforced production object boundary.

## Residual / tracked follow-ups

- **Intra-tenant role granularity.** Finer-grained supervisor-vs-admin write
  scoping within a tenant (beyond the current admin-group write gate).
