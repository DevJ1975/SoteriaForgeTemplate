/**
 * Local store read/hydrate layer — the bridge between the WatermelonDB tables and
 * the shared domain records the UI already speaks.
 *
 * This is the "local store is the source of truth" seam. Two responsibilities:
 *
 *   1. READ: map cached rows back into the EXACT shapes the api layer's hooks
 *      consume (`CourseRecord`s for the list; `ModuleRowLike`/`LessonRowLike` +
 *      an `EnrollmentRecord` snapshot for the course tree). Offline and online
 *      are indistinguishable to the UI.
 *
 *   2. HYDRATE: upsert freshly-fetched data into the cache when online, so the
 *      next offline session has current data. Hydration is a catalog cache
 *      write — it is NOT the append-only outbox and has nothing to do with
 *      completion statements. Course content flows ONE WAY (server → device):
 *      the device never edits courses/modules/lessons/enrollments, so upserts
 *      (and replace-by-course deletes of rows removed server-side) can never
 *      conflict with anything.
 *
 * TENANT ISOLATION: every read and every hydrate is filtered/tagged by the
 * verified `tenantId` (token claim). We never read a course row whose tenant_id
 * differs from the caller's tenant, and never write one under a foreign tenant —
 * so the on-device cache can only ever surface the signed-in tenant's catalog.
 * Enrollment snapshots are additionally keyed by the verified `userId`, so one
 * identity's progress can never render as another's.
 */
import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { CourseRecord, EnrollmentRecord } from '@soteria-forge/shared';
import { database as defaultDatabase } from '../db';
import { Tables } from '../db/schema';
import type {
  CourseModel,
  EnrollmentModel,
  LessonModel,
  ModuleModel,
} from '../db/models';
// Type-only (erased at compile time — no runtime module cycle): the row-like
// shapes the api layer's assembler consumes, so the offline cache returns
// exactly what the online path feeds it.
import type { LessonRowLike, ModuleRowLike } from '../api/courseTree';

/** Map a cached row → the shared CourseRecord shape the UI consumes. */
export function courseModelToRecord(row: CourseModel): CourseRecord {
  return {
    id: row.serverId,
    tenantId: row.tenantId,
    title: row.title,
    description: row.description,
    status: row.status as CourseRecord['status'],
    tags: row.tags,
    category: row.category,
    durationMinutes: row.durationMinutes,
    passingScore: row.passingScore,
    sequenceLocked: row.sequenceLocked,
    fieldReadinessScore: row.fieldReadinessScore,
    createdAt: row.serverCreatedAt,
    updatedAt: row.serverUpdatedAt,
  };
}

/** Map a cached enrollment snapshot → the shared EnrollmentRecord shape. */
export function enrollmentModelToRecord(row: EnrollmentModel): EnrollmentRecord {
  const status = ['assigned', 'in-progress', 'completed', 'overdue', 'expired'].includes(
    row.status,
  )
    ? (row.status as EnrollmentRecord['status'])
    : 'assigned';
  return {
    id: row.serverId,
    tenantId: row.tenantId,
    userId: row.userId,
    courseId: row.courseId,
    status,
    // SERVER UNITS: integer percent 0–100, cached verbatim.
    progress: row.progress,
    assignedAt: row.serverCreatedAt,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    createdAt: row.serverCreatedAt,
    updatedAt: row.serverCreatedAt,
  };
}

/** The offline course-tree snapshot, shaped for the api layer's assembler. */
export interface CachedCourseTree {
  course: CourseRecord;
  modules: ModuleRowLike[];
  lessons: LessonRowLike[];
  /** The caller's own cached enrollment for this course, if one was snapshotted. */
  enrollment: EnrollmentRecord | null;
}

/** Input to `hydrateCourseTree` — exactly what the online loader has in hand. */
export interface CourseTreeHydrationInput {
  course: CourseRecord;
  modules: ModuleRowLike[];
  lessons: LessonRowLike[];
  enrollment: EnrollmentRecord | null;
}

export class LocalCourseStore {
  constructor(private readonly db: Database = defaultDatabase) {}

  private collection() {
    return this.db.get<CourseModel>(Tables.courses);
  }

  private modules() {
    return this.db.get<ModuleModel>(Tables.modules);
  }

  private lessons() {
    return this.db.get<LessonModel>(Tables.lessons);
  }

  private enrollments() {
    return this.db.get<EnrollmentModel>(Tables.enrollments);
  }

  /**
   * List cached courses for a tenant, as CourseRecords. STRICTLY tenant-scoped:
   * the query filters on tenant_id so a device cache that (defensively) held rows
   * for another tenant could never leak them into this tenant's list.
   */
  async listCourses(tenantId: string): Promise<CourseRecord[]> {
    if (!tenantId) throw new Error('listCourses requires a tenantId (verified token claim).');
    const rows = await this.collection()
      .query(Q.where('tenant_id', tenantId), Q.sortBy('title', Q.asc))
      .fetch();
    return rows.map(courseModelToRecord);
  }

