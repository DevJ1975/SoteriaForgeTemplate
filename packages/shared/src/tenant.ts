/**
 * Tenant-isolation guard — a small, pure equality check for a caller's verified
 * tenant against the tenant of the data being touched.
 *
 * PRIMARY ENFORCEMENT IS POSTGRES RLS (see ADR-0007): every table is row-level
 * scoped to `public.current_tenant_id()` (derived from the session JWT), and
 * inserts are tenant-stamped by a BEFORE INSERT trigger — so the database, not
 * app code, is what actually prevents cross-tenant access. This guard is retained
 * as a defensive, RLS-independent utility for any code path that has both a
 * verified claim and a loaded record and wants to fail loud on a mismatch.
 *
 * TENANT ISOLATION INVARIANT (the #1 security rule of this system):
 *   No caller may ever read or write another tenant's data.
 *
 * TRUST BOUNDARY:
 *   `claimTenantId` must originate from the VERIFIED session (the caller's
 *   `profiles.tenant_id`, read under their JWT). It must NEVER be taken from
 *   request input (args, HTTP body, query string, unverified headers). A tenantId
 *   sourced from request input is attacker-controlled and defeats isolation.
 *
 *   `targetTenantId` is the tenant of the record the operation touches — derived
 *   from the loaded row, never from request input. It is fine for this to come
 *   from data; the guard exists precisely to prove it matches the claim.
 */

/** Error thrown when a caller attempts to touch a tenant that is not their own. */
export class TenantIsolationError extends Error {
  readonly code = 'TENANT_ISOLATION_VIOLATION' as const
  readonly claimTenantId: string
  readonly targetTenantId: string

  constructor(claimTenantId: string, targetTenantId: string) {
    super('Cross-tenant access denied')
    this.name = 'TenantIsolationError'
    this.claimTenantId = claimTenantId
    this.targetTenantId = targetTenantId
    // Restore prototype chain for correct `instanceof` under compiled ES targets.
    Object.setPrototypeOf(this, TenantIsolationError.prototype)
  }
}

/**
 * Pure predicate: does the verified claim tenant match the target tenant?
 *
 * Returns `false` for any empty/nullish input so a missing claim can never be
 * coerced into a match. This is a strict equality check — tenant ids are opaque
 * and compared verbatim; there is no normalization, wildcard, or "super-admin
 * bypass" here. Elevated access is expressed by choosing which partitions the
 * caller queries, not by weakening this guard.
 */
export function isSameTenant(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): boolean {
  if (!claimTenantId || !targetTenantId) return false
  return claimTenantId === targetTenantId
}

/**
 * Assert that the verified claim tenant matches the target tenant, throwing
 * {@link TenantIsolationError} on mismatch. Call this at the top of every
 * resolver / handler that has resolved a `targetTenantId`, BEFORE performing the
 * read or write.
 *
 * @param claimTenantId  Verified `custom:tenantId` from the caller's token. Never request input.
 * @param targetTenantId Tenant that owns the partition/item being accessed.
 * @throws {TenantIsolationError} when the two do not match (or either is empty).
 */
export function assertTenantMatch(
  claimTenantId: string | null | undefined,
  targetTenantId: string | null | undefined,
): void {
  if (!isSameTenant(claimTenantId, targetTenantId)) {
    throw new TenantIsolationError(String(claimTenantId ?? ''), String(targetTenantId ?? ''))
  }
}
