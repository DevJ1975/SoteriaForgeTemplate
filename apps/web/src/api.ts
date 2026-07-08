/**
 * RLS-scoped data layer for the web learner/preview surface.
 *
 * The ONLY place feature code talks to the backend. It wraps the typed
 * `supabase.from(...)` client (`./supabase`, parameterized by `Database` from
 * `@soteria-forge/shared/supabase`) and maps rows onto the `@soteria-forge/shared`
 * domain records so the screens speak the shared vocabulary.
 *
 * TENANT ISOLATION (the #1 rule): every query here carries NO `tenant_id` (and no
 * `user_id`) filter for authorization — Postgres RLS scopes every row to the
 * caller's own tenant via `public.current_tenant_id()` (derived from the verified
 * session JWT). A `courseId` from the UI can therefore only ever resolve within
 * the caller's tenant; the server refuses a cross-tenant read.
 *
 * When Supabase is not configured, every call degrades GRACEFULLY: it returns an
 * empty result plus a `backendPending` flag so screens render an explanatory
 * "backend not configured" state instead of throwing.
 */
import type {
  CourseRecord,
  LessonRecord,
  ModuleRecord,
  LessonKind,
  LessonContent,
} from '@soteria-forge/shared'
import { parseLessonContent } from '@soteria-forge/shared'
import type { CourseRow, ModuleRow, LessonRow } from '@soteria-forge/shared/supabase'
import { supabase, isSupabaseConfigured } from './supabase'

/**
 * A lesson enriched with its parsed authoring content (`lessons.content` jsonb).
 * The base `LessonRecord` carries no content field, so the web player needs this
 * projection to render body text + score a quiz. Content is parsed DEFENSIVELY
 * via the shared `parseLessonContent` (absent/malformed → "no renderable
 * content"), exactly as the mobile player consumes it.
 */
export type LessonWithContent = LessonRecord & { content: LessonContent }

/** Standard graceful envelope: data plus a "backend not configured yet" flag. */
export interface Result<T> {
  data: T
  /** True when Supabase isn't configured — screens show an explanatory state. */
  backendPending: boolean
}

/** Narrow the free-form DB kind string to the domain union, defaulting safely. */
function toLessonKind(kind: string): LessonKind {
  switch (kind) {
    case 'video':
    case 'quiz':
    case 'game':
    case 'scorm':
    case 'document':
    case 'reflection':
    case 'practical-signoff':
      return kind
    default:
      return 'document'
  }
}

function courseRowToRecord(row: CourseRow): CourseRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug ?? undefined,
    title: row.title,
    description: row.description ?? '',
    status:
      row.status === 'published' || row.status === 'archived' ? row.status : 'draft',
    tags: row.tags ?? [],
    category: row.category ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    fieldReadinessScore: row.field_readiness_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function moduleRowToRecord(row: ModuleRow): ModuleRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    courseId: row.course_id,
    title: row.title,
    description: row.description ?? undefined,
    sequence: row.sequence,
    createdAt: row.created_at,
    // `modules` carries no `updated_at` column — mirror created_at (as mobile does).
    updatedAt: row.created_at,
  }
}

function lessonRowToRecord(row: LessonRow): LessonWithContent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    courseId: row.course_id,
    moduleId: row.module_id,
    kind: toLessonKind(row.kind),
    title: row.title,
    description: row.description ?? '',
    sequence: row.sequence,
    durationMinutes: row.duration_minutes,
    required: row.required,
    // Per-lesson pass threshold (wins over the content-level value when scoring).
    passingScore: row.passing_score ?? undefined,
    // Parsed authoring content — body text + scoreable quiz questions.
    content: parseLessonContent(row.content),
    createdAt: row.created_at,
    // `lessons` carries no `updated_at` column — mirror created_at (as mobile does).
    updatedAt: row.created_at,
  }
}

/**
 * List the caller's courses. RLS returns ONLY the caller's own tenant's rows —
 * NO tenant_id is sent. Ordered by title for a stable browse list.
 */
export async function listCourses(): Promise<Result<CourseRecord[]>> {
  if (!isSupabaseConfigured) {
    return { data: [], backendPending: true }
  }
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('title', { ascending: true })
  if (error) throw new Error(error.message)
  return { data: (data ?? []).map(courseRowToRecord), backendPending: false }
}

/** A course with its ordered modules, each carrying its ordered lessons. */
export interface CourseTree {
  course: CourseRecord
  modules: Array<ModuleRecord & { lessons: LessonWithContent[] }>
  /** All lessons flat, in module→lesson order (handy for the detail view). */
  lessons: LessonWithContent[]
}

/**
 * Load one course's modules + lessons, ordered by `sequence`. All reads are
 * RLS-scoped: NO tenant_id filter is sent, so a `courseId` can only resolve within
 * the caller's tenant. Returns `data: null` when the course isn't visible to the
 * caller (not found within their tenant).
 */
export async function getCourseTree(
  courseId: string,
): Promise<Result<CourseTree | null>> {
  if (!isSupabaseConfigured) {
    return { data: null, backendPending: true }
  }

  const [courseRes, moduleRes, lessonRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
    supabase.from('modules').select('*').eq('course_id', courseId),
    supabase.from('lessons').select('*').eq('course_id', courseId),
  ])

  const firstError = courseRes.error ?? moduleRes.error ?? lessonRes.error
  if (firstError) throw new Error(firstError.message)

  if (!courseRes.data) {
    // Not found within this tenant (RLS) — surface a clean "no course" result.
    return { data: null, backendPending: false }
  }

  const course = courseRowToRecord(courseRes.data)
  const orderedModules = [...(moduleRes.data ?? [])]
    .map(moduleRowToRecord)
    .sort((a, b) => a.sequence - b.sequence)
  const orderedLessons = [...(lessonRes.data ?? [])]
    .map(lessonRowToRecord)
    .sort((a, b) => a.sequence - b.sequence)

  const lessonsByModule = new Map<string, LessonWithContent[]>()
  for (const lesson of orderedLessons) {
    const bucket = lessonsByModule.get(lesson.moduleId)
    if (bucket) bucket.push(lesson)
    else lessonsByModule.set(lesson.moduleId, [lesson])
  }

  const flat: LessonWithContent[] = []
  const modules = orderedModules.map((m) => {
    const lessons = lessonsByModule.get(m.id) ?? []
    for (const l of lessons) flat.push(l)
    return { ...m, lessons }
  })

  return { data: { course, modules, lessons: flat }, backendPending: false }
}