  /** Observable version for reactive screens (updates when the cache changes). */
  observeCourses(tenantId: string) {
    return this.collection()
      .query(Q.where('tenant_id', tenantId), Q.sortBy('title', Q.asc))
      .observe();
  }

  /**
   * Upsert one course row. MUST be called from inside a `db.write` block —
   * shared by hydrateCourses and hydrateCourseTree so both writers apply the
   * exact same mapping.
   */
  private async upsertCourseInWriter(
    tenantId: string,
    rec: CourseRecord,
    now: number,
  ): Promise<void> {
    const existing = await this.collection()
      .query(Q.where('server_id', rec.id), Q.where('tenant_id', tenantId))
      .fetch();
    const apply = (row: CourseModel) => {
      row.serverId = rec.id;
      row.tenantId = rec.tenantId;
      row.title = rec.title;
      row.description = rec.description;
      row.status = rec.status;
      row.tagsJson = JSON.stringify(rec.tags ?? []);
      row.category = rec.category;
      row.durationMinutes = rec.durationMinutes;
      row.passingScore = rec.passingScore;
      row.sequenceLocked = rec.sequenceLocked;
      row.fieldReadinessScore = rec.fieldReadinessScore;
      row.downloadedAt = now;
      row.serverUpdatedAt = rec.updatedAt;
    };
    if (existing[0]) {
      await existing[0].update(apply);
    } else {
      await this.collection().create((row) => {
        apply(row);
        row.serverCreatedAt = rec.createdAt;
      });
    }
  }

  /**
   * Upsert fetched courses into the cache (online hydrate). Keyed by
   * (server id within tenant). Only rows for `tenantId` are touched — a record
   * whose tenantId does not match the scope is refused, so a mis-scoped fetch can
   * never poison another tenant's cache.
   */
  async hydrateCourses(tenantId: string, records: CourseRecord[]): Promise<void> {
    if (!tenantId) throw new Error('hydrateCourses requires a tenantId (verified token claim).');
    const now = Date.now();
    await this.db.write(async () => {
      for (const rec of records) {
        if (rec.tenantId !== tenantId) {
          // Defense in depth: never cache a record outside the caller's tenant.
          continue;
        }
        await this.upsertCourseInWriter(tenantId, rec, now);
      }
    });
  }

  /**
   * Snapshot ONE course's full player tree (course + modules + lessons incl.
   * content + the caller's own enrollment) into the cache, on a successful
   * online course-tree load — so the whole course opens, renders, and (for
   * quizzes) scores fully offline.
   *
   * REPLACE-BY-COURSE semantics for modules/lessons: rows that no longer exist
   * server-side are deleted from the cache (otherwise a lesson deleted by the
   * console would linger offline and skew the progress denominator). This is a
   * one-way catalog cache — deleting from it never touches the append-only
   * outbox. The enrollment snapshot is keyed by the VERIFIED userId; a null
   * enrollment clears any stale snapshot for that course+user.
   */
  async hydrateCourseTree(
    tenantId: string,
    userId: string,
    input: CourseTreeHydrationInput,
  ): Promise<void> {
    if (!tenantId || !userId) {
      throw new Error('hydrateCourseTree requires tenantId + userId (verified session).');
    }
    // Defense in depth: never cache a tree outside the caller's tenant.
    if (input.course.tenantId !== tenantId) return;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const courseId = input.course.id;

    await this.db.write(async () => {
      await this.upsertCourseInWriter(tenantId, input.course, now);

      // ── Modules (upsert + delete-removed) ──────────────────────────────
      const existingModules = await this.modules()
        .query(Q.where('tenant_id', tenantId), Q.where('course_id', courseId))
        .fetch();
      const modulesByServerId = new Map(existingModules.map((m) => [m.serverId, m]));
      const keptModuleIds = new Set<string>();
      for (const m of input.modules) {
        keptModuleIds.add(m.id);
        const apply = (row: ModuleModel) => {
          row.serverId = m.id;
          row.tenantId = tenantId;
          row.courseId = m.course_id;
          row.title = m.title;
          row.description = m.description ?? undefined;
          row.sequence = m.sequence;
          // The server rows carry no updated_at; record the snapshot time.
          row.serverUpdatedAt = nowIso;
        };
        const existing = modulesByServerId.get(m.id);
        if (existing) await existing.update(apply);
        else await this.modules().create(apply);
      }
      for (const m of existingModules) {
        if (!keptModuleIds.has(m.serverId)) await m.destroyPermanently();
      }

      // ── Lessons (upsert + delete-removed; content cached as JSON) ──────
      const existingLessons = await this.lessons()
        .query(Q.where('tenant_id', tenantId), Q.where('course_id', courseId))
        .fetch();
      const lessonsByServerId = new Map(existingLessons.map((l) => [l.serverId, l]));
      const keptLessonIds = new Set<string>();
      for (const l of input.lessons) {
        keptLessonIds.add(l.id);
        const apply = (row: LessonModel) => {
          row.serverId = l.id;
          row.tenantId = tenantId;
          row.courseId = l.course_id;
          row.moduleId = l.module_id;
          row.kind = l.kind;
          row.title = l.title;
          row.description = l.description ?? '';
          row.sequence = l.sequence;
          row.durationMinutes = l.duration_minutes;
          row.required = l.required;
          row.passingScore = l.passing_score ?? undefined;
          row.contentJson = l.content === undefined ? undefined : JSON.stringify(l.content);
          row.serverUpdatedAt = nowIso;
        };
        const existing = lessonsByServerId.get(l.id);
        if (existing) await existing.update(apply);
        else await this.lessons().create(apply);
      }
      for (const l of existingLessons) {
        if (!keptLessonIds.has(l.serverId)) await l.destroyPermanently();
      }

      // ── Enrollment snapshot (the caller's own, or clear a stale one) ───
      const existingEnrollments = await this.enrollments()
        .query(
          Q.where('tenant_id', tenantId),
          Q.where('course_id', courseId),
          Q.where('user_id', userId),
        )
        .fetch();
      const enrollment =
        input.enrollment && input.enrollment.userId === userId ? input.enrollment : null;
      if (enrollment) {
        const apply = (row: EnrollmentModel) => {
          row.serverId = enrollment.id;
          row.tenantId = tenantId;
          row.userId = userId;
          row.courseId = enrollment.courseId;
          row.status = enrollment.status;
          row.progress = enrollment.progress;
          row.dueAt = enrollment.dueAt;
          row.completedAt = enrollment.completedAt;
          row.serverCreatedAt = enrollment.createdAt;
          row.downloadedAt = now;
        };
        if (existingEnrollments[0]) await existingEnrollments[0].update(apply);
        else await this.enrollments().create(apply);
        // Defensive dedupe: one snapshot per (course, user).
        for (const extra of existingEnrollments.slice(1)) await extra.destroyPermanently();
      } else {
        for (const row of existingEnrollments) await row.destroyPermanently();
      }
    });
  }

