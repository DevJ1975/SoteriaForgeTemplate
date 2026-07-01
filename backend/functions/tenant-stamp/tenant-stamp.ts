/**
 * Pure, AWS-free tenant-ownership STAMP logic for admin-authored + roster models.
 *
 * Kept in its own module (no Lambda types, no @aws-sdk imports) so the
 * load-bearing decision — "derive tenantId + adminGroup from the ONE verified
 * claim so they can never be client-supplied or diverge" — is UNIT-TESTABLE
 * without any AWS wiring. The handler (handler.ts) does the claims plumbing and
 * calls into here.
 *
 * -------------------------------------------------------------------------
 * BYTE-FOR-BYTE MIRROR of @soteria-forge/shared tenant.ts
 * -------------------------------------------------------------------------
 * `stampTenantOwnership` / `tenantAdminGroup` / `assertTenantId` / the
 * `ADMIN_GROUP_PREFIX` constant / `TenantIsolationError` are reproduced verbatim
 * from `packages/shared/src/tenant.ts`, inlined so this Lambda bundles with zero
 * workspace-import friction — the same pattern the tenant authorizer uses. If the
 * shared source changes, THIS mirror changes identically.
 *
 * WHY A STAMP EXISTS (the residual it closes):
 *   The AppSync write gate (`allow.groupDefinedIn('adminGroup')`) already stops a
 *   caller from writing a row whose `adminGroup` is a group they do not hold. But
 *   it does not, on its own, force `tenantId` and `adminGroup` to be CONSISTENT
 *   with each other or with the caller's verified tenant — a client sets those
 *   fields. This stamp OVERWRITES both from the single verified `custom:tenantId`
 *   claim at create time, so:
 *     - `tenantId`   (drives the read gate `groupDefinedIn('tenantId')`), and
 *     - `adminGroup` (drives the write gate `groupDefinedIn('adminGroup')`)
 *   are both pinned to the caller's own tenant BY CONSTRUCTION and can never
 *   diverge or be forged from request input.
 */

/**
 * Prefix for the write-gate group. A row's `adminGroup` is `admin::<tenantId>`.
 * (Mirror of shared `ADMIN_GROUP_PREFIX`.)
 */
export const ADMIN_GROUP_PREFIX = 'admin::' as const

/** Stable machine-readable code, matching the shared `TenantIsolationError.code`. */
const TENANT_ISOLATION_VIOLATION = 'TENANT_ISOLATION_VIOLATION' as const

/** Error thrown on an invalid/absent tenant claim. Mirror of shared `TenantIsolationError`. */
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
 * Reject a tenant id that is empty/whitespace or contains the key delimiter.
 * (Mirror of shared `assertTenantId`.)
 */
function assertTenantId(tenantId: string): void {
  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new TenantIsolationError(String(tenantId ?? ''), String(tenantId ?? ''))
  }
  if (tenantId.includes('#')) {
    throw new TenantIsolationError(tenantId, tenantId)
  }
}

/**
 * Build the write-gate group for a tenant: `admin::<tenantId>`.
 * (Mirror of shared `tenantAdminGroup`.)
 */
export function tenantAdminGroup(tenantId: string): string {
  assertTenantId(tenantId)
  return `${ADMIN_GROUP_PREFIX}${tenantId}`
}

/** The tenant-ownership fields stamped onto every admin-authored row. (Mirror.) */
export type TenantOwnershipStamp = {
  tenantId: string
  adminGroup: string
}

/**
 * Derive `{ tenantId, adminGroup }` from the SINGLE verified tenant claim so the
 * two fields can NEVER diverge. (Mirror of shared `stampTenantOwnership`.)
 *
 * TRUST BOUNDARY: `claimTenantId` is ALWAYS the verified `custom:tenantId` claim
 * (`event.identity.claims` for an AppSync resolver). NEVER request input.
 *
 * @throws {TenantIsolationError} when the claim is empty/whitespace or contains `#`.
 */
export function stampTenantOwnership(claimTenantId: string): TenantOwnershipStamp {
  assertTenantId(claimTenantId)
  return {
    tenantId: claimTenantId,
    adminGroup: tenantAdminGroup(claimTenantId),
  }
}

/**
 * Apply the tenant-ownership stamp to a create INPUT object, returning a new
 * object whose `tenantId` and `adminGroup` are OVERWRITTEN from the verified
 * claim — regardless of what (if anything) the client supplied for them.
 *
 * Any client-supplied `tenantId` / `adminGroup` are intentionally discarded: the
 * stamp is the sole source of those two fields. All other input fields pass
 * through untouched.
 *
 * @param claimTenantId Verified `custom:tenantId`. NEVER request input.
 * @param input         The client-supplied create input (its tenant fields are ignored).
 * @throws {TenantIsolationError} when the claim is empty/whitespace or contains `#`.
 */
export function applyTenantStamp<T extends Record<string, unknown>>(
  claimTenantId: string,
  input: T,
): T & TenantOwnershipStamp {
  const stamp = stampTenantOwnership(claimTenantId)
  return { ...input, ...stamp }
}
