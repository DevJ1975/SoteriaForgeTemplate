/**
 * QuizStateModel — per-lesson in-progress quiz scratch state (resume support).
 *
 * This is the ONE mutable, non-append table in the offline store: as a worker
 * answers questions, `answersJson` is updated so the app can resume mid-quiz
 * after a kill. It is NOT the record of truth for completion — when the quiz is
 * finished, the queue emits an immutable completion_statement. `completionStatementId`
 * pins the UUID of that statement so a re-submit reuses the same id and stays
 * idempotent (never enqueues a duplicate).
 */
import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';
import { Tables } from '../schema';

export type QuizAnswers = Record<string, string>;
export type QuizStatus = 'in-progress' | 'submitted';

export class QuizStateModel extends Model {
  static table = Tables.quizState;

  @text('tenant_id') tenantId!: string;
  @text('course_id') courseId!: string;
  @text('lesson_id') lessonId!: string;
  @text('user_id') userId!: string;
  @text('answers_json') answersJson!: string;
  @text('status') status!: QuizStatus;
  @field('score') score?: number;
  @text('completion_statement_id') completionStatementId?: string;
  @field('updated_at') updatedAt!: number;

  /** Decoded answer map. Never throws — corrupt scratch degrades to {}. */
  get answers(): QuizAnswers {
    try {
      const parsed = JSON.parse(this.answersJson) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as QuizAnswers) : {};
    } catch {
      return {};
    }
  }
}
