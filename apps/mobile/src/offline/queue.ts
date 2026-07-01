/**
 * Append-only completion-statement queue (the local xAPI outbox writer).
 *
 * CONTRACT (Phase 5 invariants this file owns):
 *   - Statements are xAPI-style with a CLIENT-GENERATED UUID. We build them with
 *     the shared `createCompletionStatement`, which mints (or validates) that
 *     UUID — the same helper the whole platform uses, so the id format is
 *     identical everywhere.
 *   - The queue is APPEND-ONLY. This module NEVER updates or deletes an existing
 *     completion_statements row. It only inserts. The sole later mutation to a
 *     row (flipping `synced`) happens in sync.ts, and only that flag.
 *   - Enqueue is IDEMPOTENT by UUID. If a row with the same `statement_id`
 *     already exists (e.g. a double-tap, a resumed quiz re-submitting, a retry
 *     after a crash mid-write), we DO NOT insert a second copy — we return the
 *     existing row. Combined with the server also deduping on that UUID, a
 *     statement can be created, queued, and synced any number of times and end
 *     up exactly once.
 *   - Nothing here blocks on the network. Writing to SQLite is the whole job;
 *     upload is sync.ts's problem, later, when connectivity allows.
 *
 * WHY NO CONFLICT RESOLUTION: because the id is the dedupe key and rows are
 * immutable, there is no "same statement, two values" situation to reconcile. A
 * worker can complete an entire course offline — each completion is one append —
 * and on reconnect the outbox drains cleanly with the server discarding any
 * duplicate UUIDs. See sync.ts.
 */
import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import {
  createCompletionStatement,
  xapiVerbs,
  type XapiStatement,
  type XapiActor,
  type XapiVerb,
  type XapiObject,
  type XapiResult,
} from '@soteria-forge/shared';
import { database as defaultDatabase } from '../db';
import { Tables } from '../db/schema';
import type { CompletionStatementModel } from '../db/models';

/**
 * Input to enqueue a completion. Mirrors the shared builder input but requires a
 * `userId` (for the local user_id column / statements-by-user reads) and carries
 * the tenantId that MUST come from the verified token claim — never request
 * input. `id` is optional: omit it to mint a fresh UUID, or pass an existing one
 * to make the enqueue idempotent for a known attempt (e.g. quiz re-submit).
 */
export interface EnqueueCompletionInput {
  /** Existing client UUID to reuse (idempotency), or omit to mint a fresh one. */
  id?: string;
  /** Verified tenant claim. NEVER sourced from user input. */
  tenantId: string;
  /** Signed-in user's Cognito sub (for local statements-by-user reads). */
  userId: string;
  actor: XapiActor;
  verb: XapiVerb;
  object: XapiObject;
  result?: XapiResult;
  context?: Record<string, unknown>;
  /** ISO-8601 ACTIVITY time. Defaults to now. Never used as a dedupe key. */
  timestamp?: string;
}

/**
 * The flat column payload for a completion_statements row, derived purely from a
 * finished XapiStatement. Exported + pure so the idempotency/shape logic is unit
 * testable WITHOUT a native SQLite adapter (see __tests__/queue.test.ts).
 */
export interface CompletionRowFields {
  statement_id: string;
  tenant_id: string;
  user_id: string;
  verb: string;
  object_id: string;
  statement_json: string;
  result_json: string | null;
  timestamp: string;
  synced: boolean;
  synced_at: number | null;
  attempt_count: number;
  last_attempt_at: number | null;
  last_error: string | null;
  enqueued_at: number;
}

/**
 * Pure: project a finished statement into its row columns. No I/O. `userId` is
 * passed separately because it is a local-only indexing column, not part of the
 * canonical xAPI payload (the actor identifies the user in xAPI terms).
 */
export function toCompletionRow(
  statement: XapiStatement,
  userId: string,
  now: number = Date.now(),
): CompletionRowFields {
  return {
    statement_id: statement.id,
    tenant_id: statement.tenantId,
    user_id: userId,
    verb: statement.verb.id,
    object_id: statement.object.id,
    statement_json: JSON.stringify(statement),
    result_json: statement.result ? JSON.stringify(statement.result) : null,
    timestamp: statement.timestamp,
    synced: false,
    synced_at: null,
    attempt_count: 0,
    last_attempt_at: null,
    last_error: null,
    enqueued_at: now,
  };
}

/**
 * The queue writer. Bound to a Database (defaults to the app singleton; tests
 * can inject a fake). All mutations funnel through here so "append-only" is
 * enforced in exactly one place.
 */
