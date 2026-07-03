/**
 * EnrollmentModel — a downloaded snapshot of the caller's OWN enrollment for
 * one course (progress/status/due date), refreshed on every successful online
 * course-tree load so the course header renders offline.
 *
 * ONE-WAY CACHE: server → device only. The device never edits an enrollment —
 * the server trigger recomputes progress from completion statements — so
 * upserting/replacing rows here can never conflict with anything.
 *
 * UNITS: `progress` is the SERVER's integer percent 0–100, carried verbatim
 * (the api layer divides by 100 at its display boundary).
 */
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export class EnrollmentModel extends Model {
  static table = Tables.enrollments;

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('user_id') userId!: string;
  @text('course_id') courseId!: string;
  @text('status') status!: string;
  @field('progress') progress!: number;
  @text('due_at') dueAt?: string;
  @text('completed_at') completedAt?: string;
  @text('server_created_at') serverCreatedAt!: string;
  @field('downloaded_at') downloadedAt!: number;
}
