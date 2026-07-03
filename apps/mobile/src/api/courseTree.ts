/**
 * useCourseTree — the tenant-scoped course PLAYER data source.
 *
 * Loads everything the CourseDetail + LessonPlayer screens need to close the
 * learning loop for ONE course:
 *
 *   1. the course header (CourseRecord),
 *   2. its modules (ordered by `sequence`),
 *   3. each module's lessons (ordered by `sequence`),
 *   4. the caller's OWN enrollment for that course (progress/status), and
 *   5. the set of lesson ids this device has locally recorded as completed,
 *      read from the append-only offline outbox — so a lesson shows as done the
 *      instant its completion is enqueued, even fully offline and before sync.
 *
 * TENANT ISOLATION (the #1 rule): every table read here goes through the typed
 * `supabase.from(...)` client with NO `tenant_id` filter — Postgres RLS scopes
 * every row to the caller's own tenant via `public.current_tenant_id()`. A
 * `courseId` from a deep link therefore can only ever resolve within the
 * caller's tenant; the server refuses a cross-tenant read. The `tenantId`/`userId`
 * this hook operates under come ONLY from the verified session (`useAuth`), never
 * from route params or any other input. The enrollment read additionally narrows
 * to the caller's own `user_id` (workers are owner-pinned by policy anyway).
 *
 * The completed-lesson set is read from the LOCAL WatermelonDB outbox via
 * `completionQueue.completedLessonIds(courseId)`, so the UI is correct offline;
 * it is display-only and never a security boundary.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  CourseRecord,
  EnrollmentRecord,
  LessonKind,
} from '@soteria-forge/shared';
import type { Tables } from '@soteria-forge/shared/supabase';
import { useAuth } from '../auth/AuthProvider';
import { completionQueue } from '../offline';
import { supabase, isSupabaseConfigured } from '../supabase';
import { BackendNotConfiguredError } from './dataClient';

type CourseRow = Tables<'courses'>;
type ModuleRow = Tables<'modules'>;
type LessonRow = Tables<'lessons'>;
type EnrollmentRow = Tables<'enrollments'>;

/** A lesson as the player renders it, plus its locally-known completion state. */
export interface LessonNode {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  description: string;
  kind: LessonKind;
  sequence: number;
  durationMinutes: number;
  required: boolean;
  /** True when this device has locally recorded a `completed` statement for it. */
  completed: boolean;
}

/** A module with its ordered lessons. */
export interface ModuleNode {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  sequence: number;
  lessons: LessonNode[];
}

/** The whole player payload for one course. */
export interface CourseTree {
  course: CourseRecord;
  modules: ModuleNode[];
  /** The caller's own enrollment for this course, if one exists. */
  enrollment: EnrollmentRecord | null;
  /** Progress in [0,1], derived from locally-completed REQUIRED lessons, floored
   *  by the server enrollment progress so the bar never regresses after sync. */
  progress: number;
  /** All lessons flat, in module→lesson order — handy for "next lesson" logic. */
  lessons: LessonNode[];
}

export interface UseCourseTreeResult {
  tree: CourseTree | null;
  loading: boolean;
  /** Set when Supabase isn't configured yet — screens show an explanatory state. */
  backendPending: boolean;
  error: string | null;
  /** Re-fetch the tree (also refreshes the local completed-lesson set). */
  refetch: () => void;
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
      return kind;
    default:
      return 'document';
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
  };
}

