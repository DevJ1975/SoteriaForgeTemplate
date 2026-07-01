import { defineFunction } from '@aws-amplify/backend'

/**
 * Server-side tenant-ownership STAMP resolver.
 *
 * Backs the `create*Stamped` custom mutations (see data/resource.ts). AppSync
 * passes the caller's VERIFIED Cognito claims in `event.identity.claims`; the
 * handler reads `custom:tenantId` from there (never from request input), derives
 * `tenantId` + `adminGroup` via the shared `stampTenantOwnership` logic, and
 * OVERWRITES those two fields on the create input before persisting — so a caller
 * can never author a row into another tenant, and the read/write gates can never
 * diverge. See handler.ts + tenant-stamp.ts.
 *
 * It persists via the Amplify data client, so it needs data access wired in
 * backend.ts (`backend.data.resources.graphqlApi` / the generated env). No plain
 * env placeholders here — the data config is injected by `defineBackend`.
 */
export const tenantStamp = defineFunction({
  name: 'tenant-stamp',
  entry: './handler.ts',
  timeoutSeconds: 15,
  memoryMB: 256,
  runtime: 20,
})
