/**
 * Tenant-isolation guard — the single reusable check that every AppSync resolver
 * and the Lambda authorizer calls before reading or writing a tenant partition.
 *
 * TENANT ISOLATION INVARIANT (the #1 security rule of this system):
 *   Every data access is scoped by TENANT#<tenantId>. The caller's verified
 *   Cognito `custom:tenantId` claim MUST equal the tenant partition being
 *   accessed, or the access is refused. There is no cross-tenant read or write.
 *
 * TRUST BOUNDARY:
 *   `claimTenantId` must originate from a VERIFIED token — the Cognito ID/access
 *   token's `custom:tenantId` claim, validated by the authorizer. It must NEVER
 *   be taken from request input (GraphQL args, HTTP body, query string, headers
 *   other than the verified Authorization bearer). A tenantId sourced from
 *   request input is attacker-controlled and defeats isolation entirely.
 *
 *   `targetTenantId` is the tenant of the item/partition the operation touches —
 *   derived from the key being accessed (see keys.ts `parseTenantPk`) or the
 *   record already loaded from the table. It is fine for this to come from data;
 *   the guard exists precisely to prove it matches the claim.
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
