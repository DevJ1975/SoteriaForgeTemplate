import { defineFunction } from '@aws-amplify/backend'

/**
 * Lambda authorizer for the AWS-era Soteria Forge platform.
 *
 * Purpose: sit in front of tenant-scoped access (e.g. an AppSync
 * `AWS_LAMBDA` authorizer, or the custom-authorizer path used by media /
 * playback and offline-sync endpoints) and enforce the TENANT ISOLATION
 * INVARIANT before any resolver runs. It:
 *
 *   1. Verifies the caller's Cognito JWT (signature/issuer/expiry).
 *   2. Extracts `custom:tenantId` and `cognito:groups` from the VERIFIED claims.
 *   3. Compares that claim against the tenant partition the request targets and
 *      REFUSES (deny) on any mismatch — using the same logic as
 *      `assertTenantMatch` from @soteria-forge/shared.
 *
 * The tenantId is NEVER taken from request args/body/headers other than the
 * verified bearer token. See handler.ts.
 */
export const tenantAuthorizer = defineFunction({
  name: 'tenant-authorizer',
  entry: './handler.ts',
  // Long enough for JWKS fetch + verification on cold start; short enough to
  // fail fast. Authorizer results are cached by AppSync per its TTL.
  timeoutSeconds: 15,
  memoryMB: 256,
  runtime: 20,
  environment: {
    // Populated by backend.ts once the user pool exists (see addEnvironment).
    // Kept as empty placeholders so the function type-checks standalone.
    USER_POOL_ID: '',
    USER_POOL_CLIENT_ID: '',
  },
})

/**
 * Pre-token-generation trigger.
 *
 * Runs during token issuance to guarantee that `custom:tenantId` (and the
 * caller's groups) are present as VERIFIED claims on every emitted ID/access
 * token — including tokens minted for federated (SSO) identities, where the
 * tenant arrives via IdP attribute mapping. Every downstream authorizer and
 * AppSync resolver then reads the caller's tenant from these trusted claims and
 * never from request input.
 *
 * Shares the same source tree; a distinct handler entry keeps the two Lambdas'
 * responsibilities separate.
 */
export const preTokenGeneration = defineFunction({
  name: 'pre-token-generation',
  entry: './pre-token-generation.ts',
  timeoutSeconds: 5,
  memoryMB: 128,
  runtime: 20,
})
