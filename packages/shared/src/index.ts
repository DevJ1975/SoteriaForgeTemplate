/**
 * @soteria-forge/shared — canonical domain model for the AWS-era Soteria Forge
 * platform.
 *
 * This barrel re-exports every focused module. The public surface is a strict
 * SUPERSET of the legacy exports: everything apps/console imported before
 * (AuthSessionDTO, CourseBundleDTO, CourseDTO, ProductPackageDTO, TenantDTO,
 * normalizeTenantSlug, hasRequiredRole, the xAPI types, …) is still exported
 * from '@soteria-forge/shared'. New AWS-era pieces are added alongside them.
 *
 * Modules:
 *   domain — DTOs (legacy + AWS-era single-table records) and domain helpers
 *   roles  — Cognito group model + legacy UserRole mapping and guards
 *   keys   — single-table PK/SK builders + parsers
 *   tenant — the tenant-isolation guard (assertTenantMatch / isSameTenant)
 *   xapi   — xAPI completion-statement types, verbs, and builders
 */

export * from './domain.js'
export * from './roles.js'
export * from './keys.js'
export * from './tenant.js'
export * from './xapi.js'
