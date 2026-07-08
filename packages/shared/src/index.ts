/**
 * @soteria-forge/shared — canonical domain model for the Soteria Forge platform.
 *
 * This barrel re-exports every focused module. The public surface is a strict
 * SUPERSET of the legacy exports: everything apps/console imported before
 * (AuthSessionDTO, CourseBundleDTO, CourseDTO, ProductPackageDTO, TenantDTO,
 * normalizeTenantSlug, hasRequiredRole, the xAPI types, …) is still exported
 * from '@soteria-forge/shared'.
 *
 * Backend note: tenant isolation is now enforced by Postgres RLS (see ADR-0007).
 * The AWS-era single-table key builders (`keys.ts`) and the Cognito adminGroup
 * stamp (`stampTenantOwnership`) have been pruned — they had no remaining callers.
 * The Supabase DB types + row aliases live under the `./supabase` subpath export.
 *
 * Modules:
 *   domain        — DTOs (course/module/lesson/user/enrollment records) and helpers
 *   lessonContent — typed view over lessons.content jsonb (parser + quiz scoring)
 *   roles         — role group model + legacy UserRole mapping and guards
 *   tenant        — the tenant-isolation guard (assertTenantMatch / isSameTenant)
 *   xapi          — xAPI completion-statement types, verbs, and builders
 */

export * from './domain.js'
export * from './lessonContent.js'
export * from './roles.js'
export * from './tenant.js'
export * from './xapi.js'
