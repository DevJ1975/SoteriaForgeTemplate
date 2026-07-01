/**
 * WatermelonDB schema for the offline-first learner store.
 *
 * WHY WatermelonDB: it is a lazy, SQLite-backed reactive store built for exactly
 * this shape — a large, mostly-read catalog cached on-device plus a small
 * write-heavy queue that must survive app kills and sync later. Queries are
 * observable, so the UI (CourseList) can bind to the local store and update the
 * instant sync writes land, without ever blocking on the network.
 *
 * The store mirrors the tenant-scoped single-table records from
 * `@soteria-forge/shared` (CourseRecord / ModuleRecord / LessonRecord /
 * VideoAssetRecord) as flat, downloaded copies, PLUS two things the server model
 * does not have:
 *
 *   1. quiz_state       — per-lesson in-progress quiz answers, so a worker can
 *                         resume a partially-answered quiz after the app is
 *                         killed. This is scratch state, freely mutated locally;
 *                         it is NOT the record of truth. The record of truth is a
 *                         completion_statement, emitted once when the quiz is
 *                         finished.
 *
 *   2. completion_statements — the APPEND-ONLY xAPI outbox. Every row is an
 *                         immutable, client-authored xAPI statement keyed by a
 *                         CLIENT-GENERATED UUID (`statement_id`). The queue is
 *                         never mutated except to flip the `synced` flag once the
 *                         server has acked that UUID. Because the id is the
 *                         idempotency key and rows are immutable, re-sending is a
 *                         no-op server-side and there is NO conflict resolution to
 *                         do — ever. See offline/sync.ts.
 *
 * TENANT ISOLATION: every table carries `tenant_id`. Rows are only ever written
 * for the signed-in user's verified tenant (from the token claim, never input),
 * and every read the app issues filters by that tenant. The device store is a
 * cache of ONE tenant's data for ONE user; it never mixes tenants.
 *
 * SCHEMA VERSIONING: bump `version` and add a migration in migrations.ts for any
 * column/table change. WatermelonDB refuses to open a DB whose on-disk version is
 * newer than the code, and runs forward migrations otherwise.
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

/** Table name constants — imported by models so strings never drift. */
export const Tables = {
  courses: 'courses',
  modules: 'modules',
  lessons: 'lessons',
  quizState: 'quiz_state',
  videos: 'videos',
  completionStatements: 'completion_statements',
} as const;

export type TableName = (typeof Tables)[keyof typeof Tables];

/**
 * Current schema version. Bump on any structural change and pair with a
 * migration (see migrations.ts).
 */
export const SCHEMA_VERSION = 1;

