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
 *   5. the set of lesson ids the caller has completed — the UNION of the local
 *      append-only outbox (so a lesson shows as done the instant its completion
 *      is enqueued, even fully offline and before sync) and the caller's own
 *      `completion_statements` rows on the server (so completions synced from
 *      ANOTHER device render here too).
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
 * The completed-lesson set starts from the LOCAL WatermelonDB outbox via
 * `completionQueue.completedLessonIds(userId, courseId)` (identity-fenced), so
 * the UI is correct offline; the server union is display-only and never a
 * security boundary.
 *
 * OFFLINE: on every successful online load the whole tree (course + modules +
 * lessons incl. content + the caller's own enrollment) is snapshotted into the
 * local store; when disconnected — or when a nominally-online read fails — the
 * hooks assemble from that snapshot instead, so a downloaded course opens,
 * renders, and records completions with no connectivity.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  CourseRecord,
  EnrollmentRecord,
  LessonKind,
} from '@soteria-forge/shared';
import type { Tables } from '@soteria-forge/shared/supabase';
import { useAuth } from '../auth/AuthProvider';
import {
  completionQueue,
  COMPLETION_VERB_IDS,
  localCourseStore,
  useConnectivityOptional,
} from '../offline';
import { supabase, isSupabaseConfigured } from '../supabase';
import { BackendNotConfiguredError } from './dataClient';
import { parseLessonContent, type LessonContent } from './lessonContent';

type CourseRow = Tables<'courses'>;
type EnrollmentRow = Tables<'enrollments'>;

/**
 * The minimal module/lesson shapes the tree assembly + lesson detail need.
 * Both the LIVE server rows (`Tables<'modules'|'lessons'>`) and the offline
 * cache's snapshots (localStore) satisfy these structurally, so the online and
 * offline paths share one assembler and one detail mapper.
 */
export interface ModuleRowLike {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  sequence: number;
}

