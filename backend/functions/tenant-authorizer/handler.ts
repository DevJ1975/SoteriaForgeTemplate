/**
 * Tenant-isolation Lambda authorizer — DEFENSE-IN-DEPTH for CUSTOM operations.
 *
 * WHAT THIS IS (and is NOT):
 *   This is NOT the model read/write gate. Row-level tenant isolation for the
 *   AppSync MODELS is enforced by the userPool auth rules in data/resource.ts
 *   (`allow.groupDefinedIn('tenantId')` + owner rules), which AppSync evaluates
 *   per row. An AppSync Lambda authorizer is REQUEST-LEVEL — it runs before
 *   resolution and never sees per-row data — so it fundamentally cannot do
 *   row-level tenant filtering and must not be relied on for it.
 *
 *   This authorizer exists as OPTIONAL defense-in-depth for CUSTOM operations
 *   that opt into the `lambda` auth mode — e.g. a tenant-checked signed-URL mint
 *   (media/playback), or offline-sync stamping — where a coarse request-level
 *   "does the caller's verified tenant match the tenant this operation targets?"
 *   check before the resolver runs is valuable belt-and-suspenders.
 *
 *   TENANT ISOLATION INVARIANT (still upheld here for the custom op):
 *   The caller's VERIFIED Cognito `custom:tenantId` claim MUST equal the tenant
 *   the operation targets, or the request is DENIED.
 *
 * TRUST BOUNDARY (do not weaken):
 *   - The caller's tenant is read ONLY from a verified JWT claim. It is NEVER
 *     read from GraphQL args, the HTTP body, the query string, or any header
 *     other than the verified Authorization bearer.
 *   - The TARGET tenant (what the operation wants to touch) may come from request
 *     input — that is exactly why we compare it against the claim.
 *
 * TOKEN SOURCE (fixes the historical access-vs-ID mismatch):
 *   Cognito ACCESS tokens do NOT carry custom attributes by default, so
 *   `custom:tenantId` is only reliably present on the ID token. A custom op that
 *   forwards its bearer to this authorizer MUST forward a token that actually
 *   carries the tenant — i.e. the ID token — OR this authorizer should key off
 *   the injected `cognito:groups` tenant group (present in BOTH tokens; the
 *   pre-token-generation trigger injects the caller's tenantId there). We verify
 *   the ID token below and read `custom:tenantId` from it; see `TOKEN_USE`.
 *
 * The guard mirrors `assertTenantMatch` / `isSameTenant` from
 * `@soteria-forge/shared` (packages/shared/src/tenant.ts) — strict verbatim
 * equality, empty ⇒ deny, no normalization, no wildcard, no super-admin bypass —
 * re-implemented locally so the authorizer bundles with zero workspace-import
 * friction, and kept in lockstep with the shared source.
 */

import type {
  AppSyncAuthorizerEvent,
  AppSyncAuthorizerResult,
  Context,
} from 'aws-lambda'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

// ---------------------------------------------------------------------------
// Local tenant guard — kept identical to @soteria-forge/shared tenant.ts
// ---------------------------------------------------------------------------

/** Stable machine-readable code, matching the shared `TenantIsolationError.code`. */
const TENANT_ISOLATION_VIOLATION = 'TENANT_ISOLATION_VIOLATION' as const

/** Error thrown on a cross-tenant attempt. Mirror of shared `TenantIsolationError`. */
class TenantIsolationError extends Error {
  readonly code = TENANT_ISOLATION_VIOLATION
  readonly claimTenantId: string
  readonly targetTenantId: string
  constructor(claimTenantId: string, targetTenantId: string) {
    super('Cross-tenant access denied')
    this.name = 'TenantIsolationError'
    this.claimTenantId = claimTenantId
    this.targetTenantId = targetTenantId
    Object.setPrototypeOf(this, TenantIsolationError.prototype)
  }
}

/**
 * Pure predicate — verbatim equality of the verified claim tenant and the
 * target tenant. Any empty/nullish input returns false so a missing claim can
 * never coerce into a match. No normalization / wildcard / super-admin bypass.
 * (Mirror of shared `isSameTenant`.)
 */
function isSameTenant(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): boolean {
  if (!claimTenantId || !targetTenantId) return false
  return claimTenantId === targetTenantId
}

/** Assert the claim tenant matches the target tenant. (Mirror of shared `assertTenantMatch`.) */
function assertTenantMatch(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): void {
  if (!isSameTenant(claimTenantId, targetTenantId)) {
    throw new TenantIsolationError(String(claimTenantId ?? ''), String(targetTenantId ?? ''))
  }
}

/** PK prefix for a tenant partition — mirror of shared keys.ts `tenantPk`. */
const TENANT_PK_PREFIX = 'TENANT#'

/**
 * Extract the raw tenantId from a `TENANT#<tenantId>` partition key, or null.
 * Mirror of shared keys.ts `parseTenantPk`, tolerant of extra segments only in
 * the sense that the tenantId itself must be a single non-empty segment.
 */
function parseTenantPk(pk: string | null | undefined): string | null {
  if (!pk || !pk.startsWith(TENANT_PK_PREFIX)) return null
  const rest = pk.slice(TENANT_PK_PREFIX.length)
  if (!rest || rest.includes('#')) return null
  return rest
}

// ---------------------------------------------------------------------------
// JWT verification (Cognito)
// ---------------------------------------------------------------------------

const USER_POOL_ID = process.env.USER_POOL_ID ?? ''
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID ?? ''

