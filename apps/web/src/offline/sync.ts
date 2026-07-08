/**
 * Web sync engine — drains the append-only xAPI outbox to Supabase.
 *
 * ============================ WHY THIS IS SIMPLE ============================
 * There is deliberately NO merge logic, NO conflict resolution, NO last-writer-
 * wins. It cannot need any, for the same reason mobile's engine cannot:
 *
 *   - Each queued item is an xAPI statement with a CLIENT-GENERATED UUID.
 *   - Statements are IMMUTABLE and APPEND-ONLY — the client never edits one after
 *     enqueue, and `public.completion_statements` has NO update/delete policy: a
 *     row can only ever be inserted once (PK = the client UUID).
 *   - The upload is an UPSERT with `onConflict: 'id', ignoreDuplicates: true`: a
 *     second write of the same id is a guaranteed no-op, so re-sending is safe.
 *
 * So the engine's entire job is: keep trying to upload each unsynced record until
 * the server accepts its UUID, then flip a local `synced` flag. That is it. This
 * is the web mirror of `apps/mobile/src/offline/sync.ts`; the pure backoff/retry
 * decision helpers are reproduced verbatim so both clients behave identically.
 *
 * NON-BLOCKING: the engine uploads off the render path; screens read the local
 * outbox and never gate on a network round-trip. Connectivity is injected as a
 * getter (`isOnline`) so the browser's `useOnlineStatus` drives it without the
 * engine importing React.
 */
import { CompletionOutbox } from './outbox'
import type { OutboxRecord } from './outboxCore'
import type {
  CurrentUserIdProvider,
  StatementUploader,
  UploadOutcome,
} from './transport'

// ---------------------------------------------------------------------------
// Backoff policy (pure — mirrors mobile's DEFAULT_BACKOFF verbatim)
// ---------------------------------------------------------------------------

export interface BackoffPolicy {
  baseMs: number
  factor: number
  maxMs: number
  /** Give up TIMER-driven retries after this many attempts (never drops the row). */
  maxAttempts: number
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  factor: 2,
  maxMs: 5 * 60_000, // cap at 5 minutes
  maxAttempts: 12,
}

/**
 * Pure: exponential backoff delay (ms) for the Nth attempt (0-based). attempt=0
 * → baseMs, then ×factor each time, capped at maxMs. Deterministic (no jitter);
 * the scheduler adds jitter at call time.
 */
export function backoffDelayMs(attempt: number, policy: BackoffPolicy = DEFAULT_BACKOFF): number {
  if (attempt <= 0) return policy.baseMs
  const raw = policy.baseMs * Math.pow(policy.factor, attempt)
  return Math.min(raw, policy.maxMs)
}

export type RetryDecision =
  | { action: 'mark-synced' }
  | { action: 'retry'; delayMs: number }
  | { action: 'give-up' }

/**
 * Pure: given a record's current attempt count + last outcome, decide what to do.
 * Separated from I/O so retry semantics are testable without IndexedDB or a
 * network. Mirrors mobile's `decideNext`.
 */
