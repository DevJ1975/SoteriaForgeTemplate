/**
 * Sync engine — drains the append-only xAPI outbox to Supabase on reconnect.
 *
 * ============================ WHY THIS IS SIMPLE ============================
 * There is deliberately NO merge logic, NO conflict resolution, NO last-writer-
 * wins, NO vector clocks. It cannot need any, and here is the proof:
 *
 *   - Each queued item is an xAPI statement with a CLIENT-GENERATED UUID.
 *   - Statements are IMMUTABLE and APPEND-ONLY — the client never edits one after
 *     enqueue, and `public.completion_statements` has NO update/delete policy: a
 *     row can only ever be inserted once (PK = the client UUID).
 *   - The upload is an UPSERT with `onConflict: 'id', ignoreDuplicates: true`: a
 *     second write of the same id is a guaranteed no-op (INSERT ... ON CONFLICT DO
 *     NOTHING), so re-sending is always safe.
 *
 * Therefore re-POSTing the same statement — after a flaky network, a timeout that
 * actually succeeded server-side, an app kill mid-batch, or a worker completing a
 * whole course offline and syncing hours later — can only ever converge to
 * "exactly one copy stored". Two writers can never disagree about one id because
 * the id fixes the identity and the payload never changes. So the engine's entire
 * job is: keep trying to upload each unsynced row until the server accepts its
 * UUID, then flip a local `synced` flag. That is it.
 * ===========================================================================
 *
 * DURABILITY: the queue is NEVER dropped on failure. A failed upload increments a
 * local attempt counter and schedules a backoff retry; the row stays put with
 * synced=false until the server accepts it. Nothing is lost across app restarts
 * because the outbox is on-disk SQLite (WatermelonDB).
 *
 * NON-BLOCKING: sync runs off the UI. Screens read the local store; this engine
 * uploads in the background when connectivity allows and never gates the UI on a
 * network round-trip.
 */
import type { Database } from '@nozbe/watermelondb';
import type { XapiStatement } from '@soteria-forge/shared';
import { statementIdempotencyKey } from '@soteria-forge/shared';
import { CompletionQueue, REJECTED_MARKER } from './queue';
import type { CompletionStatementModel } from '../db/models';

// NOTE: this module is deliberately NODE-SAFE (no import of `../db`,
// `../supabase`, or `./netinfo`, all of which need a native runtime): every
// dependency is INJECTED via SyncEngineDeps. The Supabase transport lives in
// `./transport.ts` and the app-wide `syncEngine` singleton binding in
// `./singletons.ts`; unit tests inject fakes for all of it.

// ---------------------------------------------------------------------------
// Transport seam
// ---------------------------------------------------------------------------

/**
 * Result of attempting to upload one statement.
 *   - 'acked'      — server accepted it (first insert OR idempotent no-op on an
 *                    already-stored UUID). Either way: mark synced.
 *   - 'retryable'  — transient failure (offline, 5xx, timeout, network). Keep the
 *                    row, back off, try again.
 *   - 'rejected'   — permanent failure (e.g. an RLS refusal, a malformed statement
 *                    the server will NEVER accept). Keep the row but stop
 *                    auto-retrying; surface for inspection. This must be rare — a
 *                    well-formed statement from the caller's own tenant is never
 *                    rejected.
 */
export type UploadOutcome = 'acked' | 'retryable' | 'rejected';

/** Per-row context the transport needs beyond the immutable statement payload. */
export interface UploadContext {
  /** The local `user_id` column of the queued row (the signed-in learner). */
  userId: string;
}

/**
 * Uploads one statement to `public.completion_statements` via Supabase.
 *
 * The write is idempotent by `statement.id` (the table's primary key + the
 * upsert's conflict target), so re-sending is always safe. TENANT ISOLATION is
 * enforced by Postgres, not here: a BEFORE INSERT trigger stamps `tenant_id` from
 * the caller's verified auth context, and there is no update/delete policy, so a
 * client cannot choose another tenant's id or mutate an existing row. We send
 * `tenant_id`/`user_id` only because the column shape requires them; the server
 * overrides `tenant_id` from the session regardless of what we pass — the client
 * NEVER chooses the tenant.
 */
export type StatementUploader = (
  statement: XapiStatement,
  ctx: UploadContext,
) => Promise<UploadOutcome>;

/** Seam for the engine's identity fence — injectable so tests need no Supabase. */
export type CurrentUserIdProvider = () => Promise<string | null>;

/**
 * The connectivity surface the engine needs — satisfied by the app's
 * ConnectivityService (`./netinfo`) and by a plain fake in tests.
 */
export interface ConnectivityLike {
  readonly isOnline: boolean;
  /** Subscribe to connectivity changes; returns an unsubscribe fn. */
  subscribe(listener: (snap: { isOnline: boolean }) => void): () => void;
}

