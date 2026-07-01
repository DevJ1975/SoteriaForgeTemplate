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

// ---------------------------------------------------------------------------
// Server-side tenant-ownership STAMP
// ---------------------------------------------------------------------------

/**
 * Prefix for the write-gate group. A row's `adminGroup` is `admin::<tenantId>`,
 * and AppSync `allow.groupDefinedIn('adminGroup')` grants write only to the
 * caller whose `cognito:groups` contains that exact string. Kept as a named
 * constant so the stamp and any authorizer agree on the spelling verbatim.
 */
export const ADMIN_GROUP_PREFIX = 'admin::' as const

/**
 * Reject a tenant id that is empty/whitespace or contains the key delimiter.
 *
 * Mirrors `keys.ts` `assertSegment`: an empty id or a raw `#` inside an id could
 * forge a cross-entity key or a malformed group string, so we fail loud instead
 * of silently corrupting the partition or the write-gate group. Whitespace-only
 * ids are rejected too — they are never a legitimate verified claim.
 *
 * @throws {TenantIsolationError} on any invalid id (claim==target so the error
 *   reads as a self-referential violation; the id can never be trusted).
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
 *
 * This is the value stamped into a row's `adminGroup` field and the group the
 * caller must hold to satisfy `allow.groupDefinedIn('adminGroup')`. The id is
 * validated first (non-empty, no `#`) so a malformed id can never produce a
 * malformed or cross-tenant group string.
 *
 * @param tenantId The tenant id — from a VERIFIED token claim, never request input.
 * @throws {TenantIsolationError} when `tenantId` is empty/whitespace or contains `#`.
 */
export function tenantAdminGroup(tenantId: string): string {
  assertTenantId(tenantId)
  return `${ADMIN_GROUP_PREFIX}${tenantId}`
}

/** The tenant-ownership fields the backend stamps onto every admin-authored row. */
export type TenantOwnershipStamp = {
  /** Partition owner — `TENANT#<tenantId>` is the PK; this is the raw id. */
  tenantId: string
  /** Write-gate group — `admin::<tenantId>`. */
  adminGroup: string
}

/**
 * Derive the tenant-ownership stamp (`tenantId` + `adminGroup`) from the SINGLE
 * verified tenant claim, so the two fields can NEVER diverge.
 *
 * The backend calls this in a resolver / Lambda to set a new row's `tenantId`
 * and `adminGroup` SERVER-SIDE from the caller's identity — the read gate
 * (`groupDefinedIn('tenantId')`) and the write gate (`groupDefinedIn('adminGroup')`)
 * are then both pinned to the same tenant by construction.
 *
 * TRUST BOUNDARY: `claimTenantId` is ALWAYS the verified `custom:tenantId` claim
 * (`event.identity.claims` for an AppSync resolver, or the verified ID token in a
 * Lambda). It MUST NEVER be read from GraphQL args, HTTP body, query string, or an
 * unverified header. Stamping from request input would let a caller author rows in
 * another tenant — the exact isolation break this stamp exists to prevent.
 *
 * @param claimTenantId The verified `custom:tenantId` claim. Never request input.
 * @returns `{ tenantId, adminGroup }`, both derived from the one claim.
 * @throws {TenantIsolationError} when the claim is empty/whitespace or contains `#`.
 */
export function stampTenantOwnership(claimTenantId: string): TenantOwnershipStamp {
  assertTenantId(claimTenantId)
  return {
    tenantId: claimTenantId,
    adminGroup: tenantAdminGroup(claimTenantId),
  }
}
