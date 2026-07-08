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
import { Tables } from '../db/schema';
import type { CompletionStatementModel } from '../db/models';

// NOTE: this module is deliberately NODE-SAFE (no import of `../db`, whose
// SQLite adapter needs a native runtime): the Database is INJECTED. The
// app-wide `completionQueue` singleton binding lives in `./singletons.ts`;
// unit tests construct a CompletionQueue over an in-memory fake instead.

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
 * Terminal marker the sync engine writes to `last_error` when the server
 * PERMANENTLY refuses a statement (RLS refusal / malformed payload — see
 * sync.ts `outcomeForPostgrestCode`). Rows carrying it are KEPT in the store
 * (append-only bookkeeping, inspectable for audit) but excluded from every
 * pending read, so a row the server will never accept stops re-uploading
 * forever. Transient failures record 'retryable' instead and stay pending.
 */
export const REJECTED_MARKER = 'rejected';

/**
 * Verb IRIs that mark a lesson DONE, exactly mirroring the server progress
 * trigger (migration 12): the canonical `completed` OR `passed`, matched
 * exactly. `failed` is deliberately excluded — a failed quiz attempt is
 * recorded but never counts toward completion. Keep this set and the trigger
 * in lockstep.
 */
export const COMPLETION_VERB_IDS: ReadonlySet<string> = new Set([
  xapiVerbs.completed,
  xapiVerbs.passed,
]);

/**
 * Display status of a locally-recorded completion, for the learner's "My
 * training record" screen. Derived purely from the row's local bookkeeping —
 * never sent to or read from the server:
 *   - 'synced'          — the server has accepted this statement (synced=true).
 *   - 'needs-attention' — the server PERMANENTLY refused it (last_error ===
 *                         REJECTED_MARKER); it will not auto-retry and needs a
 *                         manual retry (see `CompletionQueue.retry`).
 *   - 'waiting'         — anything else (fresh, or a transient failure still in
 *                         the backoff/retry loop): it will sync on its own.
 */
export type CompletionRecordStatus = 'synced' | 'waiting' | 'needs-attention';

/**
 * Display-friendly, framework-free projection of ONE outbox row for the training
 * record screen. Intentionally free of WatermelonDB/React types so the screen
 * (mobile agent) and this read model share a plain data contract. The
 * `statementId` is the client UUID (stable across retries — the idempotency
 * key); `verbId`/`objectId`/`timestamp` come from the DENORMALIZED columns
 * (written once at enqueue) so they survive even if the JSON payload is corrupt,
 * while `lessonId`/`courseId` are read from the statement context when present.
 */
export interface CompletionRecordEntry {
  /** Client-generated UUID = the statement's stable identity / idempotency key. */
  statementId: string;
  /** The xAPI verb IRI (e.g. `.../completed`). */
  verbId: string;
  /** The xAPI object IRI (the activity the statement is about). */
  objectId: string;
  /** `context.lesson_id`, when the statement carries one. */
  lessonId?: string;
  /** `context.course_id`, when the statement carries one. */
  courseId?: string;
  /** ISO-8601 ACTIVITY time (the moment of completion). */
  timestamp: string;
  /** Sync state for display (see CompletionRecordStatus). */
  status: CompletionRecordStatus;
}

/** The minimal row surface the pure record projection reads. */
interface RecordProjectionSource {
  statementId: string;
  verb: string;
  objectId: string;
  timestamp: string;
  synced: boolean;
  lastError?: string;
  /** Parses the immutable JSON payload; may THROW on a corrupt row. */
  readonly statement: XapiStatement;
}

/**
 * Pure: derive the display status from a row's LOCAL bookkeeping only. Order
 * matters — a synced row is 'synced' regardless of any stale last_error, and the
 * terminal REJECTED_MARKER outranks the transient/fresh "waiting" default.
 */
export function deriveRecordStatus(
  row: Pick<RecordProjectionSource, 'synced' | 'lastError'>,
): CompletionRecordStatus {
  if (row.synced) return 'synced';
  if (row.lastError === REJECTED_MARKER) return 'needs-attention';
  return 'waiting';
}

