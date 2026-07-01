/**
 * CourseModel — a downloaded copy of a tenant's CourseRecord.
 *
 * Read-mostly: written by the sync/hydrate path when the catalog is pulled, read
 * by CourseList (offline source of truth). `tags` is stored JSON-encoded because
 * WatermelonDB has no array column; the getter decodes it defensively.
 */
import { Model } from '@nozbe/watermelondb';
import { field, text, readonly } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export class CourseModel extends Model {
  static table = Tables.courses;

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('title') title!: string;
  @text('description') description!: string;
  @text('status') status!: string;
  @text('tags_json') tagsJson!: string;
  @text('category') category?: string;
  @field('duration_minutes') durationMinutes?: number;
  @field('passing_score') passingScore?: number;
  @field('sequence_locked') sequenceLocked?: boolean;
  @field('field_readiness_score') fieldReadinessScore!: number;
  @field('downloaded_at') downloadedAt!: number;
  @readonly @text('server_created_at') serverCreatedAt!: string;
  @text('server_updated_at') serverUpdatedAt!: string;

  /** Decoded tag list. Never throws — a corrupt cache degrades to []. */
  get tags(): string[] {
    try {
      const parsed = JSON.parse(this.tagsJson) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
}
