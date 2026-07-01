import { defineStorage } from '@aws-amplify/backend'

/**
 * S3 storage for the AWS-era Soteria Forge platform.
 *
 * Holds BINARY assets that do not belong in DynamoDB:
 *   - course thumbnails / hero images / poster frames
 *   - source video objects and derived renditions (the BYTES that VideoAsset
 *     metadata merely points at — DynamoDB never stores bytes)
 *   - study guides / documents
 *   - offline learning bundles downloaded by the mobile app
 *   - each user's OWN private scratch space
 *
 * ==========================================================================
 * IMPORTANT — WHAT `{entity_id}` ACTUALLY IS (correcting a prior false claim)
 * ==========================================================================
 * In Amplify Gen 2, `allow.entity('identity')` substitutes `{entity_id}` with
 * the caller's per-USER Cognito IDENTITY id (the Identity Pool identity id), NOT
 * `custom:tenantId`. A previous version of this file used
 * `tenant/{entity_id}/*` and claimed `{entity_id}` resolved to the tenant — that
 * was WRONG. `{entity_id}` is the individual user's identity, so such a rule
 * partitions per-USER, not per-TENANT, and does nothing to isolate one tenant's
 * media from another's.
 *
 * ==========================================================================
 * TENANT ISOLATION AT THE OBJECT LAYER IS NOT EXPRESSIBLE IN STATIC PATH RULES
 * ==========================================================================
 * True per-TENANT object isolation — preventing a tenant-A user from reading
 * tenant-B media by GUESSING or exfiltrating a key like
 * `tenant/<tenantB>/videos/secret.mp4` — CANNOT be expressed with static S3 path
 * rules here. `allow.groups(['tenant-admin'])` / `allow.authenticated()` are
 * tenant-BLIND (the same group/authenticated principal exists in every tenant),
 * and `{entity_id}` is per-user, not per-tenant. There is no `{tenantId}`
 * placeholder bound to the verified `custom:tenantId` claim.
 *
 * >>> ENFORCED PRODUCTION PATH (IMPLEMENTED): a TENANT-CHECKED SIGNED-URL MINT.
 * >>> The `getMediaUrl(key, op)` AppSync custom query — backed by the `media-url`
 * >>> Lambda (functions/media-url/{handler,key-tenant}.ts) — reads the caller's
 * >>> VERIFIED `custom:tenantId` from `event.identity.claims`, parses the
 * >>> requested `media/<kind>/<tenantId>/…` key, and REFUSES to sign unless the
 * >>> key's tenant segment equals the caller's verified tenant (mismatch OR an
 * >>> unparseable key ⇒ deny). Only then does it return a short-lived pre-signed
 * >>> GET/PUT URL for that ONE object. Clients never receive broad S3 access; the
 * >>> mint hands out per-object signed URLs only for objects their verified tenant
 * >>> owns. That mint — NOT these static rules — is the LOAD-BEARING object-level
 * >>> tenant boundary. The rules below are coarse capability grants (who may
 * >>> author vs. read at all), sized for LEAST PRIVILEGE; the mint enforces WHICH
 * >>> tenant's object. See data/resource.ts (`getMediaUrl`) + data/tenant-isolation.md.
 */
export const storage = defineStorage({
  name: 'soteriaForgeAssets',
  access: (allow) => ({
    // -----------------------------------------------------------------------
    // Genuinely per-USER private space. Here `{entity_id}` == the caller's OWN
    // Cognito identity id, so this IS correctly a private partition: a user can
    // only reach objects under their own identity prefix. This is the ONLY place
    // `entity('identity')` is semantically accurate.
    // -----------------------------------------------------------------------
    'private/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],

    // -----------------------------------------------------------------------
    // Shared tenant media. LEAST PRIVILEGE:
    //   - authenticated callers may READ only (workers watch/download).
    //   - tenant-admin may read/write/delete (authoring the tenant's library).
    // These grants are tenant-BLIND on their own (see header) — object-level
    // per-tenant isolation is enforced by the tenant-checked SIGNED-URL MINT
    // (`getMediaUrl` → the `media-url` Lambda), which proves the requested
    // `media/<kind>/<tenantId>/…` key belongs to the caller's verified tenant
    // before signing. These static paths are the coarse capability floor; the
    // mint is WHICH-tenant enforcement. Workers no longer get write/delete on
    // media (the prior catch-all granted every identity delete on a tenant's
    // videos — removed).
    // -----------------------------------------------------------------------
    'media/videos/*': [
      allow.authenticated().to(['read']),
      allow.groups(['tenant-admin']).to(['read', 'write', 'delete']),
    ],
    'media/documents/*': [
      allow.authenticated().to(['read']),
      allow.groups(['tenant-admin']).to(['read', 'write', 'delete']),
    ],
    'media/thumbnails/*': [
      allow.authenticated().to(['read']),
      allow.groups(['tenant-admin']).to(['read', 'write', 'delete']),
    ],
    'media/offline-bundles/*': [
      allow.authenticated().to(['read']),
      allow.groups(['tenant-admin']).to(['read', 'write', 'delete']),
    ],
    // NOTE: no catch-all read+write+delete-to-everyone rule. The previous
    // `tenant/{entity_id}/*` catch-all (which granted every identity full access
    // and falsely claimed per-tenant isolation) has been REMOVED entirely.
  }),
})