/**
 * Pure: project one outbox row into a display entry. READ-ONLY (no mutation).
 * `verbId`/`objectId`/`timestamp` come from the denormalized columns so a row
 * with a corrupt JSON payload still renders (with no lesson/course context)
 * rather than being dropped or blanking the whole list.
 */
export function toRecordEntry(row: RecordProjectionSource): CompletionRecordEntry {
  let ctx: { course_id?: unknown; lesson_id?: unknown } = {};
  try {
    ctx = (row.statement.context ?? {}) as { course_id?: unknown; lesson_id?: unknown };
  } catch {
    // Corrupt local JSON — keep the row visible using its denormalized columns.
    ctx = {};
  }
  const lessonId = typeof ctx.lesson_id === 'string' ? ctx.lesson_id : undefined;
  const courseId = typeof ctx.course_id === 'string' ? ctx.course_id : undefined;
  return {
    statementId: row.statementId,
    verbId: row.verb,
    objectId: row.objectId,
    ...(lessonId !== undefined ? { lessonId } : {}),
    ...(courseId !== undefined ? { courseId } : {}),
    timestamp: row.timestamp,
    status: deriveRecordStatus(row),
  };
}

/**
 * Query clauses for "still uploadable" rows: unsynced AND not permanently
 * rejected. The explicit `last_error is null OR last_error != 'rejected'`
 * disjunction is deliberate — a plain not-equals over a nullable column risks
 * excluding fresh rows (whose last_error is null) under SQL null semantics.
 */
function uploadableClauses() {
  return [
    Q.where('synced', false),
    Q.or(Q.where('last_error', null), Q.where('last_error', Q.notEq(REJECTED_MARKER))),
  ];
}

/**
 * The queue writer. Bound to an injected Database (the app binds the SQLite
 * singleton in `./singletons.ts`; tests inject an in-memory fake). All
 * mutations funnel through here so "append-only" is enforced in exactly one
 * place.
 */
export class CompletionQueue {
  constructor(private readonly db: Database) {}

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

  /**
   * All still-uploadable rows, oldest first (append order) — sync.ts drains
   * these. Rows the server permanently rejected (last_error = 'rejected') are
   * EXCLUDED so they stop re-uploading forever; they remain in the store for
   * inspection (append-only bookkeeping — nothing is ever deleted).
   */
  async pending(): Promise<CompletionStatementModel[]> {
    return this.collection
      .query(...uploadableClauses(), Q.sortBy('enqueued_at', Q.asc))
      .fetch();
  }

