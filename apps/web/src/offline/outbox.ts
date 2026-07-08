/**
 * CompletionOutbox — the IndexedDB-backed, append-only xAPI outbox for the web
 * learner surface.
 *
 * This is the web analogue of mobile's on-disk WatermelonDB outbox. It uses the
 * browser-native IndexedDB API (NO new npm dependency) to durably persist
 * completion statements so a kiosk/desktop learner's training survives a reload,
 * a tab close, or a dead-zone network — exactly as the mobile app's SQLite
 * outbox does.
 *
 * WHY IndexedDB, NOT the service-worker cache: the SW cache is for the app SHELL,
 * and the platform rule is that RLS-scoped Supabase responses are NEVER cached
 * (a cached response could leak one user's data to another after a session
 * change). The outbox stores the learner's OWN outbound writes — not fetched
 * tenant data — in a separate IndexedDB database that is never a Workbox runtime
 * cache, so it honors that rule fully.
 *
 * All rule/shape logic lives in the pure `./outboxCore` module (reviewable and
 * unit-testable without a browser); this class is the thin durable binding:
 * open the DB, and read/append/mark records. Every mutation funnels through here
 * so "append-only + idempotent" is enforced in exactly one place.
 */
import {
  createCompletionStatement,
  type XapiActor,
  type XapiObject,
  type XapiResult,
  type XapiVerb,
} from '@soteria-forge/shared'
import {
  byEnqueuedAtAsc,
  completedLessonIdsFrom,
  isUploadable,
  REJECTED_MARKER,
  RETRYABLE_MARKER,
  toOutboxRecord,
  uploadableCount,
  type OutboxRecord,
} from './outboxCore'
import type { UploadOutcome } from './transport'

const DB_NAME = 'sf-web-completion-outbox'
const DB_VERSION = 1
const STORE = 'completion_statements'
const USER_INDEX = 'by_user'

/**
 * Input to append a completion. Mirrors mobile's `EnqueueCompletionInput`:
 * `tenantId`/`userId`/`actor` MUST come from the verified session (never request
 * input). `id` is optional — omit to mint a fresh UUID, or pass an existing one
 * to make the enqueue idempotent for a known attempt (e.g. a quiz re-submit).
 */
export interface EnqueueCompletionInput {
  /** Existing client UUID to reuse (idempotency), or omit to mint a fresh one. */
  id?: string
  /** Verified tenant claim (from the caller's profile). NEVER from user input. */
  tenantId: string
  /** The verified session's auth user id. NEVER from user input. */
  userId: string
  actor: XapiActor
  verb: XapiVerb
  object: XapiObject
  result?: XapiResult
  context?: Record<string, unknown>
  /** ISO-8601 ACTIVITY time. Defaults to now. Never used as a dedupe key. */
  timestamp?: string
}

/** True when IndexedDB is usable in this environment (guards SSR / rare privacy modes). */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

