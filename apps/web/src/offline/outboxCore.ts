/**
 * Outbox core — the FRAMEWORK-FREE, STORAGE-FREE pure logic of the web
 * completion outbox.
 *
 * This module is the web mirror of `apps/mobile/src/offline/queue.ts`'s pure
 * layer: it owns the row SHAPE, the idempotency/status derivation, the
 * completion-verb set, and the "which lessons are locally complete" projection —
 * all as pure functions over plain records, with NO React, NO IndexedDB, NO
 * Supabase. That keeps the rules reviewable and unit-testable in isolation; the
 * IndexedDB binding lives in `./outbox.ts` and the network in `./transport.ts`.
 *
 * CONTRACT (identical to mobile, deliberately):
 *   - A queued item is an xAPI statement with a CLIENT-GENERATED UUID (built via
 *     the shared `createCompletionStatement`). The UUID is the primary key of
 *     both the local store AND `public.completion_statements`, so it is the
 *     idempotency key everywhere.
 *   - The outbox is APPEND-ONLY. The only mutations a stored record ever gets
 *     are sync bookkeeping (the `synced` flag + attempt counters + `lastError`);
 *     the immutable `statement` payload is never rewritten.
 *   - A permanently server-REJECTED row keeps a terminal `REJECTED_MARKER` in
 *     `lastError` so it stops re-uploading forever, yet remains stored and
 *     inspectable (audit) — it is simply excluded from every "uploadable" read.
 *
 * WHY NO CONFLICT RESOLUTION: the id fixes identity and the payload never
 * changes, so two writers can never disagree about one id. Re-sending converges
 * to exactly one stored copy. See `./sync.ts`.
 */
import {
  xapiVerbs,
  type XapiStatement,
} from '@soteria-forge/shared'

/**
 * The flat record persisted per completion in the IndexedDB outbox. It embeds
 * the full immutable `statement` (a plain JSON object — structured-cloneable, so
 * it survives IndexedDB serialization untouched) plus local sync bookkeeping.
 * `id` is the statement's client UUID and the object store's keyPath.
 */
export interface OutboxRecord {
  /** statement.id — the client UUID, the idempotency key, the store keyPath. */
  id: string
  /** From the verified session profile. Local indexing only; server re-stamps. */
  tenantId: string
  /** The signed-in learner's auth user id — the identity fence for uploads. */
  userId: string
  /** Denormalized for cheap reads; canonical value lives in `statement.verb`. */
  verb: string
  /** Denormalized activity object id; canonical value in `statement.object`. */
  objectId: string
  /** The full, immutable xAPI statement exactly as it will be uploaded. */
  statement: XapiStatement
  /** xAPI activity time (`statement.timestamp`); stored as occurred_at server-side. */
  occurredAt: string
  /** True once the server has accepted this UUID (append). Never un-set. */
  synced: boolean
  /** Epoch ms of the ack, or null while unsynced. */
  syncedAt: number | null
  /** Upload attempts so far — drives exponential backoff. */
  attemptCount: number
  /** Epoch ms of the last attempt, or null. */
  lastAttemptAt: number | null
  /** null | RETRYABLE_MARKER | REJECTED_MARKER — see the markers below. */
  lastError: string | null
  /** Epoch ms when the row was appended (append order = drain order). */
  enqueuedAt: number
}

/**
 * Terminal marker written to `lastError` when the server PERMANENTLY refuses a
 * statement (RLS refusal / malformed payload — see `./transport.ts`). Rows
 * carrying it are KEPT (append-only bookkeeping, inspectable) but excluded from
 * every uploadable read, so a row the server will never accept stops
 * re-uploading forever. Mirrors mobile's `REJECTED_MARKER`.
 */
export const REJECTED_MARKER = 'rejected'

/** Transient-failure marker: the row stays uploadable and is retried with backoff. */
export const RETRYABLE_MARKER = 'retryable'

/**
 * Verb IRIs that mark a lesson DONE, EXACTLY mirroring the server progress
 * trigger (migration 12) AND mobile's `COMPLETION_VERB_IDS`: `completed` OR
 * `passed`. `failed` is deliberately excluded — a failed quiz attempt is
 * recorded but never counts toward completion. Keep this set, mobile's set, and
 * the trigger in lockstep.
 */
export const COMPLETION_VERB_IDS: ReadonlySet<string> = new Set([
  xapiVerbs.completed,
  xapiVerbs.passed,
])

/**
 * Pure: project a finished statement into its stored record. No I/O. `userId` is
 * passed separately because it is a local indexing column, not part of the
 * canonical xAPI payload (the actor identifies the user in xAPI terms). Mirrors
 * mobile's `toCompletionRow`.
 */
export function toOutboxRecord(
  statement: XapiStatement,
  userId: string,
  now: number = Date.now(),
): OutboxRecord {
  return {
    id: statement.id,
    tenantId: statement.tenantId,
    userId,
    verb: statement.verb.id,
    objectId: statement.object.id,
    statement,
    occurredAt: statement.timestamp,
    synced: false,
    syncedAt: null,
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    enqueuedAt: now,
  }
}

/**
 * Pure: is this record still uploadable? Unsynced AND not permanently rejected.
 * Mirrors mobile's `uploadableClauses()` (translated from WatermelonDB `Q` to a
 * plain predicate). The RETRYABLE_MARKER does NOT exclude a row — only the
 * terminal REJECTED_MARKER does.
 */
export function isUploadable(record: OutboxRecord): boolean {
  return !record.synced && record.lastError !== REJECTED_MARKER
}

/** Stable append-order comparator (oldest first) for draining. */
export function byEnqueuedAtAsc(a: OutboxRecord, b: OutboxRecord): number {
  return a.enqueuedAt - b.enqueuedAt
}

/**
 * Pure: the set of lesson ids the given user has locally recorded as COMPLETED,
 * derived from the append-only records (synced or not) so the UI reflects a
 * completion the instant it is enqueued — before it ever reaches the server.
 * Mirrors mobile's `completedLessonIds`.
 *
 * IDENTITY FENCE: `userId` is REQUIRED and must be the CURRENT verified session's
 * auth user id. Records are filtered by their `userId` so one user's completions
 * can never render as another's on a shared kiosk. A completion is any record
 * whose verb is `completed` OR `passed` (COMPLETION_VERB_IDS — `failed` never
 * counts) and whose `context.lesson_id` is set. When `courseId` is given, only
 * completions in that course are returned. READ-ONLY.
 */
export function completedLessonIdsFrom(
  records: readonly OutboxRecord[],
  userId: string,
  courseId?: string,
): Set<string> {
  const completed = new Set<string>()
  if (!userId) return completed // no verified identity → nothing to show
  for (const record of records) {
    if (record.userId !== userId) continue
    const statement = record.statement
    if (!statement?.verb?.id || !COMPLETION_VERB_IDS.has(statement.verb.id)) continue
    const ctx = (statement.context ?? {}) as {
      course_id?: unknown
      lesson_id?: unknown
    }
    const lessonId = typeof ctx.lesson_id === 'string' ? ctx.lesson_id : undefined
    if (!lessonId) continue
    if (courseId && ctx.course_id !== courseId) continue
    completed.add(lessonId)
  }
  return completed
}

/** Pure: count of still-uploadable records — drives the pending badge. */
export function uploadableCount(records: readonly OutboxRecord[]): number {
  let n = 0
  for (const r of records) if (isUploadable(r)) n++
  return n
}
