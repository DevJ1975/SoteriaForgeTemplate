/**
 * @soteria-forge/shared/supabase — generated Postgres schema types + row helpers.
 *
 * This is a TYPES-ONLY surface. It deliberately does NOT import
 * `@supabase/supabase-js`; consumers (apps/mobile, apps/console) own the runtime
 * client and parameterize it with the `Database` type re-exported here, e.g.:
 *
 *   import type { Database } from '@soteria-forge/shared/supabase'
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient<Database>(url, anonKey)
 *
 * `database.types.ts` is generated verbatim by
 *   supabase gen types typescript --project-id bgnadngztngkwzneknhd
 * — never hand-edit it; regenerate after a schema change (see supabase/README.md).
 */

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from './database.types.js'
export { Constants } from './database.types.js'

import type { Tables, TablesInsert, TablesUpdate } from './database.types.js'

// ── Row aliases (the shape a SELECT returns) ────────────────────────────────
export type TenantRow = Tables<'tenants'>
export type ProfileRow = Tables<'profiles'>
export type CourseRow = Tables<'courses'>
export type ModuleRow = Tables<'modules'>
export type LessonRow = Tables<'lessons'>
export type EnrollmentRow = Tables<'enrollments'>
export type CompletionStatementRow = Tables<'completion_statements'>
export type VideoAssetRow = Tables<'video_assets'>
export type InvitationRow = Tables<'invitations'>
export type CertificateRow = Tables<'certificates'>

// ── Insert aliases (the shape an INSERT accepts; tenant_id/user_id are
//    server-stamped for authenticated end-users, so callers pass their columns) ──
export type TenantInsert = TablesInsert<'tenants'>
export type ProfileInsert = TablesInsert<'profiles'>
export type CourseInsert = TablesInsert<'courses'>
export type ModuleInsert = TablesInsert<'modules'>
export type LessonInsert = TablesInsert<'lessons'>
export type EnrollmentInsert = TablesInsert<'enrollments'>
export type CompletionStatementInsert = TablesInsert<'completion_statements'>
export type VideoAssetInsert = TablesInsert<'video_assets'>
export type InvitationInsert = TablesInsert<'invitations'>

// ── Update aliases ──────────────────────────────────────────────────────────
export type TenantUpdate = TablesUpdate<'tenants'>
export type ProfileUpdate = TablesUpdate<'profiles'>
export type CourseUpdate = TablesUpdate<'courses'>
export type ModuleUpdate = TablesUpdate<'modules'>
export type LessonUpdate = TablesUpdate<'lessons'>
export type EnrollmentUpdate = TablesUpdate<'enrollments'>
export type VideoAssetUpdate = TablesUpdate<'video_assets'>
export type InvitationUpdate = TablesUpdate<'invitations'>
// (completion_statements is APPEND-ONLY — no update alias is exported by design.)