export function decideNext(
  outcome: UploadOutcome,
  attemptCount: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
): RetryDecision {
  if (outcome === 'acked') return { action: 'mark-synced' }
  if (outcome === 'rejected') return { action: 'give-up' }
  // retryable:
  if (attemptCount + 1 >= policy.maxAttempts) return { action: 'give-up' }
  return { action: 'retry', delayMs: backoffDelayMs(attemptCount, policy) }
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

export interface SyncResult {
  attempted: number
  acked: number
  retryable: number
  rejected: number
  /** Records left untouched because they belong to a DIFFERENT user (identity fence). */
  skipped: number
}

const EMPTY_RESULT: SyncResult = { attempted: 0, acked: 0, retryable: 0, rejected: 0, skipped: 0 }

export interface WebSyncEngineDeps {
  /** The durable IndexedDB outbox. */
  outbox: CompletionOutbox
  /** Transport that attempts one statement (the app binds the Supabase upsert). */
  uploader: StatementUploader
  /** Resolves the CURRENT verified session user id — the identity fence. */
  currentUserId: CurrentUserIdProvider
  /** Live connectivity getter (the browser's online status). */
  isOnline: () => boolean
  /** Retry/backoff policy; defaults to DEFAULT_BACKOFF. */
  policy?: BackoffPolicy
  /** Optional hook fired after any drain that changed a record (refresh UI counts). */
  onChange?: () => void
}

export class WebSyncEngine {
  private readonly outbox: CompletionOutbox
  private readonly uploader: StatementUploader
  private readonly currentUserId: CurrentUserIdProvider
  private readonly isOnline: () => boolean
  private readonly policy: BackoffPolicy
  private readonly onChange?: () => void
  private running = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: WebSyncEngineDeps) {
    this.outbox = deps.outbox
    this.uploader = deps.uploader
    this.currentUserId = deps.currentUserId
    this.isOnline = deps.isOnline
    this.policy = deps.policy ?? DEFAULT_BACKOFF
    this.onChange = deps.onChange
  }

  /** Cancel any pending retry (e.g. on provider unmount / sign-out). */
  stop(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Drain the outbox once: upload every uploadable record, marking acked ones
   * synced and scheduling a backoff retry if any remain. Concurrency-guarded so
   * overlapping triggers (reconnect + a fresh enqueue) never double-upload.
   */
  async syncNow(): Promise<SyncResult> {
    const result: SyncResult = { ...EMPTY_RESULT }

    // Never sync while offline — the local outbox is the source of truth until we
    // reconnect. This is the local-only vs sync gate.
    if (!this.isOnline()) return result
    if (this.running) return result // a drain is already in flight
    this.running = true

    let changed = false
    let retryEligible = 0
    let maxRetryAttempt = 0

    try {
      // IDENTITY FENCE (defense in depth for compliance records): the server
      // BEFORE INSERT trigger re-stamps user_id/tenant_id from whatever session
      // performs the upload, so a record authored by user A must NEVER upload
      // under user B's session. We re-resolve the CURRENT session's auth user id
      // immediately before EACH record (not once per drain) so the fence stays
      // correct even if the live session changes mid-drain. Records whose userId
      // differs are skipped and left pending, un-attempted; with no session at
      // all, nothing uploads.
      const pending = await this.outbox.pending()
      for (const record of pending) {
        // Re-check connectivity between items: if we dropped offline mid-batch,
        // stop cleanly and leave the rest queued (never drop them).
        if (!this.isOnline()) break

        const currentUserId = await this.currentUserId()
        if (!currentUserId || record.userId !== currentUserId) {
          result.skipped += 1
          continue
        }

        result.attempted += 1
        const { outcome, attemptCountAfter } = await this.uploadOne(record)
        changed = true
        if (outcome === 'acked') result.acked += 1
        else if (outcome === 'rejected') result.rejected += 1
        else {
          result.retryable += 1
          if (attemptCountAfter < this.policy.maxAttempts) {
            retryEligible += 1
            maxRetryAttempt = Math.max(maxRetryAttempt, attemptCountAfter)
          }
        }
      }
    } finally {
      this.running = false
    }

    if (changed) this.onChange?.()

    // Schedule a backoff retry ONLY while some retryable record is still under
    // the attempt cap, with a delay that GROWS with the attempt count. Once every
    // retryable record has exhausted maxAttempts, no timer is re-armed — that is
    // the give-up: no infinite retry loop. Records are NEVER dropped; an
    // event-driven drain (reconnect, a new enqueue) still gives them a chance.
    if (retryEligible > 0) this.scheduleRetry(maxRetryAttempt)

    return result
  }

  /**
   * Upload one record and apply the pure RetryDecision to it. The ONLY record
   * mutations are attempt bookkeeping and (on ack) the `synced` flag — the
   * statement payload itself is immutable and never rewritten.
   */
  private async uploadOne(
    record: OutboxRecord,
  ): Promise<{ outcome: UploadOutcome; attemptCountAfter: number }> {
    let outcome: UploadOutcome
    try {
      outcome = await this.uploader(record.statement, record.userId)
    } catch {
      // Any thrown error is transient/retryable — we NEVER drop the record on an
      // exception; it stays queued for the next attempt.
      outcome = 'retryable'
    }

    const decision = decideNext(outcome, record.attemptCount, this.policy)
    if (decision.action === 'mark-synced') {
      await this.outbox.markSynced(record.id)
      return { outcome, attemptCountAfter: record.attemptCount }
    }
    // retry or give-up: record the attempt; leave synced=false (record kept).
    await this.outbox.markAttempt(record.id, outcome === 'rejected' ? 'rejected' : 'retryable')
    return { outcome, attemptCountAfter: record.attemptCount + 1 }
  }

  /**
   * Schedule one jittered backoff retry of the whole drain. `attempt` is the
   * highest attempt count among the still-eligible retryable records, so the
   * delay GROWS exponentially drain over drain instead of hammering a fixed
   * interval. Mirrors mobile's `scheduleRetry`.
   */
  private scheduleRetry(attempt: number): void {
    if (this.retryTimer) return // one retry armed at a time
    const base = backoffDelayMs(attempt, this.policy)
    const jitter = Math.floor(Math.random() * (base * 0.25))
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.isOnline()) void this.syncNow()
    }, base + jitter)
  }
}