/** Promise-wrap an IDBRequest. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/** Promise-wrap a transaction's completion. */
function promisifyTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export class CompletionOutbox {
  private dbPromise: Promise<IDBDatabase> | null = null

  /** Open (once) the outbox database, creating the store + user index on first use. */
  private open(): Promise<IDBDatabase> {
    if (!hasIndexedDb()) {
      return Promise.reject(new Error('IndexedDB is not available in this environment.'))
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' })
            // Index by user so the identity-fenced reads (completedLessonIds,
            // sign-out inspection) never scan another user's rows.
            store.createIndex(USER_INDEX, 'userId', { unique: false })
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Failed to open outbox DB'))
      })
    }
    return this.dbPromise
  }

  /** Read one record by its client UUID, or null. */
  async findByStatementId(statementId: string): Promise<OutboxRecord | null> {
    const db = await this.open()
    const tx = db.transaction(STORE, 'readonly')
    const record = await promisifyRequest<OutboxRecord | undefined>(
      tx.objectStore(STORE).get(statementId),
    )
    return record ?? null
  }

  /** Every record (any user, synced or not) — used for pending/completed projections. */
  private async all(): Promise<OutboxRecord[]> {
    const db = await this.open()
    const tx = db.transaction(STORE, 'readonly')
    const records = await promisifyRequest<OutboxRecord[]>(tx.objectStore(STORE).getAll())
    return records ?? []
  }

  /**
   * Append a completion statement to the outbox (idempotent by UUID). Mirrors
   * mobile's `CompletionQueue.enqueue`:
   *   1. Build the canonical XapiStatement via the SHARED builder → stable UUID.
   *   2. If a row with that UUID already exists, return it unchanged (no insert,
   *      no mutation — append-only + idempotent).
   *   3. Otherwise append exactly one immutable record with synced=false.
   * Never touches the network; never mutates an existing record.
   */
  async enqueue(input: EnqueueCompletionInput): Promise<OutboxRecord> {
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
    })

    // 2. Idempotency guard — same UUID already queued? Return it, do not re-insert.
    const existing = await this.findByStatementId(statement.id)
    if (existing) return existing

    // 3. Append exactly one immutable record. `add` (not `put`) fails on a
    //    duplicate key, so even a race can never overwrite an existing append.
    const record = toOutboxRecord(statement, input.userId)
    const db = await this.open()
    const tx = db.transaction(STORE, 'readwrite')
    try {
      await promisifyRequest(tx.objectStore(STORE).add(record))
      await promisifyTx(tx)
      return record
    } catch (err) {
      // A ConstraintError means another writer appended the same UUID between our
      // check and add — idempotent by definition, so return the stored copy.
      const raced = await this.findByStatementId(statement.id)
      if (raced) return raced
      throw err
    }
  }

  /** All still-uploadable records, oldest first (append order) — the sync drain set. */
  async pending(): Promise<OutboxRecord[]> {
    const records = await this.all()
    return records.filter(isUploadable).sort(byEnqueuedAtAsc)
  }

  /** Count of still-uploadable records — drives the pending badge. */
  async pendingCount(): Promise<number> {
    return uploadableCount(await this.all())
  }

  /**
   * The set of lesson ids the given user has locally recorded as COMPLETED, read
   * from the append-only outbox (synced or not). Identity-fenced by `userId`.
   * See `completedLessonIdsFrom`.
   */
  async completedLessonIds(userId: string, courseId?: string): Promise<Set<string>> {
    if (!userId) return new Set()
    return completedLessonIdsFrom(await this.all(), userId, courseId)
  }

  /**
   * Mark a record synced after the server accepted its UUID — the sole mutation
   * that flips `synced`. Idempotent: a missing record is a no-op.
   */
  async markSynced(statementId: string, now: number = Date.now()): Promise<void> {
    await this.mutate(statementId, (record) => {
      record.synced = true
      record.syncedAt = now
      record.lastError = null
    })
  }

  /**
   * Record a failed upload attempt: increment the attempt count and stamp
   * `lastError` — RETRYABLE_MARKER keeps the row uploadable; REJECTED_MARKER is
   * terminal (excluded from `pending()` forever, kept for audit). Mirrors the
   * bookkeeping in mobile's `uploadOne`.
   */
  async markAttempt(
    statementId: string,
    outcome: Exclude<UploadOutcome, 'acked'>,
    now: number = Date.now(),
  ): Promise<void> {
    await this.mutate(statementId, (record) => {
      record.attemptCount += 1
      record.lastAttemptAt = now
      record.lastError = outcome === 'rejected' ? REJECTED_MARKER : RETRYABLE_MARKER
    })
  }

  /** Read-modify-write one record inside a single transaction (append-only-safe: never deletes). */
  private async mutate(
    statementId: string,
    apply: (record: OutboxRecord) => void,
  ): Promise<void> {
    const db = await this.open()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const record = await promisifyRequest<OutboxRecord | undefined>(store.get(statementId))
    if (!record) return // nothing to update — no-op
    apply(record)
    await promisifyRequest(store.put(record))
    await promisifyTx(tx)
  }
}

/**
 * The app-wide outbox singleton. One durable store shared across the surface,
 * mirroring mobile's `completionQueue` singleton binding.
 */
export const completionOutbox = new CompletionOutbox()
