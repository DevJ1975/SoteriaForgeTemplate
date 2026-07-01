/**
 * Pre-token-generation trigger.
 *
 * Cognito invokes this while minting a user's ID/access tokens. It has TWO jobs,
 * both of which make the caller's VERIFIED tenant available to downstream
 * authorization WITHOUT ever trusting request input:
 *
 *   1. Echo the immutable `custom:tenantId` into the token claims (so the app /
 *      ID token and any custom-op authorizer can read a trusted tenant).
 *
 *   2. Inject the tenant into the caller's Cognito GROUPS so that AppSync
 *      dynamic-group authorization (`allow.groupDefinedIn('tenantId')`) can do
 *      TRUE ROW-LEVEL tenant isolation. AppSync compares a record's `tenantId`
 *      field against the caller's `cognito:groups`; because we add the caller's
 *      tenantId (and, for a tenant-admin, a tenant-scoped admin group value)
 *      into `cognito:groups`, a caller can ONLY ever match rows whose tenantId
 *      is their own. This is what closes cross-tenant reads/writes at the data
 *      layer — the model auth rules, not a Lambda authorizer, are the gate.
 *
 * WHY GROUPS (and not just the custom claim):
 *   `allow.groupDefinedIn(field)` resolves the caller's groups from the
 *   `cognito:groups` claim. Crucially, `cognito:groups` is present in BOTH the ID
 *   token AND the access token, so the group-based row gate works regardless of
 *   which token AppSync receives — this resolves the historical token-source
 *   ambiguity (custom attributes are only reliably present on the ID token; the
 *   injected tenant group is present on both). A custom claim alone cannot drive
 *   `groupDefinedIn`, which is why the tenant is injected as a group value here.
 *
 * TRUST NOTE:
 *   The tenant value originates from Cognito's stored user attributes
 *   (`request.userAttributes['custom:tenantId']`) or, for federated users, from
 *   the IdP attribute mapping that populated that attribute at link time. It is
 *   NOT taken from anything the client sends in the sign-in request. Because
 *   `custom:tenantId` is configured IMMUTABLE (see auth/resource.ts), a user can
 *   never self-mutate their tenant, so echoing it into claims/groups is safe.
 *
 * FAIL CLOSED:
 *   If the stored `custom:tenantId` attribute is missing we inject NOTHING extra
 *   — no tenant claim, no tenant group, no admin group. A caller with no tenant
 *   group cannot match any `groupDefinedIn('tenantId')` rule, so the data layer
 *   denies them (no trusted tenant → no access) rather than fabricating one.
 */

import type {
  PreTokenGenerationTriggerEvent,
  PreTokenGenerationTriggerHandler,
} from 'aws-lambda'

/**
 * The tenant-scoped admin group value written into `cognito:groups` for a
 * tenant-admin. Keep this format in lockstep with the `adminGroup` field the
 * create resolver/client stamps on admin-authored models in data/resource.ts:
 *   adminGroup === `admin::` + tenantId
 * A caller can only create/update/delete a row whose `adminGroup` value is a
 * group they hold, i.e. their OWN tenant's admin group — never another tenant's.
 */
function tenantAdminGroup(tenantId: string): string {
  return `admin::${tenantId}`
}

/** The base role groups that mark a caller as a tenant administrator. */
const TENANT_ADMIN_ROLE_GROUPS = new Set(['tenant-admin'])

export const handler: PreTokenGenerationTriggerHandler = async (
  event: PreTokenGenerationTriggerEvent,
) => {
  const tenantId = event.request.userAttributes['custom:tenantId']

  // FAIL CLOSED: no stored tenant → inject nothing. Leave groups/claims as-is so
  // the caller matches no tenant row and the data layer denies.
  if (!tenantId) {
    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {},
        // Do NOT override groups: never suppress the caller's role groups.
      },
    }
    return event
  }

  // The caller's EXISTING groups (role groups: worker/supervisor/tenant-admin/
  // super-admin, plus anything Cognito already resolved). We MERGE into this set
  // so role membership survives and we only ADD the tenant-scoped values.
  const existingGroups = event.request.groupConfiguration?.groupsToOverride ?? []

  // Is this caller a tenant administrator? Derive from the existing ROLE groups
  // (never from the injected values). tenant-admins get a tenant-scoped admin
  // group so they can author their own tenant's rows via
  // `allow.groupDefinedIn('adminGroup')`.
  const isTenantAdmin = existingGroups.some((g) => TENANT_ADMIN_ROLE_GROUPS.has(g))

  // Build the merged group set:
  //   existing role groups
  //   + the tenantId itself           → matches `allow.groupDefinedIn('tenantId')`
  //   + `admin::<tenantId>` (admins)  → matches `allow.groupDefinedIn('adminGroup')`
  const merged = new Set<string>(existingGroups)
  merged.add(tenantId)
  if (isTenantAdmin) {
    merged.add(tenantAdminGroup(tenantId))
  }

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        // Surface the immutable, stored tenant as a first-class claim so custom
        // operations / the app / the ID token read it directly. This is a
        // passthrough of a trusted stored attribute, not a client value.
        'custom:tenantId': tenantId,
      },
      // Inject the tenant (and tenant-scoped admin group) into cognito:groups so
      // AppSync `groupDefinedIn` performs ROW-LEVEL tenant isolation. Present in
      // both ID and access tokens, so the row gate is token-source agnostic.
      groupOverrideDetails: {
        groupsToOverride: Array.from(merged),
      },
    },
  }

  return event
}
