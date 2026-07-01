/**
 * Console data/service layer — Supabase edition.
 *
 * Backend pivot: the retired REST API (fetch + `x-soteria-tenant` header +
 * localStorage bearer token) is GONE. Auth is Supabase Auth (email/password);
 * data is Supabase Postgres accessed through `supabase.from(...)`. The public
 * `consoleApi` surface is kept stable so `App.vue` (and any future view) does
 * not churn — the return shapes still resolve to `@soteria-forge/shared` DTOs.
 *
 * TENANT ISOLATION (the #1 rule) is now Postgres Row-Level Security, not app
 * code:
 *   - Reads/writes are constrained to the caller's own tenant via
 *     `public.current_tenant_id()` (a SECURITY DEFINER fn reading the caller's
 *     profile from the session JWT).
 *   - INSERTs are tenant-stamped by a BEFORE INSERT trigger from the verified
 *     auth context — a client CANNOT choose another tenant's id.
 * Therefore this module NEVER sends a client-chosen `tenant_id` for
 * authorization and NEVER sets a tenant header. The old
 * `x-soteria-tenant` / `localStorage` token pattern is removed entirely.
 *
 * `super-admin` is the one legitimately cross-tenant role; the console still
 * targets ONE tenant partition per request and the server (RLS) re-authorizes
 * every access. We never assume a super-admin bypass in the client.
 */

import type {
  AuthSessionDTO,
  CognitoGroup,
  CourseBundleDTO,
  CourseDTO,
  CourseModuleDTO,
  ProductPackageDTO,
  TenantDTO,
  UserDTO,
  UserRole,
} from '@soteria-forge/shared'
import { GROUP_TO_USER_ROLE, isCognitoGroup } from '@soteria-forge/shared'
import type {
  CourseInsert,
  CourseRow,
  InvitationInsert,
  InvitationRow,
  LessonInsert,
  LessonRow,
  ModuleInsert,
  ModuleRow,
  ProfileRow,
  TenantInsert,
  TenantRow,
  TenantUpdate,
} from '@soteria-forge/shared/supabase'
import { supabase } from './supabase'

/**
 * Roles a tenant-admin may invite. These are the STORED `profiles.role` /
 * `invitations.role` vocabulary (Cognito-group names), NOT the legacy console
 * `UserRole` — the invitation row persists the group name a new profile will be
 * created with. `super-admin` is deliberately excluded (Soteria Forge staff are
 * not provisioned by a tenant-admin self-service invite).
 */
export type InvitableRole = Extract<CognitoGroup, 'worker' | 'supervisor' | 'tenant-admin'>

export const INVITABLE_ROLES: readonly InvitableRole[] = ['worker', 'supervisor', 'tenant-admin']

/**
 * The generated Insert types mark `tenant_id` as required, but for authenticated
 * end-users it is stamped server-side by a BEFORE INSERT trigger from the
 * verified session — clients must NOT supply it (doing so for authorization is a
 * security bug). This helper drops `tenant_id` from an Insert type so we can
 * build a fully field-checked payload without it, then hand it to `.insert()`.
 */
type ServerStamped<T> = Omit<T, 'tenant_id'>

// ===========================================================================
// Error helper — surface Postgres/PostgREST errors as plain Error messages so
// the existing `catch (error) { error.message }` call sites keep working.
// ===========================================================================

function fail(context: string, error: { message: string } | null): never {
  throw new Error(error?.message ? `${context}: ${error.message}` : context)
}

