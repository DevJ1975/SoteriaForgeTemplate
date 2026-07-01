/**
 * Tenant-checked S3 signed-URL MINT — the ENFORCED object-level tenant boundary.
 *
 * WHAT THIS IS:
 *   The load-bearing control that stops one tenant from reaching another
 *   tenant's media bytes. Static S3 path rules CANNOT express per-tenant object
 *   isolation (there is no `{tenantId}` placeholder bound to `custom:tenantId`;
 *   `{entity_id}` is the per-USER identity — see storage/resource.ts). So instead
 *   of handing clients broad S3 access, this Lambda mints a short-lived
 *   pre-signed GET/PUT URL for a SINGLE object, and ONLY after proving the object
 *   key belongs to the caller's verified tenant.
 *
 * WHERE IT RUNS:
 *   Wired as the Lambda data source behind the AppSync custom query
 *   `getMediaUrl(key, op)` (userPool auth) — see data/resource.ts. AppSync passes
 *   the caller's verified Cognito claims in `event.identity.claims`; the object
 *   key + op arrive in `event.arguments`.
 *
 * TENANT ISOLATION (the #1 rule) — enforced here object-by-object:
 *   1. Caller tenant is read ONLY from the VERIFIED `custom:tenantId` claim
 *      (`event.identity.claims`), never from the request key/args/body/headers.
 *   2. The requested key is parsed as `media/<kind>/<tenantId>/...`; the key's
 *      tenant segment is compared against the caller's claim via
 *      `assertKeyTenant` (mirror of shared `assertTenantMatch`).
 *   3. On mismatch OR an unparseable/malformed key, we REFUSE — no URL is signed.
 *
 * DEFENSE IN DEPTH:
 *   When invoked outside AppSync (or when the caller forwards an ID token
 *   directly), the handler falls back to VERIFYING the ID token and reading
 *   `custom:tenantId` from the verified payload — the same trust rule, another
 *   trusted source. It NEVER falls back to a request-supplied tenant.
 */

import type { AppSyncResolverEvent, Context } from 'aws-lambda'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  assertKeyTenant,
  isMediaOp,
  TenantIsolationError,
  type MediaOp,
} from './key-tenant.js'

// ---------------------------------------------------------------------------
// Config (populated by backend.ts via addEnvironment; empty placeholders keep
// the function type-checking standalone in the UNDEPLOYED, defined-as-code repo)
// ---------------------------------------------------------------------------

const MEDIA_BUCKET_NAME = process.env.MEDIA_BUCKET_NAME ?? ''
const AWS_REGION = process.env.AWS_REGION ?? process.env.MEDIA_BUCKET_REGION ?? 'us-east-1'
const USER_POOL_ID = process.env.USER_POOL_ID ?? ''
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID ?? ''

/** Presigned-URL lifetime. Short: a leaked URL should expire quickly. */
const URL_TTL_SECONDS = 300

/** Created once per container so the SDK/credentials/JWKS are reused across calls. */
const s3 = new S3Client({ region: AWS_REGION })

/**
 * ID-token verifier for the defense-in-depth fallback path. We verify the ID
 * token (NOT the access token) because Cognito access tokens do not carry
 * `custom:tenantId` by default — the same reasoning as the tenant authorizer.
 */
const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: USER_POOL_CLIENT_ID,
})

// ---------------------------------------------------------------------------
// Arguments + result shapes (match the custom query in data/resource.ts)
// ---------------------------------------------------------------------------

export type GetMediaUrlArgs = {
  /** Object key: `media/<kind>/<tenantId>/...`. Request input — checked, never trusted. */
  key: string
  /** 'get' (download/playback) or 'put' (author upload). */
  op: string
  /**
   * OPTIONAL bearer for the non-AppSync / direct-invoke path. When present it is
   * a Cognito ID token that we VERIFY; the tenant is read from the verified
   * payload. Ignored when AppSync already supplied verified identity claims.
   */
  idToken?: string | null
}