function enrollmentRowToRecord(row: EnrollmentRow): EnrollmentRecord {
  const status = ['in-progress', 'completed', 'overdue', 'expired'].includes(row.status)
    ? (row.status as EnrollmentRecord['status'])
    : 'assigned';
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    courseId: row.course_id,
    status,
    // SERVER UNITS: `enrollments.progress` is an INTEGER PERCENT 0–100, written
    // by the server trigger (migration 12). EnrollmentRecord carries it verbatim
    // (the console renders it as `NN%` too); anything that needs the app-internal
    // 0–1 display convention divides by 100 AT THAT BOUNDARY — see
    // `assembleCourseTree`. Never treat this field as a 0–1 fraction.
    progress: row.progress,
    assignedAt: row.created_at,
    dueAt: row.due_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

/**
 * Assemble modules→lessons from flat rows, applying the locally-completed set,
 * and compute the display progress. Pure so the shape logic is testable and so
 * the online/offline paths share one assembler.
 */
export function assembleCourseTree(params: {
  course: CourseRecord;
  moduleRows: ModuleRow[];
  lessonRows: LessonRow[];
  enrollment: EnrollmentRecord | null;
  completedLessonIds: Set<string>;
}): CourseTree {
  const { course, moduleRows, lessonRows, enrollment, completedLessonIds } = params;

  const orderedModules = [...moduleRows].sort((a, b) => a.sequence - b.sequence);
  const orderedLessons = [...lessonRows].sort((a, b) => a.sequence - b.sequence);

  const lessonsByModule = new Map<string, LessonNode[]>();
  const flat: LessonNode[] = [];
  for (const row of orderedLessons) {
    const node: LessonNode = {
      id: row.id,
      courseId: row.course_id,
      moduleId: row.module_id,
      title: row.title,
      description: row.description ?? '',
      kind: toLessonKind(row.kind),
      sequence: row.sequence,
      durationMinutes: row.duration_minutes,
      required: row.required,
      completed: completedLessonIds.has(row.id),
    };
    const bucket = lessonsByModule.get(row.module_id);
    if (bucket) bucket.push(node);
    else lessonsByModule.set(row.module_id, [node]);
  }

  const modules: ModuleNode[] = orderedModules.map((m) => {
    const lessons = lessonsByModule.get(m.id) ?? [];
    // Keep the flat list in module→lesson order.
    for (const l of lessons) flat.push(l);
    return {
      id: m.id,
      courseId: m.course_id,
      title: m.title,
      description: m.description ?? undefined,
      sequence: m.sequence,
      lessons,
    };
  });

  // Local progress from REQUIRED lessons completed on this device. If a course
  // has no required lessons, fall back to all lessons so the bar still moves.
  const requiredLessons = flat.filter((l) => l.required);
  const denom = requiredLessons.length > 0 ? requiredLessons.length : flat.length;
  const numer = (requiredLessons.length > 0 ? requiredLessons : flat).filter(
    (l) => l.completed,
  ).length;
  const localProgress = denom > 0 ? numer / denom : 0;

  // The server enrollment.progress is authoritative once synced; take the max so
  // the bar never regresses (a locally-completed lesson can only ever add).
  //
  // UNITS: enrollment.progress is the server's INTEGER PERCENT (0–100, from the
  // migration-12 trigger); CourseTree.progress is the app-internal 0–1 fraction.
  // The /100 here is THE conversion boundary — without it, any enrollment at
  // ≥1% clamps to 1 and the course renders as 100% complete ("Certified" after
  // a single lesson).
  const serverProgress = enrollment
    ? Math.min(1, Math.max(0, enrollment.progress / 100))
    : 0;
  const progress = Math.max(localProgress, serverProgress);

  return { course, modules, enrollment, progress, lessons: flat };
}

/**
 * Load the full player tree for one course, scoped to the caller's tenant + own
 * enrollment (both via RLS + the verified session), reflecting locally-queued
 * completions. Returns the standard {tree, loading, backendPending, error,
 * refetch} shape the screens consume.
 */
export function useCourseTree(courseId: string | undefined): UseCourseTreeResult {
  const { user } = useAuth();
  const userId = user?.userId;
  const [tree, setTree] = useState<CourseTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setBackendPending(false);

    // The completed-lesson set is LOCAL-first, so it works even with no backend.
    let completedLessonIds: Set<string>;
    try {
      completedLessonIds = await completionQueue.completedLessonIds(courseId);
    } catch {
      // A missing native store must never blank the screen — treat as none-known.
      completedLessonIds = new Set<string>();
    }

    if (!isSupabaseConfigured) {
      setBackendPending(true);
      setTree(null);
      setLoading(false);
      return;
    }

    try {
      // All RLS-scoped: no tenant_id filter is sent. The server constrains every
      // row to the caller's tenant; the enrollment read narrows to the caller's
      // own user_id (owner-pinned by policy for workers regardless).
      const [courseRes, moduleRes, lessonRes, enrollRes] = await Promise.all([
        supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
        supabase.from('modules').select('*').eq('course_id', courseId),
        supabase.from('lessons').select('*').eq('course_id', courseId),
        supabase
          .from('enrollments')
          .select('*')
          .eq('course_id', courseId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const firstError =
        courseRes.error ?? moduleRes.error ?? lessonRes.error ?? enrollRes.error;
      if (firstError) throw new Error(firstError.message);

      if (!courseRes.data) {
        // Not found within this tenant (RLS) — surface a clean empty tree.
        setTree(null);
        setError(null);
        setLoading(false);
        return;
      }

      const built = assembleCourseTree({
        course: courseRowToRecord(courseRes.data),
        moduleRows: moduleRes.data ?? [],
        lessonRows: lessonRes.data ?? [],
        enrollment: enrollRes.data ? enrollmentRowToRecord(enrollRes.data) : null,
        completedLessonIds,
      });
      setTree(built);
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        setBackendPending(true);
        setTree(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load course');
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable identity so callers can safely depend on `refetch` (e.g. in a
  // focus-effect) without re-subscribing on every render.
  const refetch = useCallback(() => void load(), [load]);

  return { tree, loading, backendPending, error, refetch };
}

// ---------------------------------------------------------------------------
// Single-lesson load (the player)
// ---------------------------------------------------------------------------

/** A single lesson as the player renders it, with its local completion state. */
export interface LessonDetail {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  description: string;
  kind: LessonKind;
  durationMinutes: number;
  required: boolean;
  /** True when this device has already locally recorded a completion for it. */
  completed: boolean;
}

export interface UseLessonResult {
  lesson: LessonDetail | null;
  loading: boolean;
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

function lessonRowToDetail(row: LessonRow, completed: boolean): LessonDetail {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    title: row.title,
    description: row.description ?? '',
    kind: toLessonKind(row.kind),
    durationMinutes: row.duration_minutes,
    required: row.required,
    completed,
  };
}

/**
 * Load ONE lesson by id, tenant-scoped by RLS (a deep-linked lesson id can only
 * resolve within the caller's tenant), reflecting whether this device has
 * already queued its completion. Identity comes only from the verified session.
 */
export function useLesson(lessonId: string | undefined): UseLessonResult {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!lessonId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setBackendPending(false);

    if (!isSupabaseConfigured) {
      setBackendPending(true);
      setLesson(null);
      setLoading(false);
      return;
    }

    try {
      // RLS-scoped: no tenant_id filter; the server refuses a cross-tenant read.
      const { data, error: readError } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!data) {
        setLesson(null);
        setLoading(false);
        return;
      }

      let completed = false;
      try {
        const done = await completionQueue.completedLessonIds(data.course_id);
        completed = done.has(data.id);
      } catch {
        completed = false;
      }

      setLesson(lessonRowToDetail(data, completed));
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        setBackendPending(true);
        setLesson(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load lesson');
      }
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return { lesson, loading, backendPending, error, refetch };
}
