/**
 * QuizStateStore — per-lesson, per-user quiz scratch state (the `quiz_state`
 * table's first and only writer).
 *
 * ROLE IN THE SYNC MODEL: this is the ONE deliberately mutable table in the
 * offline store. It exists so an interrupted quiz RESUMES (answers survive an
 * app kill, fully offline) and so a submission is IDEMPOTENT: the completion
 * statement's client UUID is pinned onto the row BEFORE the statement is
 * enqueued, so a crash or double-tap between "submitted" and "enqueued" re-uses
 * the SAME id — the queue and the server both dedupe on it, and exactly one
 * statement ever exists for one attempt.
 *
 * It is NOT the record of truth: that is the append-only completion_statements
 * outbox. Nothing here is ever uploaded; there is no conflict resolution
 * because this state never leaves the device.
 *
 * A RETAKE after a failed attempt is a NEW attempt and gets a NEW statement id
 * (`resetAttempt` clears the pinned id). Reusing the failed attempt's id would
 * make the server silently discard the retake's `passed` statement — the exact
 * opposite of what idempotency is for. One attempt = one id, forever.
 *
 * TENANT/IDENTITY: rows carry the verified tenantId/userId from the session
 * (never input) and every read filters by user_id, mirroring the outbox's
 * identity fence.
 */
import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import { database as defaultDatabase } from '../db';
import { Tables } from '../db/schema';
import { QuizStateModel, type QuizAnswers, type QuizStatus } from '../db/models';

/** A plain snapshot of the stored state (no live model surface for the UI). */
export interface QuizStateSnapshot {
  status: QuizStatus;
  answers: QuizAnswers;
  /** Recorded integer percent 0–100, present once submitted. */
  score?: number;
  /** The pinned completion-statement UUID, present once submitted. */
  completionStatementId?: string;
}

export interface QuizIdentity {
  /** Verified tenant claim — NEVER sourced from user input. */
  tenantId: string;
  /** Signed-in user's auth id (the session's, never input). */
  userId: string;
  courseId: string;
  lessonId: string;
}

export class QuizStateStore {
  constructor(private readonly db: Database = defaultDatabase) {}

  private get collection() {
    return this.db.get<QuizStateModel>(Tables.quizState);
  }

  private async find(userId: string, lessonId: string): Promise<QuizStateModel | null> {
    const rows = await this.collection
      .query(Q.where('user_id', userId), Q.where('lesson_id', lessonId))
      .fetch();
    return rows[0] ?? null;
  }

  /** Read the caller's state for one lesson, or null when none exists yet. */
  async get(userId: string, lessonId: string): Promise<QuizStateSnapshot | null> {
    const row = await this.find(userId, lessonId);
    if (!row) return null;
    return {
      status: row.status,
      answers: row.answers,
      score: row.score,
      completionStatementId: row.completionStatementId,
    };
  }

  /**
   * Persist in-progress answers (creates the row on first write). Called on
   * every selection so a killed app resumes mid-quiz. A row that is already
   * `submitted` is left untouched — a new attempt must go through
   * `resetAttempt` first, so the pinned statement id can never be clobbered.
   */
  async saveAnswers(identity: QuizIdentity, answers: QuizAnswers): Promise<void> {
    const now = Date.now();
    const existing = await this.find(identity.userId, identity.lessonId);
    await this.db.write(async () => {
      if (existing) {
        if (existing.status === 'submitted') return;
        await existing.update((r) => {
          r.answersJson = JSON.stringify(answers);
          r.updatedAt = now;
        });
        return;
      }
      await this.collection.create((r) => {
        r.tenantId = identity.tenantId;
        r.courseId = identity.courseId;
        r.lessonId = identity.lessonId;
        r.userId = identity.userId;
        r.answersJson = JSON.stringify(answers);
        r.status = 'in-progress';
        r.updatedAt = now;
      });
    });
  }

  /**
   * Record a submission: final answers, the locally-computed score, and — the
   * idempotency pin — the completion statement's client UUID. Call this BEFORE
   * enqueueing the statement: if the app dies in between, the next submit (or
   * the player's repair pass) re-uses the SAME id and the attempt still yields
   * exactly one statement.
   */
  async markSubmitted(
    identity: QuizIdentity,
    params: { answers: QuizAnswers; score: number; statementId: string },
  ): Promise<void> {
    const now = Date.now();
    const existing = await this.find(identity.userId, identity.lessonId);
    await this.db.write(async () => {
      const apply = (r: QuizStateModel) => {
        r.answersJson = JSON.stringify(params.answers);
        r.status = 'submitted';
        r.score = params.score;
        r.completionStatementId = params.statementId;
        r.updatedAt = now;
      };
      if (existing) {
        await existing.update(apply);
        return;
      }
      await this.collection.create((r) => {
        r.tenantId = identity.tenantId;
        r.courseId = identity.courseId;
        r.lessonId = identity.lessonId;
        r.userId = identity.userId;
        apply(r);
      });
    });
  }

  /**
   * Begin a fresh attempt after a failed submission: clears the answers and —
   * deliberately — the pinned statement id, so the next submit mints a NEW
   * UUID. A new attempt is a NEW immutable statement; the failed one stays in
   * the append-only record untouched.
   */
  async resetAttempt(userId: string, lessonId: string): Promise<void> {
    const row = await this.find(userId, lessonId);
    if (!row) return;
    await this.db.write(async () => {
      await row.update((r) => {
        r.answersJson = '{}';
        r.status = 'in-progress';
        r.score = undefined;
        r.completionStatementId = undefined;
        r.updatedAt = Date.now();
      });
    });
  }
}

/** App-wide quiz state store bound to the singleton DB. */
export const quizStateStore = new QuizStateStore();