  /**
   * Read ONE course's cached player tree for the verified caller, or null when
   * the course was never snapshotted. Shapes match the online loader exactly,
   * so `assembleCourseTree` serves both paths.
   */
  async readCourseTree(
    tenantId: string,
    courseId: string,
    userId: string,
  ): Promise<CachedCourseTree | null> {
    if (!tenantId || !userId) {
      throw new Error('readCourseTree requires tenantId + userId (verified session).');
    }
    const courseRows = await this.collection()
      .query(Q.where('tenant_id', tenantId), Q.where('server_id', courseId))
      .fetch();
    const courseRow = courseRows[0];
    if (!courseRow) return null;

    const [moduleRows, lessonRows, enrollmentRows] = await Promise.all([
      this.modules()
        .query(Q.where('tenant_id', tenantId), Q.where('course_id', courseId))
        .fetch(),
      this.lessons()
        .query(Q.where('tenant_id', tenantId), Q.where('course_id', courseId))
        .fetch(),
      this.enrollments()
        .query(
          Q.where('tenant_id', tenantId),
          Q.where('course_id', courseId),
          Q.where('user_id', userId),
        )
        .fetch(),
    ]);

    return {
      course: courseModelToRecord(courseRow),
      modules: moduleRows.map(moduleModelToRowLike),
      lessons: lessonRows.map(lessonModelToRowLike),
      enrollment: enrollmentRows[0] ? enrollmentModelToRecord(enrollmentRows[0]) : null,
    };
  }

  /** Read ONE cached lesson by its server id (tenant-scoped), or null. */
  async getLesson(tenantId: string, lessonId: string): Promise<LessonRowLike | null> {
    if (!tenantId) throw new Error('getLesson requires a tenantId (verified token claim).');
    const rows = await this.lessons()
      .query(Q.where('tenant_id', tenantId), Q.where('server_id', lessonId))
      .fetch();
    return rows[0] ? lessonModelToRowLike(rows[0]) : null;
  }
}

/** Map a cached module row → the assembler's ModuleRowLike shape. */
function moduleModelToRowLike(row: ModuleModel): ModuleRowLike {
  return {
    id: row.serverId,
    course_id: row.courseId,
    title: row.title,
    description: row.description ?? null,
    sequence: row.sequence,
  };
}

/** Map a cached lesson row → the assembler's LessonRowLike shape. */
function lessonModelToRowLike(row: LessonModel): LessonRowLike {
  return {
    id: row.serverId,
    course_id: row.courseId,
    module_id: row.moduleId,
    title: row.title,
    description: row.description ?? null,
    kind: row.kind,
    sequence: row.sequence,
    duration_minutes: row.durationMinutes,
    required: row.required,
    passing_score: row.passingScore ?? null,
    content: row.content,
  };
}

/** App-wide local course store bound to the singleton DB. */
export const localCourseStore = new LocalCourseStore();
