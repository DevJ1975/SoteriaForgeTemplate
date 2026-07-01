import { defineAuth } from '@aws-amplify/backend'
import { preTokenGeneration } from '../functions/tenant-authorizer/resource.js'

/**
 * Cognito authentication for the AWS-era Soteria Forge platform.
 *
 * SINGLE USER POOL, LITE TIER
 * ---------------------------
 * The entire platform authenticates against ONE Cognito user pool. Multi-tenancy
 * is NOT expressed as one-pool-per-tenant; instead every user carries an
 * immutable `custom:tenantId` attribute, and the tenant-isolation invariant is
 * enforced downstream (data-layer auth rules + the Lambda authorizer) by
 * comparing that verified claim against the tenant partition being touched.
 *
 * Lite tier is the intended plan (no advanced-security add-ons, no per-tenant
 * pool sprawl). Amplify's `defineAuth` does not take a literal "tier" flag — the
 * tier is a console/pricing selection on the produced pool — so it is recorded
 * here as the operational contract and left free of advanced-security features
 * that would push the pool to Plus/Essentials.
 *
 * ENTERPRISE SSO (DEFERRED — not built in Phase 0)
 * ------------------------------------------------
 * Enterprise customers will federate via a PER-TENANT SAML or OIDC IdP wired
 * into THIS SAME pool (never a second pool). At federation time the tenant's IdP
 * maps its assertion's tenant claim onto `custom:tenantId`, so a federated user
 * is subject to the identical tenant-isolation guard as a native user. The
 * `externalProviders` block is intentionally omitted now; when enabled it is
 * added per tenant with attribute mapping onto `custom:tenantId`.
 */
export const auth = defineAuth({
  // Email is the login identifier for native (non-federated) users.
  loginWith: {
    email: true,
    // externalProviders: { ... }  // DEFERRED: per-tenant SAML/OIDC federated into this one pool.
  },

  userAttributes: {
    // `custom:tenantId` is the linchpin of tenant isolation. It is IMMUTABLE:
    // a user can never be moved to another tenant by editing their own profile,
    // and the value only ever originates from an admin/provisioning flow or an
    // SSO attribute mapping — never from self-service. Downstream, this claim is
    // the ONLY trusted source of the caller's tenant.
    'custom:tenantId': {
      dataType: 'String',
      mutable: false,
      minLen: 1,
      maxLen: 128,
    },
    // Optional denormalized display fields (mutable, non-security).
    'custom:jobTitle': {
      dataType: 'String',
      mutable: true,
      maxLen: 256,
    },
  },

  // Cognito groups = the authorization tier carried in the `cognito:groups`
  // claim. Ordered least → most privileged. These MUST match
  // @soteria-forge/shared `COGNITO_GROUPS` exactly (worker/supervisor/
  // tenant-admin/super-admin). `super-admin` is Soteria Forge staff with
  // cross-tenant operational reach — but even super-admin access is still
  // scoped per-request to a chosen tenant partition; group rank never bypasses
  // the tenant-match guard.
  groups: ['worker', 'supervisor', 'tenant-admin', 'super-admin'],

  // Trigger hook: a pre-token-generation Lambda stamps/echoes `custom:tenantId`
  // and the caller's groups into the emitted tokens so every downstream
  // authorizer/resolver can read a VERIFIED tenant claim. (A pre-signup trigger
  // could alternatively pin the tenant at account creation; pre-token-generation
  // is used here so the claim is guaranteed present on every issued token,
  // including for federated identities.)
  triggers: {
    preTokenGeneration,
  },

  // Least-privilege account recovery. No SMS (Lite tier, no phone attribute).
  accountRecovery: 'EMAIL_ONLY',
})
