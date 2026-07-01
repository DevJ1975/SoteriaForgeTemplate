/**
 * Server-side tenant-ownership STAMP resolver — closes the residual where
 * `tenantId` + `adminGroup` could be client-supplied or drift apart.
 *
 * WHAT THIS IS:
 *   The Lambda data source behind the `create*Stamped` custom mutations in
 *   data/resource.ts (createTenantStamped, createUserStamped, createCourseStamped,
 *   createModuleStamped, createLessonStamped, createEnrollmentStamped,
 *   createVideoAssetStamped). Admin authoring + roster changes go through THESE
 *   mutations instead of the raw auto-generated `create*` so the two isolation
 *   fields are set SERVER-SIDE from the caller's verified identity.
 *
 * WHERE THE STAMP ATTACHES (the load-bearing line):
 *   `applyTenantStamp(callerTenant, input)` below — it OVERWRITES `tenantId` and
 *   `adminGroup` on the create input with values derived from the SINGLE verified
 *   `custom:tenantId` claim, discarding whatever the client sent for them, THEN
 *   the row is persisted. So the read gate (`groupDefinedIn('tenantId')`) and the
 *   write gate (`groupDefinedIn('adminGroup')`) are both pinned to the caller's
 *   own tenant by construction.
 *
 * TENANT ISOLATION (the #1 rule):
 *   1. Caller tenant is read ONLY from AppSync's VERIFIED `event.identity.claims
 *      ['custom:tenantId']` — never from the request input/args/headers.
 *   2. A create with NO verified tenant claim is REJECTED (fail closed).
 *   3. The persisted `tenantId`/`adminGroup` are the stamp's, not the client's.
 *
 * PERSISTENCE:
 *   The row is written via the Amplify data client configured from the function's
 *   own environment (`getAmplifyDataClientConfig`). The client calls run under the
 *   caller's identity is NOT assumed — this resolver is the trusted server that
 *   has already re-derived the tenant from the verified claim, so it uses the
 *   function's IAM auth to persist the STAMPED row. The stamp is what guarantees
 *   the row lands in the caller's own tenant.
 */

import type { AppSyncResolverEvent, Context } from 'aws-lambda'
import { generateClient } from 'aws-amplify/data'
import { Amplify } from 'aws-amplify'
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime'
import { env } from '$amplify/env/tenant-stamp'
import type { Schema } from '../../data/resource.js'
import { applyTenantStamp, TenantIsolationError } from './tenant-stamp.js'

// ---------------------------------------------------------------------------
// Amplify data client — configured once per container from the function env.
// ---------------------------------------------------------------------------

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env)
Amplify.configure(resourceConfig, libraryOptions)
// authMode 'iam': the resolver authenticates to AppSync with its OWN execution
// role (granted by `allow.resource(tenantStamp)` in data/resource.ts), NOT a user
// token — it is the trusted server writing the already-stamped row. The stamp,
// derived from the verified claim, is what pins the row to the caller's tenant.
const client = generateClient<Schema>({ authMode: 'iam' })

/**
 * Map each `create*Stamped` MUTATION FIELD NAME to the model it creates. The
 * routing key is `event.info.fieldName` (the resolver's own field) — a SERVER
 * value, NOT a client argument — so a caller cannot redirect a create to a
 * different model. Adding a model here + a matching mutation in data/resource.ts
 * is the only way to extend the stamp.
 */
const FIELD_TO_MODEL = {
  createTenantStamped: 'Tenant',
  createUserStamped: 'User',
  createCourseStamped: 'Course',
  createModuleStamped: 'Module',
  createLessonStamped: 'Lesson',
  createEnrollmentStamped: 'Enrollment',
  createVideoAssetStamped: 'VideoAsset',
} as const
type StampField = keyof typeof FIELD_TO_MODEL

function modelForField(fieldName: string | null | undefined): string | null {
  if (typeof fieldName === 'string' && fieldName in FIELD_TO_MODEL) {
    return FIELD_TO_MODEL[fieldName as StampField]
  }
  return null
}

export type StampArgs = {
  /** The create input as JSON. `tenantId`/`adminGroup` on it are IGNORED (stamped). */
  input: Record<string, unknown>
}

/** Thrown for a malformed request (unroutable field, missing input). */
class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}

/**
 * Read the caller's tenant from AppSync's VERIFIED identity claims. AppSync has
 * already validated the token before invoking this resolver, so
 * `identity.claims['custom:tenantId']` is trusted. Returns '' when absent.
 */
function tenantFromIdentity(event: AppSyncResolverEvent<StampArgs>): string {
  const identity = event.identity as { claims?: Record<string, unknown> } | null | undefined
  const claimed = identity?.claims?.['custom:tenantId']
  return typeof claimed === 'string' ? claimed : ''
}

/**
 * Stamp `tenantId` + `adminGroup` from the verified claim and persist the row.
 * Rejects when there is no verified tenant, an unroutable field, or missing input
 * — the stamp itself also throws TenantIsolationError on an empty/malformed claim.
 *
 * The target model is derived from `event.info.fieldName` (a SERVER value), never
 * from a client argument, so a caller cannot point the create at another model.
 */
export const handler = async (
  event: AppSyncResolverEvent<StampArgs>,
  _context: Context,
): Promise<unknown> => {
  const model = modelForField(event.info?.fieldName)
  const { input } = event.arguments ?? ({} as StampArgs)

  if (!model) {
    throw new BadRequestError('Unroutable stamp mutation')
  }
  if (!input || typeof input !== 'object') {
    throw new BadRequestError('A create input object is required')
  }

  // VERIFIED caller tenant — the only trusted source. Empty ⇒ applyTenantStamp
  // throws TenantIsolationError (fail closed), so no row is written.
  const callerTenant = tenantFromIdentity(event)

  // *** THE STAMP ATTACHES HERE ***
  // Overwrite tenantId + adminGroup from the single verified claim, discarding
  // any client-supplied values, BEFORE the row is persisted.
  const stamped = applyTenantStamp(callerTenant, input)

  // Persist the stamped row. The model's own AppSync auth still applies to
  // downstream reads/writes; this create lands in the caller's own tenant because
  // the stamp forced tenantId/adminGroup to the verified claim.
  const models = client.models as Record<
    string,
    | { create: (value: Record<string, unknown>) => Promise<{ data: unknown; errors?: unknown }> }
    | undefined
  >
  const modelClient = models[model]
  if (!modelClient) {
    // Defensive: FIELD_TO_MODEL only maps to real Schema models, so this is
    // unreachable in practice — but never call .create on an undefined model.
    throw new BadRequestError('Unroutable stamp mutation')
  }
  const { data, errors } = await modelClient.create(stamped)

  if (errors) {
    throw new Error(`Create failed: ${JSON.stringify(errors)}`)
  }
  return data
}

// Re-export so callers/tests can `instanceof`-narrow an isolation refusal.
export { TenantIsolationError }
