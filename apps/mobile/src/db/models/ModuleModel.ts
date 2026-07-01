/**
 * ModuleModel — downloaded copy of a ModuleRecord (child of a course).
 */
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export class ModuleModel extends Model {
  static table = Tables.modules;

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('course_id') courseId!: string;
  @text('title') title!: string;
  @text('description') description?: string;
  @field('sequence') sequence!: number;
  @field('sequence_locked') sequenceLocked?: boolean;
  @field('minimum_seat_time_minutes') minimumSeatTimeMinutes?: number;
  @text('server_updated_at') serverUpdatedAt!: string;
}
