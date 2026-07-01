import { defineFunction } from '@aws-amplify/backend'

/**
 * Tenant-checked S3 signed-URL MINT (the enforced object-level tenant boundary).
 *
 * Backs the AppSync custom query `getMediaUrl(key, op)` (userPool auth) as a
 * Lambda data source. AppSync passes the caller's VERIFIED Cognito claims in
 * `event.identity.claims`; the handler reads `custom:tenantId` from there (never
 * from request args), parses the requested `media/<kind>/<tenantId>/...` key, and
 * REFUSES to sign unless the key's tenant equals the caller's verified tenant.
 * See handler.ts + key-tenant.ts.
 *
 * Environment (populated by backend.ts once the bucket/pool exist; empty
 * placeholders keep the function type-checking standalone while UNDEPLOYED):
 *   MEDIA_BUCKET_NAME    — the S3 bucket that holds `media/*` objects.
 *   MEDIA_BUCKET_REGION  — its region (falls back to AWS_REGION at runtime).
 *   USER_POOL_ID/_CLIENT — for the defense-in-depth ID-token verify fallback.
 */
export const mediaUrl = defineFunction({
  name: 'media-url',
  entry: './handler.ts',
  // Long enough for a cold-start presign (+ optional JWKS fetch on the fallback
  // path); short enough to fail fast.
  timeoutSeconds: 15,
  memoryMB: 256,
  runtime: 20,
  environment: {
    MEDIA_BUCKET_NAME: '',
    MEDIA_BUCKET_REGION: '',
    USER_POOL_ID: '',
    USER_POOL_CLIENT_ID: '',
  },
})