// ---------------------------------------------------------------------------
// Backoff policy (pure, unit-testable)
// ---------------------------------------------------------------------------

export interface BackoffPolicy {
  baseMs: number;
  factor: number;
  maxMs: number;
  /** Give up auto-retry after this many attempts (still never drops the row). */
  maxAttempts: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  factor: 2,
  maxMs: 5 * 60_000, // cap at 5 minutes
  maxAttempts: 12,
};

/**
 * Pure: exponential backoff delay (ms) for the Nth attempt (0-based).
 * attempt=0 → baseMs, then ×factor each time, capped at maxMs. No jitter here so
 * the value is deterministic for tests; the scheduler adds jitter at call time.
 */
export function backoffDelayMs(attempt: number, policy: BackoffPolicy = DEFAULT_BACKOFF): number {
  if (attempt <= 0) return policy.baseMs;
  const raw = policy.baseMs * Math.pow(policy.factor, attempt);
  return Math.min(raw, policy.maxMs);
}

/**
 * Pure: given a row's current attempt count + last outcome, decide what to do.
 * Separated from I/O so retry semantics are testable without SQLite or a network.
 */
export type RetryDecision =
  | { action: 'mark-synced' }
  | { action: 'retry'; delayMs: number }
  | { action: 'give-up' };