// ===========================================================================
// Row → DTO adapters
// ---------------------------------------------------------------------------
// The Postgres schema stores a leaner shape than the legacy wire DTOs: tenant
// `branding`/`settings` are JSON blobs, and there is no `domains`/`billing`
// column. We reconstruct the DTO shape the console renders, defaulting the
// fields Postgres does not persist so views (which read `tenant.domains[0]`,
// `tenant.slug`, `course.modules`, …) never see `undefined`.
// ===========================================================================

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function tenantRowToDTO(row: TenantRow): TenantDTO {
  const branding = asRecord(row.branding)
  const settings = asRecord(row.settings)
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    // Postgres does not store a `domains` array; derive a display domain from
    // the slug so the console's `tenant.domains[0]` binding stays defined.
    domains: [`${row.slug}.soteriaforge.com`],
    status: (row.status as TenantDTO['status']) ?? 'trial',
    mode: (row.mode as TenantDTO['mode']) ?? 'marketplace',
    // Billing lives outside this schema; default to 'manual' for display.
    billingStatus: 'manual',
    branding: {
      appName: typeof branding.appName === 'string' ? branding.appName : row.name,
      logoUrl: typeof branding.logoUrl === 'string' ? branding.logoUrl : undefined,
      primaryColor: typeof branding.primaryColor === 'string' ? branding.primaryColor : '#3DA9FC',
      accentColor: typeof branding.accentColor === 'string' ? branding.accentColor : '#FF6B1F',
    },
    settings: {
      offlineEnabled: settings.offlineEnabled !== false,
      lowBandwidthMode: settings.lowBandwidthMode !== false,
      vimeoDomainPrivacyRequired: settings.vimeoDomainPrivacyRequired !== false,
      defaultCertificateExpiryDays:
        typeof settings.defaultCertificateExpiryDays === 'number'
          ? settings.defaultCertificateExpiryDays
          : 365,
    },
  }
}

function moduleRowsToDTO(modules: ModuleRow[], lessons: LessonRow[]): CourseModuleDTO[] {
  return [...modules]
    .sort((a, b) => a.sequence - b.sequence)
    .map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description ?? undefined,
      lessons: lessons
        .filter((lesson) => lesson.module_id === module.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((lesson) => ({
          id: lesson.id,
          kind: lesson.kind as CourseModuleDTO['lessons'][number]['kind'],
          title: lesson.title,
          description: lesson.description ?? '',
          durationMinutes: lesson.duration_minutes,
          required: lesson.required,
          passingScore: lesson.passing_score ?? undefined,
        })),
    }))
}

function courseRowToDTO(
  row: CourseRow,
  modules: ModuleRow[] = [],
  lessons: LessonRow[] = [],
): CourseDTO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug ?? undefined,
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? undefined,
    role: row.role ?? undefined,
    topic: row.topic ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    status: row.status as CourseDTO['status'],
    tags: row.tags ?? [],
    fieldReadinessScore: row.field_readiness_score,
    modules: moduleRowsToDTO(modules, lessons),
    updatedAt: row.updated_at,
  }
}

function profileRowToUserDTO(row: ProfileRow): UserDTO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email ?? '',
    name: row.full_name ?? row.email ?? row.id,
    roles: [profileRoleToUserRole(row.role)],
    jobTitle: row.job_title ?? undefined,
    department: row.department ?? undefined,
    crew: row.crew ?? undefined,
    site: row.site ?? undefined,
  }
}

/**
 * Map a stored `profiles.role` (Cognito-group vocabulary:
 * worker|supervisor|tenant-admin|super-admin) to the legacy `UserRole` the
 * console DTOs speak. Uses the canonical bridge in `@soteria-forge/shared`;
 * never hardcodes the mapping. Unknown strings fall back to 'learner'.
 */
function profileRoleToUserRole(role: string): UserRole {
  return isCognitoGroup(role) ? GROUP_TO_USER_ROLE[role] : 'learner'
}

// ===========================================================================
// Session helper — resolve the signed-in user's profile (tenant + role) so
// login() can return an AuthSessionDTO-shaped object the console understands.
// The tenant comes from the caller's OWN profile row, which RLS scopes to the
// caller — never from client input.
// ===========================================================================

/**
 * Load the signed-in caller's OWN profile row. RLS scopes `profiles` to the
 * caller, so this is always the authenticated user's row — the tenant/role on it
 * come from the verified session, never from client input. Used both to build an
 * AuthSessionDTO and to source the caller's own `tenant_id` for invite inserts.
 */
