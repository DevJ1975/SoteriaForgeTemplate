/**
 * LessonModel — downloaded copy of a LessonRecord (child of a module).
 *
 * `videoId` links video lessons to a VideoModel row for offline playback.
 */
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export class LessonModel extends Model {
  static table = Tables.lessons;

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('course_id') courseId!: string;
  @text('module_id') moduleId!: string;
  @text('kind') kind!: string;
  @text('title') title!: string;
  @text('description') description!: string;
  @field('sequence') sequence!: number;
  @field('duration_minutes') durationMinutes!: number;
  @field('required') required!: boolean;
  @field('passing_score') passingScore?: number;
  @text('video_id') videoId?: string;
  @text('server_updated_at') serverUpdatedAt!: string;
}
