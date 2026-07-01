import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource.js'
import { data } from './data/resource.js'
import { storage } from './storage/resource.js'
import { tenantAuthorizer, preTokenGeneration } from './functions/tenant-authorizer/resource.js'
import { tenantStamp } from './functions/tenant-stamp/resource.js'
import { mediaUrl } from './functions/media-url/resource.js'

/**
 * Amplify Gen 2 backend composition for the AWS-era Soteria Forge platform.
 *
 * Phase 0 / DEFINED-AS-CODE ONLY: this file wires the backend constructs; it is
 * NOT deployed here. `defineBackend` returns the composed CDK app whose
 * correctness is the deliverable.
 *
 * Wiring:
 *   auth              — single Cognito user pool (Lite tier), custom:tenantId,
 *                       groups worker/supervisor/tenant-admin/super-admin,
 *                       pre-token-generation trigger.
 *   data              — code-first AppSync schema (8 models), userPool default
 *                       auth mode, tenant-isolation Lambda authorizer as a
 *                       secondary authorization mode.
 *   storage           — tenant-scoped S3 bucket.
 *   tenantAuthorizer  — the Lambda authorizer that enforces the tenant match.
 *   preTokenGeneration— trigger that stamps the verified custom:tenantId claim.
 *   tenantStamp       — create*Stamped resolver: stamps tenantId + adminGroup
 *                       from the verified claim server-side (residual 1).
 *   mediaUrl          — getMediaUrl resolver: tenant-checked S3 signed-URL mint,
 *                       the enforced object-level boundary (residual 2).
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  tenantAuthorizer,
  preTokenGeneration,
  tenantStamp,
  mediaUrl,
})

// ---------------------------------------------------------------------------
// Feed the user pool identifiers into the authorizer so it can VERIFY tokens.
// The authorizer must validate signatures against THIS pool; without the pool
// id + client id it cannot verify, and (by design) then denies everything.
// ---------------------------------------------------------------------------
const { userPool, userPoolClient } = backend.auth.resources

backend.tenantAuthorizer.addEnvironment('USER_POOL_ID', userPool.userPoolId)
backend.tenantAuthorizer.addEnvironment('USER_POOL_CLIENT_ID', userPoolClient.userPoolClientId)

// ---------------------------------------------------------------------------
// Media signed-URL MINT (getMediaUrl) — object-level tenant boundary.
//
// The mint needs (a) the S3 bucket it signs against, (b) permission to presign
// GET/PUT on that bucket, and (c) the pool ids for its defense-in-depth ID-token
// verify fallback. The tenant CHECK itself is in the handler (key vs. verified
// claim); this wiring only gives it the bucket + verify inputs. It is granted S3
// read+write so it can presign either op — the per-object tenant match is what
// scopes WHICH objects it will ever sign.
// ---------------------------------------------------------------------------
const mediaBucket = backend.storage.resources.bucket
backend.mediaUrl.addEnvironment('MEDIA_BUCKET_NAME', mediaBucket.bucketName)
backend.mediaUrl.addEnvironment('MEDIA_BUCKET_REGION', mediaBucket.stack.region)
backend.mediaUrl.addEnvironment('USER_POOL_ID', userPool.userPoolId)
backend.mediaUrl.addEnvironment('USER_POOL_CLIENT_ID', userPoolClient.userPoolClientId)
// Presign requires the function's execution role to hold s3:GetObject/PutObject
// on the media objects. Scope to the `media/*` prefix (the mint never touches
// `private/*`); the handler's tenant check further restricts to the caller's own
// tenant sub-prefix at request time.
mediaBucket.grantReadWrite(backend.mediaUrl.resources.lambda, 'media/*')

export default backend