export type GetMediaUrlResult = {
  url: string
  key: string
  op: MediaOp
  expiresInSeconds: number
}

// ---------------------------------------------------------------------------
// Caller-tenant resolution — VERIFIED sources ONLY
// ---------------------------------------------------------------------------

/**
 * Read the caller's tenant from AppSync's VERIFIED identity claims. AppSync has
 * already validated the Cognito token before invoking the resolver, so
 * `identity.claims['custom:tenantId']` is trusted. Returns '' when absent so the
 * caller can fall back to (or ultimately deny on) another verified source.
 */
function tenantFromIdentity(event: AppSyncResolverEvent<GetMediaUrlArgs>): string {
  const identity = event.identity as { claims?: Record<string, unknown> } | null | undefined
  const claims = identity?.claims
  const claimed = claims?.['custom:tenantId']
  return typeof claimed === 'string' ? claimed : ''
}

/**
 * Defense-in-depth fallback: VERIFY a forwarded ID token and read
 * `custom:tenantId` from the verified payload. Returns '' on any missing/invalid
 * token — a token that does not verify yields NO trusted tenant.
 */
async function tenantFromIdToken(idToken: string | null | undefined): Promise<string> {
  const raw = idToken?.replace(/^Bearer\s+/i, '').trim()
  if (!raw) return ''
  try {
    const payload = await idTokenVerifier.verify(raw)
    const claimed = payload['custom:tenantId']
    return typeof claimed === 'string' ? claimed : ''
  } catch {
    return ''
  }
}

/**
 * The single trusted-tenant resolver: prefer AppSync's verified identity claims;
 * otherwise verify a forwarded ID token. NEVER consults request args/key/headers
 * for the tenant. Returns '' when no verified tenant is available (⇒ deny).
 */
async function resolveCallerTenant(
  event: AppSyncResolverEvent<GetMediaUrlArgs>,
): Promise<string> {
  const fromIdentity = tenantFromIdentity(event)
  if (fromIdentity) return fromIdentity
  return tenantFromIdToken(event.arguments?.idToken)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Thrown for a bad request (unknown op, missing key) — distinct from isolation. */
class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}

/**
 * Mint a tenant-checked presigned URL, or refuse.
 *
 * Refuses (throws) when: no verified caller tenant, unknown op, missing key, or
 * the key's tenant segment does not match the caller's verified tenant. On a
 * refusal NO URL is produced. Callers/AppSync surface the error as an
 * authorization failure; we never leak whether the key exists or which tenant
 * owns it.
 */
export const handler = async (
  event: AppSyncResolverEvent<GetMediaUrlArgs>,
  _context: Context,
): Promise<GetMediaUrlResult> => {
  const args = event.arguments ?? ({} as GetMediaUrlArgs)
  const { key, op } = args

  if (typeof key !== 'string' || key.length === 0) {
    throw new BadRequestError('A media object key is required')
  }
  if (!isMediaOp(op)) {
    throw new BadRequestError("op must be 'get' or 'put'")
  }

  // (1) VERIFIED caller tenant — the only trusted source. Empty ⇒ deny.
  const callerTenant = await resolveCallerTenant(event)

  // (2) + (3) The object-level boundary: parse the key's tenant and REFUSE unless
  // it equals the caller's verified tenant. Unparseable key ⇒ null target ⇒ deny.
  // This throws TenantIsolationError before any URL is signed.
  assertKeyTenant(callerTenant, key)

  if (!MEDIA_BUCKET_NAME) {
    // Undeployed / misconfigured: never sign against an unknown bucket.
    throw new Error('MEDIA_BUCKET_NAME is not configured')
  }

  // Only reached AFTER the tenant match succeeds.
  const command =
    op === 'get'
      ? new GetObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key })
      : new PutObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key })

  const url = await getSignedUrl(s3, command, { expiresIn: URL_TTL_SECONDS })

  return { url, key, op, expiresInSeconds: URL_TTL_SECONDS }
}

// Re-export the isolation error so callers/tests can `instanceof`-narrow refusals.
export { TenantIsolationError }