export const schema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    // -----------------------------------------------------------------------
    // Downloaded catalog (read-mostly cache of the tenant's published content)
    // -----------------------------------------------------------------------
    tableSchema({
      name: Tables.courses,
      columns: [
        // Server course id (CourseRecord.id). Indexed for lookup by id.
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'status', type: 'string' },
        // JSON-encoded string[] of tags — WatermelonDB has no array column type.
        { name: 'tags_json', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'duration_minutes', type: 'number', isOptional: true },
        { name: 'passing_score', type: 'number', isOptional: true },
        { name: 'sequence_locked', type: 'boolean', isOptional: true },
        { name: 'field_readiness_score', type: 'number' },
        // When this row was downloaded/refreshed locally (ms epoch).
        { name: 'downloaded_at', type: 'number' },
        // Server timestamps, carried verbatim as ISO strings for display/debug.
        { name: 'server_created_at', type: 'string' },
        { name: 'server_updated_at', type: 'string' },
      ],
    }),
    tableSchema({
      name: Tables.modules,
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'course_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'sequence', type: 'number' },
        { name: 'sequence_locked', type: 'boolean', isOptional: true },
        { name: 'minimum_seat_time_minutes', type: 'number', isOptional: true },
        { name: 'server_updated_at', type: 'string' },
      ],
    }),
    tableSchema({
      name: Tables.lessons,
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'course_id', type: 'string', isIndexed: true },
        { name: 'module_id', type: 'string', isIndexed: true },
        { name: 'kind', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'sequence', type: 'number' },
        { name: 'duration_minutes', type: 'number' },
        { name: 'required', type: 'boolean' },
        { name: 'passing_score', type: 'number', isOptional: true },
        // For video lessons — the VideoAsset id this lesson plays.
        { name: 'video_id', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'string' },
      ],
    }),

    // -----------------------------------------------------------------------
    // Per-lesson in-progress quiz scratch state (resume support). Mutable.
    // -----------------------------------------------------------------------
    tableSchema({
      name: Tables.quizState,
      columns: [
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'course_id', type: 'string', isIndexed: true },
        { name: 'lesson_id', type: 'string', isIndexed: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        // JSON map { questionId: response } of answers so far.
        { name: 'answers_json', type: 'string' },
        // 'in-progress' | 'submitted' — once submitted, a completion_statement
        // has been enqueued; this row is retained only for resume/idempotency.
        { name: 'status', type: 'string' },
        { name: 'score', type: 'number', isOptional: true },
        // If this attempt has already produced a queued completion statement,
        // its UUID is recorded here so re-submitting reuses the SAME id and stays
        // idempotent (never enqueues a second statement for one attempt).
        { name: 'completion_statement_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -----------------------------------------------------------------------
    // Downloaded video METADATA + local-file bookkeeping (never the bytes here)
    // -----------------------------------------------------------------------
    tableSchema({
      name: Tables.videos,
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'duration_seconds', type: 'number', isOptional: true },
        { name: 'provider', type: 'string', isOptional: true },
        { name: 'provider_video_id', type: 'string', isOptional: true },
        { name: 'privacy_required', type: 'boolean' },
        // 'not-downloaded' | 'downloading' | 'ready' | 'errored'
        { name: 'download_status', type: 'string' },
        // Absolute path to the encrypted local MP4, once downloaded. The bytes
        // live on the filesystem behind OS keystore-backed encryption — the DB
        // only ever holds this pointer + metadata (see offline/video.ts).
        { name: 'local_uri', type: 'string', isOptional: true },
        // Keychain/Keystore alias for the per-file content encryption key.
        { name: 'encryption_key_ref', type: 'string', isOptional: true },
        { name: 'size_bytes', type: 'number', isOptional: true },
        { name: 'downloaded_at', type: 'number', isOptional: true },
      ],
    }),

    // -----------------------------------------------------------------------
    // APPEND-ONLY xAPI completion-statement outbox. Immutable except `synced`.
    // -----------------------------------------------------------------------
    tableSchema({
      name: Tables.completionStatements,
      columns: [
        // The CLIENT-GENERATED UUID (XapiStatement.id). This is THE idempotency
        // key: the server dedupes on it, so retrying a sync is always safe.
        // Indexed + treated as unique by the queue layer (checked before insert).
        { name: 'statement_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        // Denormalized xAPI fields for cheap display/filtering without parsing
        // the full payload. `verb` is the verb IRI; `object_id` the activity IRI.
        { name: 'verb', type: 'string' },
        { name: 'object_id', type: 'string' },
        // The full, canonical XapiStatement serialized as JSON. This is what gets
        // POSTed verbatim to createCompletionStatement — the denormalized columns
        // above are derived from it and never authoritative.
        { name: 'statement_json', type: 'string' },
        // Optional denormalized result summary (JSON) for quick progress reads.
        { name: 'result_json', type: 'string', isOptional: true },
        // ISO-8601 ACTIVITY time (XapiStatement.timestamp). NOT a dedupe key.
        { name: 'timestamp', type: 'string' },
        // false until the server acks this UUID; then flipped true. The ONLY
        // mutable column on this table.
        { name: 'synced', type: 'boolean', isIndexed: true },
        // ms epoch the server ack landed (for audit); null while unsynced.
        { name: 'synced_at', type: 'number', isOptional: true },
        // Sync attempt bookkeeping — drives exponential backoff; never drops the
        // row on failure, only records how many tries have happened.
        { name: 'attempt_count', type: 'number' },
        { name: 'last_attempt_at', type: 'number', isOptional: true },
        { name: 'last_error', type: 'string', isOptional: true },
        // ms epoch the row was first enqueued (append order).
        { name: 'enqueued_at', type: 'number', isIndexed: true },
      ],
    }),
  ],
});