async function loadCallerProfile(): Promise<ProfileRow> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) fail('Not authenticated', authError)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single()
  if (profileError || !profile) fail('Unable to load profile', profileError)

  return profile
}

async function loadSessionContext(): Promise<{ user: UserDTO; tenant: TenantDTO }> {
  const profile = await loadCallerProfile()

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', profile.tenant_id)
    .single()
  if (tenantError || !tenant) fail('Unable to load tenant', tenantError)

  return { user: profileRowToUserDTO(profile), tenant: tenantRowToDTO(tenant) }
}

// ===========================================================================
// Public surface — shape preserved from the retired REST client.
// ===========================================================================

export const consoleApi = {
  /**
   * Sign in with Supabase Auth (email/password). The `tenantSlug` argument is
   * kept ONLY for call-signature compatibility with the old console — it is
   * IGNORED for authorization. A caller's tenant is derived server-side from
   * their own profile (RLS); the client cannot choose a tenant. Returns an
   * AuthSessionDTO-shaped object (with `session.tenant.slug`/`.name`) so the
   * existing view code keeps working; `token` carries the Supabase access token
   * for parity, though nothing in the client reads it directly.
   */
  async login(email: string, password: string, _tenantSlug?: string): Promise<AuthSessionDTO> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) fail('Sign in failed', error)

    const { user, tenant } = await loadSessionContext()
    return { token: data.session.access_token, user, tenant }
  },

  /** Sign out and clear the persisted Supabase session. */
  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) fail('Sign out failed', error)
  },

  /** The current session (or null), for restoring UI state on reload. */
  async currentSession(): Promise<AuthSessionDTO | null> {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) return null
    const { user, tenant } = await loadSessionContext()
    return { token: data.session.access_token, user, tenant }
  },

  /**
   * Tenants visible to the caller. Under RLS a tenant-admin sees only their own
   * tenant; a super-admin sees all. The result shape `{ tenants }` is unchanged.
   */
  async tenants(): Promise<{ tenants: TenantDTO[] }> {
    const { data, error } = await supabase.from('tenants').select('*').order('name')
    if (error) fail('Unable to list tenants', error)
    return { tenants: (data ?? []).map(tenantRowToDTO) }
  },

  /**
   * Provision a tenant. We pass only the columns Postgres owns; we NEVER send a
   * client-chosen id-for-authorization — `id` is a server-generated default and
   * RLS/policies govern who may insert. `branding`/`settings` are stored as JSON.
   */
  async createTenant(
    payload: Partial<TenantDTO> & { name: string; slug: string },
  ): Promise<{ tenant: TenantDTO }> {
    const insert: TenantInsert = {
      name: payload.name,
      slug: payload.slug,
      status: payload.status ?? 'trial',
      mode: payload.mode ?? 'marketplace',
      branding: (payload.branding ?? {}) as TenantInsert['branding'],
      settings: (payload.settings ?? {}) as TenantInsert['settings'],
    }
    const { data, error } = await supabase.from('tenants').insert(insert).select('*').single()
    if (error || !data) fail('Unable to create tenant', error)
    return { tenant: tenantRowToDTO(data) }
  },

  /**
   * Update mutable tenant columns. `id` targets the row; RLS still re-authorizes
   * that the caller may write it (own tenant, or super-admin). No tenant_id is
   * ever sent for authorization.
   */
  async updateTenant(id: string, payload: Partial<TenantDTO>): Promise<{ tenant: TenantDTO }> {
    const patch: TenantUpdate = {}
    if (payload.name !== undefined) patch.name = payload.name
    if (payload.slug !== undefined) patch.slug = payload.slug
    if (payload.status !== undefined) patch.status = payload.status
    if (payload.mode !== undefined) patch.mode = payload.mode
    if (payload.branding !== undefined) patch.branding = payload.branding as TenantUpdate['branding']
    if (payload.settings !== undefined) patch.settings = payload.settings as TenantUpdate['settings']

    const { data, error } = await supabase
      .from('tenants')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error || !data) fail('Unable to update tenant', error)
    return { tenant: tenantRowToDTO(data) }
  },

  /**
   * Create a course draft. `tenant_id` is stamped by the BEFORE INSERT trigger
   * from the verified session — we do NOT send one for authorization. Modules
   * and lessons carried on the DTO are persisted as child rows in sequence.
   */
  async createCourse(payload: Partial<CourseDTO>): Promise<{ course: CourseDTO }> {
    // tenant_id intentionally omitted — server-stamped by trigger under RLS.
    const courseInsert: ServerStamped<CourseInsert> = {
      title: payload.title ?? 'Untitled course',
      description: payload.description ?? null,
      status: payload.status ?? 'draft',
      tags: payload.tags ?? [],
      category: payload.category ?? null,
      role: payload.role ?? null,
      topic: payload.topic ?? null,
      duration_minutes: payload.durationMinutes ?? null,
      field_readiness_score: payload.fieldReadinessScore ?? 0,
      slug: payload.slug ?? null,
    }
    const { data: course, error } = await supabase
      .from('courses')
      .insert(courseInsert as CourseInsert)
      .select('*')
      .single()
    if (error || !course) fail('Unable to create course', error)

    const modules = payload.modules ?? []
    const insertedModules: ModuleRow[] = []
    const insertedLessons: LessonRow[] = []

    for (const [moduleIndex, module] of modules.entries()) {
      // tenant_id server-stamped by trigger.
      const moduleInsert: ServerStamped<ModuleInsert> = {
        course_id: course.id,
        title: module.title,
        description: module.description ?? null,
        sequence: moduleIndex,
      }
      const { data: moduleRow, error: moduleError } = await supabase
        .from('modules')
        .insert(moduleInsert as ModuleInsert)
        .select('*')
        .single()
      if (moduleError || !moduleRow) fail('Unable to create module', moduleError)
      insertedModules.push(moduleRow)

      for (const [lessonIndex, lesson] of (module.lessons ?? []).entries()) {
        // tenant_id server-stamped by trigger.
        const lessonInsert: ServerStamped<LessonInsert> = {
          course_id: course.id,
          module_id: moduleRow.id,
          kind: lesson.kind,
          title: lesson.title,
          description: lesson.description ?? null,
          duration_minutes: lesson.durationMinutes ?? 0,
          required: lesson.required ?? true,
          passing_score: lesson.passingScore ?? null,
          sequence: lessonIndex,
        }
        const { data: lessonRow, error: lessonError } = await supabase
          .from('lessons')
          .insert(lessonInsert as LessonInsert)
          .select('*')
          .single()
        if (lessonError || !lessonRow) fail('Unable to create lesson', lessonError)
        insertedLessons.push(lessonRow)
      }
    }

    return { course: courseRowToDTO(course, insertedModules, insertedLessons) }
  },

  /** Publish a saved course draft (status → published). */
  async publishCourse(id: string): Promise<{ course: CourseDTO }> {
    const { data: course, error } = await supabase
      .from('courses')
      .update({ status: 'published' })
      .eq('id', id)
      .select('*')
      .single()
    if (error || !course) fail('Unable to publish course', error)

    const [{ data: modules }, { data: lessons }] = await Promise.all([
      supabase.from('modules').select('*').eq('course_id', id),
      supabase.from('lessons').select('*').eq('course_id', id),
    ])
    return { course: courseRowToDTO(course, modules ?? [], lessons ?? []) }
  },

  /**
   * List courses for the caller's tenant (RLS-scoped), with modules + lessons.
   * New helper the Supabase surface adds; the old REST client had no direct
   * equivalent but the console's course views benefit from it.
   */
  async courses(): Promise<{ courses: CourseDTO[] }> {
    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) fail('Unable to list courses', error)
    if (!courses?.length) return { courses: [] }

    const courseIds = courses.map((course) => course.id)
    const [{ data: modules }, { data: lessons }] = await Promise.all([
      supabase.from('modules').select('*').in('course_id', courseIds),
      supabase.from('lessons').select('*').in('course_id', courseIds),
    ])

    return {
      courses: courses.map((course) =>
        courseRowToDTO(
          course,
          (modules ?? []).filter((module) => module.course_id === course.id),
          (lessons ?? []).filter((lesson) => lesson.course_id === course.id),
        ),
      ),
    }
  },

  // -------------------------------------------------------------------------
  // Invitations — a tenant-admin invites a user into THEIR OWN tenant.
  //
  // RLS only permits tenant-admin / super-admin to INSERT into `invitations`,
  // and a BEFORE INSERT trigger stamps `tenant_id` + `invited_by` from the
  // verified session — so a client can NEVER seed another tenant's invite. The
  // generated Insert type marks `tenant_id` required (it can't see the trigger),
  // so we pass the caller's OWN tenant_id (read from their own RLS-scoped
  // profile); the trigger re-stamps it to the identical value. This is not a
  // client-chosen cross-tenant id — it is the caller's session tenant, and the
  // server re-authorizes it. A non-admin caller is rejected by RLS and the error
  // surfaces to the UI.
  // -------------------------------------------------------------------------

  /**
   * Create an invitation into the caller's own tenant and return the generated
   * `token` (a shareable claim key) alongside the full row. `role` is the stored
   * group vocabulary the invited profile will be created with.
   */
  async inviteUser(
    email: string,
    role: InvitableRole,
  ): Promise<{ token: string; invite: InvitationRow }> {
    // Source tenant_id from the caller's OWN profile (RLS-scoped) purely to
    // satisfy the generated Insert type; the trigger re-stamps it identically.
    const profile = await loadCallerProfile()

    const insert: InvitationInsert = {
      email: email.trim().toLowerCase(),
      role,
      tenant_id: profile.tenant_id,
    }

    const { data, error } = await supabase
      .from('invitations')
      .insert(insert)
      .select('*')
      .single()
    if (error || !data) fail('Unable to create invitation', error)

    return { token: data.token, invite: data }
  },

  /**
   * Pending (and past) invitations for the caller's tenant, newest first. RLS
   * scopes the result to the caller's own tenant — no tenant filter is sent.
   */
  async listInvitations(): Promise<{ invitations: InvitationRow[] }> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) fail('Unable to list invitations', error)
    return { invitations: data ?? [] }
  },

  // -------------------------------------------------------------------------
  // Tenant provisioning — a SUPER-ADMIN stands up a brand-new tenant + its
  // first admin invite in one server-side transaction.
  //
  // This is the one legitimately cross-tenant action, so it is NOT an ordinary
  // table INSERT (which RLS would tenant-stamp to the caller's own tenant).
  // Instead it calls the `provision_tenant(...)` Postgres function, which
  // creates the new tenant row and a first-admin invitation atomically and
  // returns `{ tenant_id, tenant_slug, invite_token }`. Authorization lives in
  // the function/RLS: only a super-admin may run it; any other caller (or a
  // taken slug) is rejected and the Postgres error surfaces here as a thrown
  // Error. The client sends ONLY the operator-entered name/slug/admin-email/mode
  // — never a client-chosen tenant_id for authorization.
  // -------------------------------------------------------------------------

  /**
   * Provision a new tenant and its first-admin invitation via the
   * `provision_tenant` RPC. Returns the new tenant's id + slug and the invite
   * `token` the first admin redeems (after signing up with `adminEmail`).
   * `mode` defaults to 'dedicated'. Throws on error — a non-super-admin caller
   * or a taken slug is surfaced as the server message.
   */
  async provisionTenant(
    name: string,
    slug: string,
    adminEmail: string,
    mode?: string,
  ): Promise<{ tenant_id: string; tenant_slug: string; invite_token: string }> {
    const { data, error } = await supabase.rpc('provision_tenant', {
      p_name: name,
      p_slug: slug,
      p_admin_email: adminEmail,
      p_mode: mode ?? 'dedicated',
    })
    if (error) fail('Unable to provision tenant', error)

    // The RPC returns a table (array of rows); the provisioned tenant is the
    // first (and only) row. Guard the empty case so callers never read undefined.
    const row = data?.[0]
    if (!row) fail('Unable to provision tenant', { message: 'no tenant returned' })

    return {
      tenant_id: row.tenant_id,
      tenant_slug: row.tenant_slug,
      invite_token: row.invite_token,
    }
  },

  // -------------------------------------------------------------------------
  // Commerce surface (packages / bundles / billing).
  //
  // These have NO table in the Supabase schema (the pivot narrowed scope to the
  // LMS core: tenants/profiles/courses/modules/lessons/enrollments/xAPI/video).
  // To keep the console building and its commerce panels non-fatal, these keep
  // their signatures but resolve to empty/echoed data instead of hitting a REST
  // endpoint that no longer exists. When a commerce backend lands, repoint these
  // at it. They never touch tenant scoping.
  // -------------------------------------------------------------------------

  async catalogPackages(): Promise<{ packages: ProductPackageDTO[] }> {
    return { packages: [] }
  },

  async catalogBundles(): Promise<{ bundles: CourseBundleDTO[] }> {
    return { bundles: [] }
  },

  async createPackage(
    payload: Partial<ProductPackageDTO>,
  ): Promise<{ package: ProductPackageDTO }> {
    // No packages table yet — echo an in-memory package so the UI can reflect
    // the draft the operator just entered without a failed network call.
    const now = Date.now()
    const productPackage: ProductPackageDTO = {
      id: `pkg-local-${now}`,
      name: payload.name ?? 'Untitled package',
      slug: payload.slug ?? `package-${now}`,
      description: payload.description ?? '',
      status: payload.status ?? 'draft',
      bundleIds: payload.bundleIds ?? [],
      seatLimit: payload.seatLimit ?? 1,
      featureFlags: payload.featureFlags ?? {},
      stripeProductId: payload.stripeProductId,
      stripePriceId: payload.stripePriceId,
      priceLabel: payload.priceLabel,
      buyerType: payload.buyerType ?? 'both',
      sortOrder: payload.sortOrder ?? 0,
    }
    return { package: productPackage }
  },

  async createBundle(payload: Partial<CourseBundleDTO>): Promise<{ bundle: CourseBundleDTO }> {
    const now = Date.now()
    const bundle: CourseBundleDTO = {
      id: `bundle-local-${now}`,
      name: payload.name ?? 'Untitled bundle',
      slug: payload.slug ?? `bundle-${now}`,
      description: payload.description ?? '',
      category: payload.category ?? '',
      status: payload.status ?? 'draft',
      courseIds: payload.courseIds ?? [],
      sortOrder: payload.sortOrder ?? 0,
    }
    return { bundle }
  },

  /**
   * "Convert to dedicated" flips the tenant's `mode` to 'dedicated'. Billing
   * lives outside this schema, so `billingStatus` on the argument is accepted
   * for signature parity but not persisted. `id` targets the row; RLS
   * re-authorizes the write.
   */
  async convertTenantToDedicated(
    id: string,
    _payload: { subdomain: string; billingStatus?: string },
  ): Promise<{ tenant: TenantDTO }> {
    const { data, error } = await supabase
      .from('tenants')
      .update({ mode: 'dedicated' })
      .eq('id', id)
      .select('*')
      .single()
    if (error || !data) fail('Unable to convert tenant', error)
    return { tenant: tenantRowToDTO(data) }
  },

  /**
   * Billing override has no backing column in this schema; kept for signature
   * parity. Reads the current row back so callers still receive a TenantDTO.
   */
  async billingOverride(
    id: string,
    _payload: { billingStatus: string; seatLimit?: number },
  ): Promise<{ tenant: TenantDTO }> {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single()
    if (error || !data) fail('Unable to load tenant', error)
    return { tenant: tenantRowToDTO(data) }
  },
}
