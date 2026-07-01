# Security review — Phase 0 foundation (tenant isolation)

**Date:** 2026-07-01 · **Scope:** the code-first foundation (backend Amplify Gen 2 definition,
mobile auth + offline layer, shared guards, `.claude` guardrails). **Reviewers:** three adversarial
`security-reviewer` passes (tenant-isolation lens, secrets/least-privilege lens, offline-integrity
lens), run against the code on disk — not a checklist.

> This is an **undeployed, code-first** foundation. No AWS/Cloudflare/Expo resources exist. Findings
> are about the *definition*; they must all be re-verified against a live sandbox before any
> production use.

## Verdict

The review initially returned **FAIL** on tenant isolation — the generated backend had real
cross-tenant holes. Those were **remediated and re-verified** (see below). Tenant isolation for the
DynamoDB/AppSync data layer is now enforced **row-level** and traces clean; two items are tracked as
**residual follow-ups** (S3 object isolation and `adminGroup` stamping) that must be closed before
regulated production use.

## Findings and disposition

### Fixed — CRITICAL: cross-tenant read/write in the AppSync data layer
`backend/data/resource.ts` granted tenant-**blind** access: `allow.authenticated().to(['read'])`
let any authenticated user of any tenant read any row, and `allow.group('tenant-admin')` is the same
Cognito group across tenants (cross-tenant write). The Lambda authorizer that was documented as the
"load-bearing" control was never bound to any model — and an AppSync Lambda authorizer is
request-level, so it *cannot* do row-level tenant filtering anyway.

**Fix:** row-level **dynamic-group authorization** (the AWS-documented multi-tenant pattern).
- The **pre-token-generation trigger** injects the caller's own immutable `custom:tenantId` into
  `cognito:groups` (plus `admin::<tenantId>` for tenant-admins). Fails closed when the claim is absent.
- Every model read gate is `allow.groupDefinedIn('tenantId')`; admin/roster writes use
  `allow.groupDefinedIn('adminGroup')` (`adminGroup == 'admin::' + tenantId`). A caller's groups only
  ever name their own tenant, so cross-tenant read/write is impossible.
- Owner rules (`ownerDefinedIn('userId').identityClaim('sub')`) confine a worker to their own rows.
- `super-admin` remains the one legitimately global role (and stays read-only on `CompletionStatement`).
- The Lambda authorizer is reframed as **defense-in-depth for custom operations** and now verifies
  the **ID token** (which carries `custom:tenantId`; access tokens don't by default).

**Re-verification (trace):** for every model, a worker/supervisor/tenant-admin in tenant A can reach
a tenant-B row only if B's `tenantId`/`adminGroup` is in their `cognito:groups` — it never is.
Cross-tenant read/write = **NO** for all models (super-admin excepted). `CompletionStatement` has no
`update`/`delete` grant for any principal → append-only preserved.

### Fixed — CRITICAL/HIGH: S3 access rules were wrong and over-broad
`backend/storage/resource.ts` bound paths on `tenant/{entity_id}/*` and falsely claimed
`{entity_id}` resolves to the tenant — in Amplify Gen 2 `{entity_id}` is the per-**user** Cognito
identity id, not the tenant. Every prefix also granted read+write+delete to every identity.

**Fix:** `private/{entity_id}/*` now uses `allow.entity('identity')` for genuine per-user space;
shared media under `media/*` grants authenticated `read` and `tenant-admin` `read/write/delete`; the
false catch-all is removed and all comments state the real semantics. See the residual below for true
per-tenant object isolation.

### Fixed — HIGH: ID-token vs access-token mismatch on the tenant claim
The authorizer verified the **access** token for `custom:tenantId`, which Cognito access tokens don't
carry. **Fix:** the authorizer verifies the **ID token**; the row-level gate keys off
`cognito:groups`, which is present in *both* tokens, so the model gate is token-source agnostic.

### Verified clean — offline completion-statement queue (new mobile layer)
One reviewer audited the **legacy** `apps/api`/`apps/lms` Express/Mongo stack (now **retired**) and
found payload-spread, actor-forgery, and non-idempotent double-write bugs there. Those files are
removed. The **new** `apps/mobile/src/offline/{queue,sync}.ts` was verified separately and is clean:
no client payload is spread over trusted `tenantId`/`userId`; enqueue dedupes on the client UUID
(same id reused on retry, no duplicate rows); the queue is append-only and sync only flips a `synced`
flag. (The retired-code findings are catalogued here only as the checklist the new code was verified
against.)

### Verified clean — secrets & guardrails
No committed secrets, pool ids, endpoints, or tokens in any new subtree — only `.example` /
placeholder values. `.claude/settings.json` denies reads of `.env*`/`amplify_outputs.json`/`*.pem`
and gates deploy/push/publish behind `ask`. Both PreToolUse hooks were executed against attack
payloads and confirmed to **block** (exit 2) real `.env` commits, key-shaped strings, and destructive
`aws`/`ampx`/`cdk` commands, while **allowing** `.env.example` and benign commands.

## Tracked residual follow-ups (must close before regulated production)

1. **`adminGroup` ≡ `tenantId` stamping.** A create resolver / custom-mutation pre-hook must stamp
   `adminGroup = 'admin::' + tenantId` server-side so the two cannot diverge. (AppSync already blocks
   writing a row whose `adminGroup` the caller doesn't hold, so the window is narrow — but it should
   be stamped, not client-supplied.)
2. **S3 per-tenant object isolation via a signed-URL mint.** A static S3 path cannot prevent a
   tenant-A user from reading a guessed tenant-B key; a tenant-checked Lambda that verifies
   `custom:tenantId` owns the object before signing is the enforced boundary.
3. **Intra-tenant role granularity.** Finer supervisor-vs-admin write scoping within a tenant (the
   current gates are tenant-safe but coarse on role).

## Definition of done (per the rebuild plan §11)

- [x] Tenant-isolation invariant holds for the new surface (re-verified after remediation).
- [x] Type-checkable surface (`packages/shared` library, `packages/ui`) compiles clean.
- [x] No secrets committed; guardrail hooks proven to block.
- [x] ADRs written (`docs/adr/`), this review recorded.
- [ ] **Deferred (needs live infra):** deploy an `ampx sandbox`, run the isolation test suite against
      it, and close the three residuals above.
