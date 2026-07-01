/**
 * Tenant-scoped data client over Supabase.
 *
 * This module is the ONLY place feature code talks to the backend. It exists to
 * enforce two things the rest of the app never has to think about:
 *
 *   1. TENANT SCOPING is done by POSTGRES RLS, not by the client. Every table has
 *      row-level policies that constrain reads/writes to the caller's own tenant
 *      via `public.current_tenant_id()` (derived from the session JWT). So a plain
 *      `supabase.from('courses').select()` already returns ONLY this tenant's
 *      courses — there is no cross-tenant query to write, and adding a client-side
 *      `tenant_id` filter would be redundant (and must never be used as the
 *      security boundary). The `tenantId` passed to `getDataClient` is used only
 *      to keep the offline cache tenant-tagged and to fail closed if somehow
 *      called without a verified tenant; it is NOT sent as a scoping arg.
 *
 *   2. TYPING against `@soteria-forge/shared`. Query results (typed against the
 *      generated `Database` schema) are mapped to the canonical domain records so
 *      screens depend on the shared contract, not on the raw table shape.
 *
 * When the client has no configured URL/anon key the methods throw
 * BackendNotConfiguredError so the shell degrades predictably (empty states)
 * instead of hitting an unconfigured origin.
 */
import type {
  CourseRecord,
  CourseStatus,
  EnrollmentRecord,
  EnrollmentStatus,
} from '@soteria-forge/shared';
import type { Tables } from '@soteria-forge/shared/supabase';
import { supabase, isSupabaseConfigured } from '../supabase';

/** Thrown when the data client is used before Supabase credentials are configured. */
export class BackendNotConfiguredError extends Error {
  readonly code = 'BACKEND_NOT_CONFIGURED' as const;
  constructor() {
    super(
      'Supabase is not configured yet. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY (copy apps/mobile/.env.example to .env) so the ' +
        'typed client can reach the project.',
    );
    this.name = 'BackendNotConfiguredError';
    Object.setPrototypeOf(this, BackendNotConfiguredError.prototype);
  }
}

type CourseRow = Tables<'courses'>;
type EnrollmentRow = Tables<'enrollments'>;

/** Narrow the free-form DB status string to the domain union, defaulting safely. */
function toCourseStatus(status: string): CourseStatus {
  return status === 'published' || status === 'archived' ? status : 'draft';
}

function toEnrollmentStatus(status: string): EnrollmentStatus {
  switch (status) {
    case 'in-progress':
    case 'completed':
    case 'overdue':
    case 'expired':
      return status;
    default:
      return 'assigned';
  }
}

/** Map a `courses` row → the shared CourseRecord the UI consumes. */
function courseRowToRecord(row: CourseRow): CourseRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug ?? undefined,
    title: row.title,
    description: row.description ?? '',
    status: toCourseStatus(row.status),
    tags: row.tags ?? [],
    category: row.category ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    fieldReadinessScore: row.field_readiness_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Map an `enrollments` row → the shared EnrollmentRecord. */
function enrollmentRowToRecord(row: EnrollmentRow): EnrollmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    courseId: row.course_id,
    status: toEnrollmentStatus(row.status),
    progress: row.progress,
    // The DB tracks created_at + due/completed; there is no separate assigned/
    // started column, so we surface created_at as the assignment time.
    assignedAt: row.created_at,
    dueAt: row.due_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

/**
 * The tenant-scoped data client. Obtain one with `getDataClient(tenantId)` where
 * `tenantId` is the verified tenant from the caller's profile. Every method reads
 * ONLY the caller's tenant because RLS enforces it server-side — there is no
 * method that (or way to) read across tenants.
 */
export interface DataClient {
  readonly tenantId: string;
  /** List THIS tenant's courses (RLS-scoped). */
  listCourses(): Promise<CourseRecord[]>;
  /** Fetch one course header by id, within this tenant (RLS-scoped). */
  getCourse(courseId: string): Promise<CourseRecord | null>;
  /** List the signed-in user's enrollments within this tenant (RLS-scoped). */
  listEnrollmentsForUser(userId: string): Promise<EnrollmentRecord[]>;
}

export function getDataClient(tenantId: string): DataClient {
  if (!tenantId) {
    // Defense in depth: never build a client without a verified tenant scope.
    throw new Error('getDataClient requires a non-empty tenantId (from the caller profile).');
  }

  function assertConfigured(): void {
    if (!isSupabaseConfigured) throw new BackendNotConfiguredError();
  }

  return {
    tenantId,

    async listCourses() {
      assertConfigured();
      // No tenant_id filter: RLS already constrains this to the caller's tenant.
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('title', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(courseRowToRecord);
    },

    async getCourse(courseId: string) {
      assertConfigured();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? courseRowToRecord(data) : null;
    },

    async listEnrollmentsForUser(userId: string) {
      assertConfigured();
      // RLS scopes to the tenant; the user_id filter narrows to this learner's
      // own enrollments (workers are additionally owner-pinned by policy).
      const { data, error } = await supabase
        .from('enrollments')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return (data ?? []).map(enrollmentRowToRecord);
    },
  };
}
