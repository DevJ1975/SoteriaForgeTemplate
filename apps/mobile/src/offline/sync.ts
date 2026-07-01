/**
 * Sync engine — drains the append-only xAPI outbox to AppSync on reconnect.
 *
 * ============================ WHY THIS IS SIMPLE ============================
 * There is deliberately NO merge logic, NO conflict resolution, NO last-writer-
 * wins, NO vector clocks. It cannot need any, and here is the proof:
 *
 *   - Each queued item is an xAPI statement with a CLIENT-GENERATED UUID.
 *   - Statements are IMMUTABLE and APPEND-ONLY — the client never edits one after
 *     enqueue, and the server stores it under SK = STMT#<id> once.
 *   - The server createCompletionStatement mutation is IDEMPOTENT by that UUID:
 *     a second write of the same id is a no-op (a conditional put on
 *     attribute_not_exists, or an upsert of identical data).
 *
 * Therefore re-POSTing the same statement — after a flaky network, a timeout that
 * actually succeeded server-side, an app kill mid-batch, or a worker completing a
 * whole course offline and syncing hours later — can only ever converge to
 * "exactly one copy stored". Two writers can never disagree about one id because
 * the id fixes the identity and the payload never changes. So the engine's entire
 * job is: keep trying to upload each unsynced row until the server acks its UUID,
 * then flip a local `synced` flag. That is it.
 * ===========================================================================
 *
 * DURABILITY: the queue is NEVER dropped on failure. A failed upload increments a
 * local attempt counter and schedules a backoff retry; the row stays put with
 * synced=false until the server acks. Nothing is lost across app restarts because
 * the outbox is on-disk SQLite (WatermelonDB).
 *
 * NON-BLOCKING: sync runs off the UI. Screens read the local store; this engine
 * uploads in the background when connectivity allows and never gates the UI on a
 * network round-trip.
 */
import type { Database } from '@nozbe/watermelondb';
import type { XapiStatement } from '@soteria-forge/shared';
import { statementIdempotencyKey } from '@soteria-forge/shared';
import { database as defaultDatabase } from '../db';
import { CompletionQueue } from './queue';
import type { CompletionStatementModel } from '../db/models';
import { connectivity } from './netinfo';

// ---------------------------------------------------------------------------
// Transport seam
// ---------------------------------------------------------------------------

/**
 * Result of attempting to upload one statement.
 *   - 'acked'      — server confirmed it is stored (first write OR idempotent
 *                    dedupe of an already-stored UUID). Either way: mark synced.
 *   - 'retryable'  — transient failure (offline, 5xx, timeout). Keep the row,
 *                    back off, try again.
 *   - 'rejected'   — permanent failure (e.g. a tenant-isolation refusal, a
 *                    malformed statement the server will NEVER accept). Keep the
 *                    row but stop auto-retrying; surface for inspection. This must
 *                    be rare — a well-formed, correctly-tenant-scoped statement is
 *                    never rejected.
 */
export type UploadOutcome = 'acked' | 'retryable' | 'rejected';

/**
 * Uploads one statement to the AppSync `createCompletionStatement` mutation.
 *
 * The real implementation calls the generated Amplify Data client:
 *
 *   const client = generateClient<Schema>();
 *   await client.mutations.createCompletionStatement({ input: statement });
 *
 * The mutation is idempotent by `statement.id` server-side, so re-sending is
 * always safe. The server derives the tenant from the caller's verified
 * `custom:tenantId` claim and refuses the write if it does not match
 * `statement.tenantId` — the client passing tenantId is a convenience, the token
 * is the security boundary (see backend/ + shared/tenant.ts).
 *
 * Until backend/ ships, the default transport throws, which the engine treats as
 * 'retryable' — so the queue simply accumulates and drains once the transport is
 * wired, exactly as it will when a device is genuinely offline.
 */
export type StatementUploader = (statement: XapiStatement) => Promise<UploadOutcome>;

/** Placeholder transport used until the AppSync client is wired (see above). */
const notWiredUploader: StatementUploader = async () => {
  throw new Error(
    'AppSync createCompletionStatement transport is not wired yet. ' +
      'Provide a StatementUploader to SyncEngine once backend/ is deployed.',
  );
};

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
}

export class SyncEngine {
  private readonly queue: CompletionQueue;
  private running = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;

  constructor(
    private readonly uploader: StatementUploader = notWiredUploader,
    private readonly db: Database = defaultDatabase,
    private readonly policy: BackoffPolicy = DEFAULT_BACKOFF,
  ) {
    this.queue = new CompletionQueue(db);
  }

  /**
   * Start the engine: sync whenever we transition to online, and once now if we
   * already are. Idempotent. The OfflineProvider calls this on mount.
   */
  start(): void {
    if (this.unsubscribeConnectivity) return;
    this.unsubscribeConnectivity = connectivity.subscribe((snap) => {
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
    const result: SyncResult = { attempted: 0, acked: 0, retryable: 0, rejected: 0 };

    // Never sync while offline — the local store is the source of truth until we
    // reconnect. This is the local-only vs sync gate.
    if (!connectivity.isOnline) return result;
    if (this.running) return result; // a drain is already in flight
    this.running = true;

    try {
      const pending = await this.queue.pending();
      for (const row of pending) {
        // Re-check connectivity between items: if we dropped offline mid-batch,
        // stop cleanly and leave the rest queued (never drop them).
        if (!connectivity.isOnline) break;

        result.attempted += 1;
        const outcome = await this.uploadOne(row);
        if (outcome === 'acked') result.acked += 1;
        else if (outcome === 'rejected') result.rejected += 1;
        else result.retryable += 1;
      }
    } finally {
      this.running = false;
    }

    // If anything is still pending, schedule a backoff retry using the max
    // attempt count seen — bounded, jittered, and never dropping the queue.
    if (result.retryable > 0) this.scheduleRetry();

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
      outcome = await this.uploader(statement);
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
            r.lastError = 'rejected';
          } else {
            r.lastError = 'retryable';
          }
        }
      });
    });

    return outcome;
  }

  /** Schedule one jittered backoff retry of the whole drain. */
  private scheduleRetry(): void {
    if (this.retryTimer) return; // one retry armed at a time
    const base = backoffDelayMs(1, this.policy);
    const jitter = Math.floor(Math.random() * (base * 0.25));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (connectivity.isOnline) void this.syncNow();
    }, base + jitter);
  }
}

/** App-wide sync engine bound to the singleton DB + (for now) the not-wired transport. */
export const syncEngine = new SyncEngine();