export function decideNext(
  outcome: UploadOutcome,
  attemptCount: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
): RetryDecision {
  if (outcome === 'acked') return { action: 'mark-synced' };
  if (outcome === 'rejected') return { action: 'give-up' };
  // retryable:
  if (attemptCount + 1 >= policy.maxAttempts) return { action: 'give-up' };
  return { action: 'retry', delayMs: backoffDelayMs(attemptCount, policy) };
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

export interface SyncResult {
  attempted: number;
  acked: number;
  retryable: number;
  rejected: number;
  /**
   * Rows left untouched because they belong to a DIFFERENT user than the
   * current session (or there is no session). They stay pending, un-attempted —
   * see the identity fence in `syncNow`.
   */
  skipped: number;
}

/** Everything the engine talks to — injected so the engine itself is pure logic. */
export interface SyncEngineDeps {
  /** Transport that attempts one statement (the app binds the Supabase upsert). */
  uploader: StatementUploader;
  /** The local outbox database (the app binds the SQLite singleton). */
  db: Database;
  /** Resolves the CURRENT verified session user id — the identity fence. */
  currentUserId: CurrentUserIdProvider;
  /** Connectivity signal driving the local-only vs sync decision. */
  connectivity: ConnectivityLike;
  /** Retry/backoff policy; defaults to DEFAULT_BACKOFF. */
  policy?: BackoffPolicy;
}

export class SyncEngine {
  private readonly queue: CompletionQueue;
  private readonly uploader: StatementUploader;
  private readonly db: Database;
  private readonly policy: BackoffPolicy;
  private readonly currentUserId: CurrentUserIdProvider;
  private readonly connectivity: ConnectivityLike;
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;

  constructor(deps: SyncEngineDeps) {
    this.uploader = deps.uploader;
    this.db = deps.db;
    this.policy = deps.policy ?? DEFAULT_BACKOFF;
    this.currentUserId = deps.currentUserId;
    this.connectivity = deps.connectivity;
    this.queue = new CompletionQueue(deps.db);
  }

  /**
   * Start the engine: sync whenever we transition to online, and once now if we
   * already are. Idempotent. The OfflineProvider calls this on mount.
   */
  start(): void {
    if (this.unsubscribeConnectivity) return;
    this.unsubscribeConnectivity = this.connectivity.subscribe((snap) => {
      if (snap.isOnline) void this.syncNow();
    });
    // `subscribe` emits current state immediately, so an already-online device
    // kicks off a drain right away without a special case here.
  }

  /** Stop reacting to connectivity + cancel any pending retry. */
  stop(): void {
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Drain the outbox once: upload every unsynced row, marking acked ones synced
   * and scheduling a backoff retry if any remain. Concurrency-guarded so
   * overlapping triggers (connectivity flap + manual call) don't double-upload.
   */
  async syncNow(): Promise<SyncResult> {
    const result: SyncResult = {
      attempted: 0,
      acked: 0,
      retryable: 0,
      rejected: 0,
      skipped: 0,
    };

    // Never sync while offline — the local store is the source of truth until we
    // reconnect. This is the local-only vs sync gate.
    if (!this.connectivity.isOnline) return result;
    if (this.running) return result; // a drain is already in flight
    this.running = true;

    // Backoff bookkeeping for this drain: the timer's delay grows with the
    // attempt count of the retryable rows, and no timer is armed at all once
    // every retryable row has exhausted the policy's maxAttempts (give-up for
    // TIMER-driven retries; see below).
    let retryEligible = 0;
    let maxRetryAttempt = 0;

    try {
      // IDENTITY FENCE (defense in depth for compliance records): the server
      // BEFORE INSERT trigger re-stamps user_id/tenant_id from whatever session
      // performs the upload — so a stale row authored by user A must NEVER be
      // uploaded under user B's session, or A's completion would be recorded as
      // B's. Sign-out wipes the store (see AuthProvider), but even if that is
      // ever missed, this fence keeps a queued statement pinned to its author.
      // We re-resolve the CURRENT session's auth user id immediately before
      // each row (not once per drain): the fence must stay correct even if the
      // live session ever changes mid-drain, since the upload — and the server
      // re-stamp — happens per row, not per batch. Rows whose user_id differs
      // from the current session are skipped and left pending, un-attempted;
      // with no session at all the drain stops (nothing may upload).
      const pending = await this.queue.pending();
      for (const row of pending) {
        // Re-check connectivity between items: if we dropped offline mid-batch,
        // stop cleanly and leave the rest queued (never drop them).
        if (!this.connectivity.isOnline) break;

        const currentUserId = await this.currentUserId();
        if (!currentUserId || row.userId !== currentUserId) {
          result.skipped += 1;
          continue;
        }

        result.attempted += 1;
        const outcome = await this.uploadOne(row);
        if (outcome === 'acked') result.acked += 1;
        else if (outcome === 'rejected') result.rejected += 1;
        else {
          result.retryable += 1;
          // `row.attemptCount` reflects the post-attempt bookkeeping (uploadOne
          // persisted the increment on this model instance).
          if (row.attemptCount < this.policy.maxAttempts) {
            retryEligible += 1;
            maxRetryAttempt = Math.max(maxRetryAttempt, row.attemptCount);
          }
        }
      }
    } finally {
      this.running = false;
    }

    // Schedule a backoff retry ONLY while some retryable row is still under the
    // attempt cap, with a delay that GROWS with the attempt count (exponential,
    // capped at policy.maxMs). Once every retryable row has exhausted
    // maxAttempts, no timer is re-armed — that is the give-up: no infinite
    // retry loop. The rows are NEVER dropped, though; they stay pending, and an
    // event-driven drain (reconnect, a new enqueue, the sign-out flush) still
    // gives them a chance — deliberate durability for compliance records.
    // Permanently-rejected rows never reach here at all (pending() excludes
    // them).
    if (retryEligible > 0) this.scheduleRetry(maxRetryAttempt);

    return result;
  }

  /**
   * Upload a single row and apply the pure RetryDecision to it. The ONLY row
   * mutations are: attempt bookkeeping and (on ack) the `synced` flag — the
   * statement payload itself is immutable and never rewritten.
   */
  private async uploadOne(row: CompletionStatementModel): Promise<UploadOutcome> {
    const statement = row.statement;
    // Sanity: the key we retry under is the statement id, nothing else.
    void statementIdempotencyKey(statement);

    let outcome: UploadOutcome;
    try {
      // `user_id` is a local indexing column (not part of the xAPI payload), so
      // it is passed as context rather than embedded in the statement.
      outcome = await this.uploader(statement, { userId: row.userId });
    } catch {
      // Any thrown error is treated as transient/retryable — we NEVER drop the
      // row on an exception; it stays queued for the next attempt.
      outcome = 'retryable';
    }

    const decision = decideNext(outcome, row.attemptCount, this.policy);
    const now = Date.now();

    await this.db.write(async () => {
      await row.update((r) => {
        if (decision.action === 'mark-synced') {
          r.synced = true; // the sole mutation to a synced row
          r.syncedAt = now;
          r.lastError = undefined;
        } else {
          // retry or give-up: record the attempt; leave synced=false (row kept).
          r.attemptCount = r.attemptCount + 1;
          r.lastAttemptAt = now;
          if (outcome === 'rejected') {
            // Terminal: pending() excludes this marker, so the row stops
            // re-uploading forever while remaining stored for inspection.
            r.lastError = REJECTED_MARKER;
          } else {
            r.lastError = 'retryable';
          }
        }
      });
    });

    return outcome;
  }

  /**
   * Schedule one jittered backoff retry of the whole drain. `attempt` is the
   * highest attempt count among the still-eligible retryable rows, so the delay
   * GROWS exponentially drain over drain (base × factor^attempt, capped at
   * policy.maxMs) instead of hammering on a fixed interval.
   */
  private scheduleRetry(attempt: number): void {
    if (this.retryTimer) return; // one retry armed at a time
    const base = backoffDelayMs(attempt, this.policy);
    const jitter = Math.floor(Math.random() * (base * 0.25));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.connectivity.isOnline) void this.syncNow();
    }, base + jitter);
  }
}