  /**
   * The set of lesson ids the given user has locally recorded as COMPLETED, read
   * from the append-only outbox (synced or not) so the UI reflects a completion
   * the instant it is enqueued — before it ever reaches the server.
   *
   * IDENTITY FENCE: `userId` is REQUIRED and must be the CURRENT verified
   * session's auth user id. Rows are filtered by their `user_id` column so one
   * user's completions can never render as another's on a shared device (e.g.
   * if a sign-out wipe was ever missed). This mirrors the sync engine's upload
   * fence.
   *
   * A completion is any queued statement whose verb is `completed` OR `passed`
   * (COMPLETION_VERB_IDS — the exact verb set the migration-12 server progress
   * trigger counts; `failed` never counts) and whose `context.lesson_id` is set
   * (the same shape that trigger reads).
   * When `courseId` is given, only completions in that course are returned. This
   * is READ-ONLY: it never mutates a row, preserving the append-only contract.
   *
   * The statement's own `tenant_id`/`context` are trusted here only for local
   * display — authorization is still Postgres RLS on the server; a mis-scoped row
   * could never be inserted server-side in the first place.
   */
  async completedLessonIds(userId: string, courseId?: string): Promise<Set<string>> {
    const completed = new Set<string>();
    if (!userId) return completed; // no verified identity → nothing to show
    const rows = await this.collection.query(Q.where('user_id', userId)).fetch();
    for (const row of rows) {
      let statement: XapiStatement;
      try {
        statement = row.statement;
      } catch {
        // A corrupt local JSON payload must not blank the whole list — skip it.
        continue;
      }
      if (!statement.verb?.id || !COMPLETION_VERB_IDS.has(statement.verb.id)) continue;
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

  /**
   * The signed-in user's FULL completion history for the "My training record"
   * screen — every one of their queued rows (synced, waiting, or needs-attention),
   * mapped to the framework-free {@link CompletionRecordEntry} shape and sorted
   * NEWEST-FIRST by activity timestamp.
   *
   * IDENTITY FENCE: `userId` is REQUIRED and must be the CURRENT verified
   * session's auth user id — rows are filtered by their `user_id` column, exactly
   * like `completedLessonIds`, so one worker's record can never render as
   * another's on a shared device. An empty/absent id returns [] (never
   * "everything").
   *
   * READ-ONLY: this never mutates a row, preserving the append-only contract. It
   * is pure over the injected store, so it is unit-tested against the in-memory
   * fake.
   */
  async recordEntries(userId: string): Promise<CompletionRecordEntry[]> {
    if (!userId) return []; // no verified identity → nothing to show
    const rows = await this.collection.query(Q.where('user_id', userId)).fetch();
    const entries = rows.map((row) => toRecordEntry(row));
    // Newest activity first. ISO-8601 strings sort lexicographically = chrono.
    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return entries;
  }

  /**
   * Observe the signed-in user's outbox rows so a screen can react to enqueue /
   * sync / retry transitions without polling. Emits the current set immediately
   * on subscribe. The caller maps each emission through `recordEntries(userId)`
   * (or `toRecordEntry`) to render. Fenced by `user_id` like `recordEntries`.
   *
   * NOTE: this is the ONE reactive seam that needs the native store's `observe()`;
   * the in-memory test fake does not implement it, so unit tests exercise the
   * pure `recordEntries` path instead. It is still node-safe *code* (no `../db`
   * import) — it only calls a method on the INJECTED collection.
   */
  observeUserRecords(userId: string) {
    return this.collection.query(Q.where('user_id', userId)).observe();
  }

  /**
   * Manually re-arm a stuck row for upload — the action behind the "Retry" button
   * on a NEEDS-ATTENTION (permanently-rejected) statement.
   *
   * This is LOCAL BOOKKEEPING ONLY. It clears `last_error` and resets the attempt
   * counters so the row re-enters the uploadable set (`pending()`), and it NEVER:
   *   - touches the SERVER — the append-only `completion_statements` row is not
   *     mutated, recreated, or deleted; a retry just lets the sync engine POST the
   *     SAME statement again, and the upsert dedupes on the unchanged UUID.
   *   - changes the statement's identity or payload — `statement_id`/`statement_json`
   *     are @readonly, so the client UUID (the idempotency key) is preserved and
   *     the re-upload stays idempotent.
   *   - un-syncs an accepted row — a `synced` row is left untouched (returns false):
   *     you cannot "retry" a statement the server already stored.
   *
   * Operates purely by `statementId`; the caller is responsible for the identity
   * fence (only pass a statementId that belongs to the signed-in user — the
   * training-record hook enforces this by only offering retry on entries it read
   * for the current user). Returns true iff a row was re-armed.
   *
   * AFTER a successful retry the caller must trigger `syncEngine.syncNow()` to
   * attempt the upload immediately (the reactive queue observer also kicks a
   * drain, but calling it explicitly is the responsive path).
   */
  async retry(statementId: string): Promise<boolean> {
    const row = await this.findByStatementId(statementId);
    if (!row) return false;
    if (row.synced) return false; // never un-sync an already-accepted statement
    await this.db.write(async () => {
      await row.update((r) => {
        // Clear the failure marker + reset backoff so pending() picks it up again.
        r.lastError = undefined;
        r.attemptCount = 0;
        r.lastAttemptAt = undefined;
      });
    });
    return true;
  }

  /**
   * Count of rows still awaiting upload — drives the OfflineBanner's pending
   * badge. Permanently-rejected rows are excluded (matching `pending()`): a row
   * that will never sync must not read as "will sync when online" forever.
   */
  async pendingCount(): Promise<number> {
    return this.collection.query(...uploadableClauses()).fetchCount();
  }

  /** Observable count of still-uploadable rows for reactive UI (no polling). */
  observePendingCount() {
    return this.collection.query(...uploadableClauses()).observeCount();
  }
}
