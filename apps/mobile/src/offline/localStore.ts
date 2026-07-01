/**
 * Local store read/hydrate layer — the bridge between the WatermelonDB tables and
 * the shared domain records the UI already speaks.
 *
 * This is the "local store is the source of truth" seam. Two responsibilities:
 *
 *   1. READ: map cached CourseModel rows back into `CourseRecord`s so screens
 *      (CourseList via useCourses) get the EXACT same shape they get from the
 *      network client. Offline and online are indistinguishable to the UI.
 *
 *   2. HYDRATE: upsert freshly-fetched CourseRecords into the cache when online,
 *      so the next offline session has current data. Hydration is a catalog
 *      cache write — it is NOT the append-only outbox and has nothing to do with
 *      completion statements. Upserting a course is safe to repeat (keyed by
 *      server id + tenant) and never conflicts, because course content flows one
 *      way (server → device); the device never edits courses.
 *
 * TENANT ISOLATION: every read and every hydrate is filtered/tagged by the
 * verified `tenantId` (token claim). We never read a course row whose tenant_id
 * differs from the caller's tenant, and never write one under a foreign tenant —
 * so the on-device cache can only ever surface the signed-in tenant's catalog.
 */
import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { CourseRecord } from '@soteria-forge/shared';
import { database as defaultDatabase } from '../db';
import { Tables } from '../db/schema';
import type { CourseModel } from '../db/models';

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

export class LocalCourseStore {
  constructor(private readonly db: Database = defaultDatabase) {}

  private collection() {
    return this.db.get<CourseModel>(Tables.courses);
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
    });
  }
}

/** App-wide local course store bound to the singleton DB. */
export const localCourseStore = new LocalCourseStore();