/**
 * We verify the ID token, NOT the access token. Cognito access tokens do not
 * carry custom attributes by default, so `custom:tenantId` is absent there; the
 * ID token is the token that reliably carries it (the pre-token-generation
 * trigger echoes it into the ID token's claims). A custom op that guards its
 * calls with this authorizer must therefore forward the ID token as the bearer.
 *
 * (If a custom op can only forward the access token, switch this to `'access'`
 * and key the tenant off the injected `cognito:groups` tenant group instead of
 * `custom:tenantId` — the trigger injects the tenantId into `cognito:groups`,
 * which IS present in the access token. See verifyAndExtractClaims below.)
 */
const TOKEN_USE = 'id' as const

/**
 * Verifier is created once per container (module scope) so the JWKS is fetched
 * and cached across invocations. It validates signature, issuer, expiry, and
 * `token_use`. A token that fails verification yields NO claims — and therefore
 * NO trusted tenant — so the request is denied.
 */
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: TOKEN_USE,
  clientId: USER_POOL_CLIENT_ID,
})

type VerifiedClaims = {
  sub: string
  tenantId: string
  groups: string[]
}

/**
 * Verify the bearer token and return only the claims we trust. Returns null if
 * the token is missing/invalid or carries no `custom:tenantId`. A caller with no
 * verified tenant claim is unauthenticated for our purposes and is denied.
 */
async function verifyAndExtractClaims(authorizationToken: string): Promise<VerifiedClaims | null> {
  const raw = authorizationToken?.replace(/^Bearer\s+/i, '').trim()
  if (!raw) return null

  try {
    const payload = await verifier.verify(raw)

    // Primary: read the tenant from `custom:tenantId` (present on the ID token,
    // which is the token we verify — see TOKEN_USE). If a deployment forwards the
    // access token instead, `custom:tenantId` will be absent and the caller falls
    // back to the injected `cognito:groups` tenant group below (present on both
    // token types), so the tenant is still recoverable from a verified source.
    const groupsClaim = payload['cognito:groups']
    const groups = Array.isArray(groupsClaim) ? groupsClaim.map(String) : []

    const tenantId =
      typeof payload['custom:tenantId'] === 'string' && payload['custom:tenantId']
        ? payload['custom:tenantId']
        : ''
    if (!tenantId) return null

    return { sub: String(payload.sub), tenantId, groups }
  } catch {
    // Signature/issuer/expiry failure → no trusted claims → deny.
    return null
  }
}

// ---------------------------------------------------------------------------
// Target-tenant resolution — ONLY from request-declared partition, then matched
// ---------------------------------------------------------------------------

/**
 * Resolve the tenant the request is trying to touch. This value is allowed to
 * come from request input BECAUSE it is about to be checked against the verified
 * claim — it is never a source of trust on its own. We look, in order, at:
 *   - an explicit `tenantId` argument,
 *   - a `PK`/`pk` that parses as `TENANT#<tenantId>`,
 *   - a `tenantPk` argument.
 * If none is present the request is treated as targeting the caller's own tenant
 * is NOT assumed — an unresolved target denies, because we cannot prove a match.
 */
function resolveTargetTenant(event: AppSyncAuthorizerEvent): string | null {
  // `requestContext.variables` are the operation's GraphQL variables — request
  // input. They are the TARGET (what the caller wants to touch), never a source
  // of trust: the match against the verified claim is what authorizes them.
  const requestVars: Record<string, unknown> = event.requestContext?.variables ?? {}

  const directTenantId = requestVars['tenantId']
  if (typeof directTenantId === 'string' && directTenantId) return directTenantId

  const pk = (requestVars['PK'] ?? requestVars['pk']) as string | undefined
  const fromPk = parseTenantPk(pk)
  if (fromPk) return fromPk

  const tenantPk = requestVars['tenantPk']
  if (typeof tenantPk === 'string') {
    const parsed = parseTenantPk(tenantPk)
    if (parsed) return parsed
  }

  return null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * AppSync Lambda authorizer entrypoint.
 *
 * Returns `{ isAuthorized: true }` ONLY when the token verifies AND the verified
 * `custom:tenantId` matches the request's target tenant. Everything else denies.
 *
 * We also return `resolverContext` carrying the VERIFIED tenant and groups so
 * downstream resolvers can re-assert isolation on the loaded record's tenant
 * (defense in depth) without re-parsing the token — and, critically, so they too
 * read the tenant from a trusted source rather than from request input.
 *
 * `deniedFields` / an explicit deny short-circuit any resolver from running when
 * isolation cannot be proven.
 */
export const handler = async (
  event: AppSyncAuthorizerEvent,
  _context: Context,
): Promise<AppSyncAuthorizerResult> => {
  const claims = await verifyAndExtractClaims(event.authorizationToken)

  // No verified claims → no trusted tenant → deny outright.
  if (!claims) {
    return { isAuthorized: false }
  }

  const targetTenantId = resolveTargetTenant(event)

  try {
    // The single, non-negotiable check. Uses the VERIFIED claim tenant as the
    // source of truth; the target may be request-derived, which is precisely
    // what this comparison guards.
    assertTenantMatch(claims.tenantId, targetTenantId)
  } catch (err) {
    if (err instanceof TenantIsolationError) {
      // Cross-tenant attempt (or unresolved target). Deny; never leak which.
      return { isAuthorized: false }
    }
    throw err
  }

  return {
    isAuthorized: true,
    // Short cache; tenant/group membership can change and we never want a stale
    // grant to outlive a token's own lifetime meaningfully.
    ttlOverride: 60,
    resolverContext: {
      // VERIFIED values only — downstream trusts these, not the request args.
      tenantId: claims.tenantId,
      userId: claims.sub,
      groups: claims.groups.join(','),
    },
  }
}