export interface LessonRowLike {
  id: string;
  course_id: string;
  module_id: string;
  title: string;
  description: string | null;
  kind: string;
  sequence: number;
  duration_minutes: number;
  required: boolean;
  passing_score: number | null;
  /** Raw `lessons.content` value (jsonb online / decoded cache offline). */
  content: unknown;
}

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
  /** True when the caller is known (locally or server-side) to have completed it. */
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
  moduleRows: ModuleRowLike[];
  lessonRows: LessonRowLike[];
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
 * The caller's OWN server-recorded completed lesson ids for one course — the
 * cross-device half of the completed set (a completion synced from another
 * device never appears in this device's local outbox).
 *
 * RLS-scoped: the select carries no tenant filter and can only ever return the
 * caller's own tenant's rows; the `user_id`/course narrowing are convenience
 * filters (a supervisor can read teammates' statements by policy — this hook
 * must still only render the CALLER's own), never the security boundary. The
 * verb set mirrors the migration-12 progress trigger exactly (completed OR
 * passed; failed never counts).
 */
async function fetchServerCompletedLessonIds(
  courseId: string,
  userId: string,
): Promise<Set<string>> {
  const done = new Set<string>();
  const { data, error } = await supabase
    .from('completion_statements')
    .select('verb, context')
    .eq('user_id', userId)
    // JSON-path filter; PostgREST resolves context->>course_id server-side.
    .filter('context->>course_id', 'eq', courseId);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const verb = row.verb as { id?: unknown } | null;
    const verbId = typeof verb?.id === 'string' ? verb.id : undefined;
    if (!verbId || !COMPLETION_VERB_IDS.has(verbId)) continue;
    const ctx = row.context as { lesson_id?: unknown } | null;
    const lessonId = typeof ctx?.lesson_id === 'string' ? ctx.lesson_id : undefined;
    if (lessonId) done.add(lessonId);
  }
  return done;
}

/**
 * Load the full player tree for one course, scoped to the caller's tenant + own
 * enrollment (both via RLS + the verified session), reflecting locally-queued
 * AND server-synced completions. Returns the standard {tree, loading,
 * backendPending, error, refetch} shape the screens consume.
 */
export function useCourseTree(courseId: string | undefined): UseCourseTreeResult {
  const { user } = useAuth();
  const userId = user?.userId;
  const tenantId = user?.tenantId;
  const { isOnline } = useConnectivityOptional();
  const [tree, setTree] = useState<CourseTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId || !userId || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setBackendPending(false);

    // The completed-lesson set is LOCAL-first, so it works even with no backend.
    // Scoped to the CURRENT session's user id so one identity's completions can
    // never render as another's on a shared device.
    let completedLessonIds: Set<string>;
    try {
      completedLessonIds = await completionQueue.completedLessonIds(userId, courseId);
    } catch {
      // A missing native store must never blank the screen — treat as none-known.
      completedLessonIds = new Set<string>();
    }

    // Assemble the tree from the offline snapshot (hydrated on a previous
    // online load). Shared by the offline path and the network-failure
    // fallback. Returns false when nothing is cached for this course.
    const loadFromCache = async (): Promise<boolean> => {
      try {
        const cached = await localCourseStore.readCourseTree(tenantId, courseId, userId);
        if (!cached) return false;
        setTree(
          assembleCourseTree({
            course: cached.course,
            moduleRows: cached.modules,
            lessonRows: cached.lessons,
            enrollment: cached.enrollment,
            completedLessonIds,
          }),
        );
        return true;
      } catch {
        return false;
      }
    };

    // OFFLINE: the local snapshot is the source of truth — never hit the
    // network (same graceful pattern useCourses uses).
    if (!isOnline) {
      const hit = await loadFromCache();
      if (!hit) {
        setTree(null);
        setError(
          'This course isn’t available offline yet. Reconnect once to download it.',
        );
      }
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      // Backend not wired: any earlier snapshot still opens; otherwise show
      // the explanatory pending state.
      const hit = await loadFromCache();
      setBackendPending(!hit);
      if (!hit) setTree(null);
      setLoading(false);
      return;
    }

    try {
      // All RLS-scoped: no tenant_id filter is sent. The server constrains every
      // row to the caller's tenant; the enrollment read narrows to the caller's
      // own user_id (owner-pinned by policy for workers regardless). The
      // server-completions read is failure-tolerant (`.catch` → empty set): the
      // cross-device union is an enhancement and must never block course open.
      const [courseRes, moduleRes, lessonRes, enrollRes, serverCompleted] =
        await Promise.all([
          supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
          supabase.from('modules').select('*').eq('course_id', courseId),
          supabase.from('lessons').select('*').eq('course_id', courseId),
          supabase
            .from('enrollments')
            .select('*')
            .eq('course_id', courseId)
            .eq('user_id', userId)
            .maybeSingle(),
          fetchServerCompletedLessonIds(courseId, userId).catch(
            () => new Set<string>(),
          ),
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

      // UNION local ∪ server: a completion queued on this device shows before
      // it ever syncs, and one synced from another device shows here too.
      for (const id of serverCompleted) completedLessonIds.add(id);

      const course = courseRowToRecord(courseRes.data);
      const enrollment = enrollRes.data ? enrollmentRowToRecord(enrollRes.data) : null;
      const built = assembleCourseTree({
        course,
        moduleRows: moduleRes.data ?? [],
        lessonRows: lessonRes.data ?? [],
        enrollment,
        completedLessonIds,
      });
      setTree(built);

      // Best-effort offline snapshot for the next disconnected session (course
      // + modules + lessons incl. content + the caller's own enrollment).
      // Never blocks the UI; a hydrate failure must not surface as a load error.
      void localCourseStore
        .hydrateCourseTree(tenantId, userId, {
          course,
          modules: moduleRes.data ?? [],
          lessons: lessonRes.data ?? [],
          enrollment,
        })
        .catch(() => {});
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        const hit = await loadFromCache();
        setBackendPending(!hit);
        if (!hit) setTree(null);
      } else {
        // Transient network failure while nominally online: fall back to the
        // offline snapshot instead of blanking the course; only surface an
        // error when nothing is cached.
        const hit = await loadFromCache();
        if (!hit) {
          setError(err instanceof Error ? err.message : 'Failed to load course');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, userId, tenantId, isOnline]);

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
  /** True when the caller is known (locally or server-side) to have completed it. */
  completed: boolean;
  /** Parsed `lessons.content` (body text / quiz questions), safely degraded. */
  content: LessonContent;
  /** Row-level pass threshold (`lessons.passing_score`), when authored. */
  passingScore?: number;
}

export interface UseLessonResult {
  lesson: LessonDetail | null;
  loading: boolean;
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

function lessonRowToDetail(row: LessonRowLike, completed: boolean): LessonDetail {
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
    // Defensive parse: absent/{}-default/malformed content degrades to "no
    // renderable content" and the player falls back to mark-complete.
    content: parseLessonContent(row.content),
    passingScore: row.passing_score ?? undefined,
  };
}

/**
 * Load ONE lesson by id — tenant-scoped by RLS online (a deep-linked lesson id
 * can only resolve within the caller's tenant), from the offline snapshot when
 * disconnected (the cache is tenant-tagged with the verified claim). Identity
 * comes only from the verified session.
 */
export function useLesson(lessonId: string | undefined): UseLessonResult {
  const { user } = useAuth();
  const userId = user?.userId;
  const tenantId = user?.tenantId;
  const { isOnline } = useConnectivityOptional();
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

    // Locally-known completion first (identity-fenced to the session user);
    // then, only when reachable, the caller's own server statements
    // (cross-device). Failure-tolerant at every step.
    const resolveCompleted = async (row: LessonRowLike): Promise<boolean> => {
      let completed = false;
      try {
        const done = userId
          ? await completionQueue.completedLessonIds(userId, row.course_id)
          : new Set<string>();
        completed = done.has(row.id);
      } catch {
        completed = false;
      }
      if (!completed && userId && isOnline && isSupabaseConfigured) {
        try {
          const server = await fetchServerCompletedLessonIds(row.course_id, userId);
          completed = server.has(row.id);
        } catch {
          // keep the local answer
        }
      }
      return completed;
    };

    // Serve the lesson from the offline snapshot (hydrated by a previous
    // online course open). Returns false when it was never cached.
    const loadFromCache = async (): Promise<boolean> => {
      if (!tenantId) return false;
      try {
        const cached = await localCourseStore.getLesson(tenantId, lessonId);
        if (!cached) return false;
        setLesson(lessonRowToDetail(cached, await resolveCompleted(cached)));
        return true;
      } catch {
        return false;
      }
    };

    // OFFLINE: local snapshot or a clear explanation — never a network call.
    if (!isOnline) {
      const hit = await loadFromCache();
      if (!hit) {
        setLesson(null);
        setError(
          'This lesson isn’t available offline yet. Reconnect once to download it.',
        );
      }
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      const hit = await loadFromCache();
      setBackendPending(!hit);
      if (!hit) setLesson(null);
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

      setLesson(lessonRowToDetail(data, await resolveCompleted(data)));
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        const hit = await loadFromCache();
        setBackendPending(!hit);
        if (!hit) setLesson(null);
      } else {
        // Transient failure while nominally online → offline snapshot; only
        // surface an error when nothing is cached.
        const hit = await loadFromCache();
        if (!hit) {
          setError(err instanceof Error ? err.message : 'Failed to load lesson');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [lessonId, userId, tenantId, isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return { lesson, loading, backendPending, error, refetch };
}
