/**
 * Pure, AWS-free key -> tenant parsing + tenant-match assertion for the
 * media signed-URL mint.
 *
 * Kept in its own module (no @aws-sdk imports, no Lambda types) so the
 * load-bearing security decision — "does the requested object key belong to the
 * caller's verified tenant?" — is UNIT-TESTABLE without any AWS wiring. The
 * handler (handler.ts) does the JWT/claims plumbing and the actual presign; this
 * file owns the boundary check.
 *
 * -------------------------------------------------------------------------
 * OBJECT-KEY LAYOUT (the enforced object-level tenant boundary)
 * -------------------------------------------------------------------------
 * Every tenant-scoped media object lives under:
 *
 *     media/<kind>/<tenantId>/<...rest>
 *
 * e.g. `media/videos/acme-co/lesson-42/source.mp4`. The THIRD segment is the
 * owning tenantId. `<kind>` is one of the coarse buckets that S3 storage grants
 * capability on (videos / documents / thumbnails / offline-bundles). This mint
 * parses the tenantId out of the key and refuses to sign unless it equals the
 * caller's VERIFIED tenant — that comparison, not any static S3 path rule, is
 * what stops a tenant-A caller from reading `media/videos/<tenantB>/secret.mp4`.
 *
 * TRUST BOUNDARY: `callerTenantId` is ALWAYS the caller's verified Cognito
 * `custom:tenantId` claim (`event.identity.claims` for an AppSync resolver, or a
 * verified ID token). It is NEVER read from the request key/args/body/headers.
 * The key (and therefore `keyTenant`) IS request input — that is exactly why we
 * check it against the claim before signing anything.
 *
 * -------------------------------------------------------------------------
 * TENANT GUARD — byte-for-byte mirror of @soteria-forge/shared tenant.ts
 * -------------------------------------------------------------------------
 * `isSameTenant` / `assertTenantMatch` / `TenantIsolationError` are reproduced
 * verbatim from `packages/shared/src/tenant.ts` (strict equality, empty ⇒ deny,
 * no normalization, no wildcard, no super-admin bypass), inlined so this Lambda
 * bundles with zero workspace-import friction — the same pattern the tenant
 * authorizer uses. If the shared guard changes, THIS mirror changes identically.
 */

/** Canonical media-key prefix. Objects live under `media/<kind>/<tenantId>/...`. */
export const MEDIA_PREFIX = 'media' as const

/** The coarse media buckets S3 grants capability on (see storage/resource.ts). */
export const MEDIA_KINDS = ['videos', 'documents', 'thumbnails', 'offline-bundles'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

/** The operations the mint can sign. */
export type MediaOp = 'get' | 'put'

// ---------------------------------------------------------------------------
// Tenant guard — kept identical to @soteria-forge/shared tenant.ts
// ---------------------------------------------------------------------------

/** Stable machine-readable code, matching the shared `TenantIsolationError.code`. */
const TENANT_ISOLATION_VIOLATION = 'TENANT_ISOLATION_VIOLATION' as const

/** Error thrown on a cross-tenant attempt. Mirror of shared `TenantIsolationError`. */
export class TenantIsolationError extends Error {
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
 * Pure predicate — verbatim equality of the verified claim tenant and the target
 * tenant. Any empty/nullish input returns false so a missing claim can never
 * coerce into a match. No normalization / wildcard / super-admin bypass.
 * (Mirror of shared `isSameTenant`.)
 */
export function isSameTenant(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): boolean {
  if (!claimTenantId || !targetTenantId) return false
  return claimTenantId === targetTenantId
}

/** Assert the claim tenant matches the target tenant. (Mirror of shared `assertTenantMatch`.) */
export function assertTenantMatch(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): void {
  if (!isSameTenant(claimTenantId, targetTenantId)) {
    throw new TenantIsolationError(String(claimTenantId ?? ''), String(targetTenantId ?? ''))
  }
}

// ---------------------------------------------------------------------------
// Key -> tenant parsing
// ---------------------------------------------------------------------------

/**
 * Parse the owning tenantId out of a `media/<kind>/<tenantId>/<...rest>` object
 * key. Returns null for ANYTHING that does not match the exact shape, so an
 * unparseable / malformed / traversal-y key can never be coerced into a tenant:
 *
 *   - must start with the `media/` prefix,
 *   - `<kind>` must be one of MEDIA_KINDS,
 *   - `<tenantId>` must be a non-empty segment,
 *   - there must be at least one more segment after the tenant (an actual object,
 *     not a bare prefix a caller could list),
 *   - no empty segments, no `.`/`..` traversal segments anywhere.
 *
 * A null return MUST be treated by the caller as a refusal (see assertKeyTenant).
 */
export function parseKeyTenant(key: string | null | undefined): string | null {
  if (typeof key !== 'string' || key.length === 0) return null
  // Reject absolute-looking or scheme-y keys outright.
  if (key.startsWith('/') || key.includes('://')) return null

  const segments = key.split('/')
  // media / <kind> / <tenantId> / <at least one more>  => >= 4 segments.
  if (segments.length < 4) return null

  const [prefix, kind, tenantId, ...rest] = segments
  if (prefix !== MEDIA_PREFIX) return null
  if (!isMediaKind(kind)) return null
  if (!tenantId) return null

  // No empty segments and no traversal anywhere (defense against `..`/`.` and
  // `media/videos/tenantA/../tenantB/x` style escapes).
  for (const seg of segments) {
    if (seg.length === 0 || seg === '.' || seg === '..') return null
  }
  // Must address an actual object beyond the tenant prefix.
  if (rest.length === 0) return null

  return tenantId
}

/** Narrow an arbitrary string to a known media kind. */
export function isMediaKind(kind: string | null | undefined): kind is MediaKind {
  return typeof kind === 'string' && (MEDIA_KINDS as readonly string[]).includes(kind)
}

/**
 * The one boundary check: derive the key's owning tenant and assert it equals the
 * caller's VERIFIED tenant. REFUSES (throws {@link TenantIsolationError}) on a
 * cross-tenant key OR an unparseable/malformed key — an unparseable key yields a
 * null target, and `assertTenantMatch(claim, null)` denies (empty ⇒ deny), so a
 * key we cannot prove belongs to the caller is never signed.
 *
 * @param callerTenantId Verified `custom:tenantId` claim. NEVER request input.
 * @param key            Requested object key (request input; checked here).
 * @returns the validated tenantId (== callerTenantId) for logging/telemetry.
 * @throws {TenantIsolationError} on mismatch or unparseable key.
 */
export function assertKeyTenant(
  callerTenantId: string | null | undefined,
  key: string | null | undefined,
): string {
  const keyTenant = parseKeyTenant(key)
  // If the key is unparseable, keyTenant is null → assertTenantMatch denies
  // (empty target ⇒ deny). We do NOT special-case it into a friendlier error:
  // "cannot prove ownership" and "proven cross-tenant" both simply refuse.
  assertTenantMatch(callerTenantId, keyTenant)
  // assertTenantMatch guarantees callerTenantId is non-empty and equals keyTenant.
  return keyTenant as string
}

/** Narrow an arbitrary string to a supported op. */
export function isMediaOp(op: string | null | undefined): op is MediaOp {
  return op === 'get' || op === 'put'
}
