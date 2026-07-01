/**
 * Role model for the AWS-era platform.
 *
 * Authentication is a SINGLE Cognito user pool (Lite tier). Authorization groups
 * are Cognito groups carried in the token's `cognito:groups` claim:
 *
 *   worker        — a learner. Consumes assigned courses, syncs completions.
 *   supervisor    — a crew/site lead. Reads their team's progress, assigns courses.
 *   tenant-admin  — administers one tenant: users, catalog, reporting.
 *   super-admin    — Soteria Forge staff. Cross-tenant operational access.
 *
 * The legacy console (apps/console) and existing DTOs speak the older
 * `UserRole` vocabulary (learner/manager/admin/superadmin). Both vocabularies
 * coexist: Cognito groups are the source of truth at the edge (authorizer),
 * while `UserRole` remains the shape stored on `UserDTO.roles` and understood by
 * `hasRequiredRole`. The mappings below are the documented, canonical bridge.
 */

import type { UserRole } from './domain.js'

/** Canonical Cognito group names, ordered least → most privileged. */
export type CognitoGroup = 'worker' | 'supervisor' | 'tenant-admin' | 'super-admin'

export const COGNITO_GROUPS: readonly CognitoGroup[] = [
  'worker',
  'supervisor',
  'tenant-admin',
  'super-admin',
] as const

/**
 * Privilege rank. Higher number = more privilege. Used for "at least this group"
 * comparisons in the authorizer. NOT a substitute for the tenant-isolation guard:
 * even super-admin access is scoped per request to a chosen tenant partition.
 */
export const GROUP_RANK: Record<CognitoGroup, number> = {
  worker: 0,
  supervisor: 1,
  'tenant-admin': 2,
  'super-admin': 3,
}

/**
 * Canonical mapping Cognito group → legacy UserRole.
 *   worker       → learner
 *   supervisor   → manager
 *   tenant-admin → admin
 *   super-admin  → superadmin
 */
export const GROUP_TO_USER_ROLE: Record<CognitoGroup, UserRole> = {
  worker: 'learner',
  supervisor: 'manager',
  'tenant-admin': 'admin',
  'super-admin': 'superadmin',
}

/** Inverse mapping legacy UserRole → Cognito group. */
export const USER_ROLE_TO_GROUP: Record<UserRole, CognitoGroup> = {
  learner: 'worker',
  manager: 'supervisor',
  admin: 'tenant-admin',
  superadmin: 'super-admin',
}

/** Type guard for a raw string against the Cognito group set. */
export function isCognitoGroup(value: string): value is CognitoGroup {
  return (COGNITO_GROUPS as readonly string[]).includes(value)
}

/** Map a Cognito group to its legacy UserRole. */
export function groupToUserRole(group: CognitoGroup): UserRole {
  return GROUP_TO_USER_ROLE[group]
}

/** Map a legacy UserRole to its Cognito group. */
export function userRoleToGroup(role: UserRole): CognitoGroup {
  return USER_ROLE_TO_GROUP[role]
}

/**
 * Normalize a raw `cognito:groups` claim (unknown shape from the token) into a
 * clean, de-duplicated list of known groups. Unknown group strings are dropped
 * rather than trusted.
 */
export function normalizeGroups(value: unknown): CognitoGroup[] {
  if (!Array.isArray(value)) return []
  const groups = value.map(String).filter(isCognitoGroup)
  return Array.from(new Set(groups))
}

/**
 * Does the caller hold at least one of the required Cognito groups?
 *
 * `super-admin` satisfies any requirement (it outranks everything). This is a
 * pure authorization-tier check; it says nothing about WHICH tenant the caller
 * may touch — that is enforced separately by `assertTenantMatch` (tenant.ts).
 */
export function hasRequiredGroup(
  callerGroups: readonly CognitoGroup[],
  requiredGroups: readonly CognitoGroup[],
): boolean {
  if (callerGroups.includes('super-admin')) return true
  if (requiredGroups.length === 0) return true
  return requiredGroups.some((required) => callerGroups.includes(required))
}

/**
 * Does the caller's highest group rank meet or exceed the given minimum group?
 * Convenience for "supervisor or above" style checks.
 */
export function hasMinimumGroup(
  callerGroups: readonly CognitoGroup[],
  minimumGroup: CognitoGroup,
): boolean {
  const callerRank = callerGroups.reduce((max, group) => Math.max(max, GROUP_RANK[group]), -1)
  return callerRank >= GROUP_RANK[minimumGroup]
}