export class CompletionQueue {
  constructor(private readonly db: Database = defaultDatabase) {}

  private get collection() {
    return this.db.get<CompletionStatementModel>(Tables.completionStatements);
  }

  /**
   * Look up an already-queued row by its client UUID, or null. This is what
   * makes enqueue idempotent: we check before inserting.
   */
  async findByStatementId(statementId: string): Promise<CompletionStatementModel | null> {
    const matches = await this.collection
      .query(Q.where('statement_id', statementId))
      .fetch();
    return matches[0] ?? null;
  }

  /**
   * Append a completion statement to the outbox (idempotent by UUID).
   *
   * Steps:
   *   1. Build the canonical XapiStatement via the SHARED builder → stable UUID.
   *   2. If a row with that UUID already exists, return it unchanged (no insert,
   *      no mutation — append-only + idempotent).
   *   3. Otherwise insert one immutable row with synced=false.
   *
   * This never touches the network and never mutates an existing row.
   */
  async enqueue(input: EnqueueCompletionInput): Promise<CompletionStatementModel> {
    // 1. Build with the shared builder (mints/validates the client UUID).
    const statement = createCompletionStatement({
      id: input.id,
      tenantId: input.tenantId,
      actor: input.actor,
      verb: input.verb,
      object: input.object,
      result: input.result,
      context: input.context,
      timestamp: input.timestamp,
    });

    // 2. Idempotency guard — same UUID already queued? Return it, do not re-insert.
    const existing = await this.findByStatementId(statement.id);
    if (existing) return existing;

    // 3. Append exactly one immutable row.
    const fields = toCompletionRow(statement, input.userId);
    let created!: CompletionStatementModel;
    await this.db.write(async () => {
      created = await this.collection.create((row) => {
        row.statementId = fields.statement_id;
        row.tenantId = fields.tenant_id;
        row.userId = fields.user_id;
        row.verb = fields.verb;
        row.objectId = fields.object_id;
        row.statementJson = fields.statement_json;
        row.resultJson = fields.result_json ?? undefined;
        row.timestamp = fields.timestamp;
        row.synced = fields.synced;
        row.attemptCount = fields.attempt_count;
        row.enqueuedAt = fields.enqueued_at;
      });
    });
    return created;
  }

  /** All not-yet-synced rows, oldest first (append order) — sync.ts drains these. */
  async pending(): Promise<CompletionStatementModel[]> {
    return this.collection
      .query(Q.where('synced', false), Q.sortBy('enqueued_at', Q.asc))
      .fetch();
  }

  /**
   * The set of lesson ids this device has locally recorded as COMPLETED, read
   * from the append-only outbox (synced or not) so the UI reflects a completion
   * the instant it is enqueued — before it ever reaches the server.
   *
   * A completion is any queued statement whose verb is `completed` and whose
   * `context.lesson_id` is set (the same shape the server progress trigger reads).
   * When `courseId` is given, only completions in that course are returned. This
   * is READ-ONLY: it never mutates a row, preserving the append-only contract.
   *
   * The statement's own `tenant_id`/`context` are trusted here only for local
   * display — authorization is still Postgres RLS on the server; a mis-scoped row
   * could never be inserted server-side in the first place.
   */
  async completedLessonIds(courseId?: string): Promise<Set<string>> {
    const rows = await this.collection.query().fetch();
    const completed = new Set<string>();
    for (const row of rows) {
      let statement: XapiStatement;
      try {
        statement = row.statement;
      } catch {
        // A corrupt local JSON payload must not blank the whole list — skip it.
        continue;
      }
      if (statement.verb?.id !== xapiVerbs.completed) continue;
      const ctx = (statement.context ?? {}) as {
        course_id?: unknown;
        lesson_id?: unknown;
      };
      const lessonId = typeof ctx.lesson_id === 'string' ? ctx.lesson_id : undefined;
      if (!lessonId) continue;
      if (courseId && ctx.course_id !== courseId) continue;
      completed.add(lessonId);
    }
    return completed;
  }

  /** Count of unsynced rows — drives the OfflineBanner's pending badge. */
  async pendingCount(): Promise<number> {
    return this.collection.query(Q.where('synced', false)).fetchCount();
  }

  /** Observable count of unsynced rows for reactive UI (no polling). */
  observePendingCount() {
    return this.collection.query(Q.where('synced', false)).observeCount();
  }
}

/** App-wide queue bound to the singleton database. */
export const completionQueue = new CompletionQueue();
