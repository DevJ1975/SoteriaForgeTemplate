import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource.js'
import { data } from './data/resource.js'
import { storage } from './storage/resource.js'
import { tenantAuthorizer, preTokenGeneration } from './functions/tenant-authorizer/resource.js'

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
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  tenantAuthorizer,
  preTokenGeneration,
})

// ---------------------------------------------------------------------------
// Feed the user pool identifiers into the authorizer so it can VERIFY tokens.
// The authorizer must validate signatures against THIS pool; without the pool
// id + client id it cannot verify, and (by design) then denies everything.
// ---------------------------------------------------------------------------
const { userPool, userPoolClient } = backend.auth.resources

backend.tenantAuthorizer.addEnvironment('USER_POOL_ID', userPool.userPoolId)
backend.tenantAuthorizer.addEnvironment('USER_POOL_CLIENT_ID', userPoolClient.userPoolClientId)

export default backend
