/**
 * Tests for the sync engine drain: identity fence, durability, backoff
 * bookkeeping, and the offline gate — all against the REAL SyncEngine +
 * CompletionQueue running over the in-memory fake DB (see fakeDb.ts), with an
 * injected fake uploader / connectivity / CurrentUserIdProvider. No network,
 * no SQLite, no React Native.
 *
 * The invariants under test:
 *   - IDENTITY FENCE: a queued statement is only ever uploaded under the
 *     identity that authored it. Rows whose user_id differs from the current
 *     session — or ANY row when there is no session — are skipped, left
 *     pending and un-attempted.
 *   - DURABILITY: failed uploads never drop the row; retryable failures grow
 *     the attempt count and stay pending; permanent rejections park the row
 *     (REJECTED_MARKER) out of the drain while keeping it stored.
 *   - IDEMPOTENT RE-DRAIN: an acked row is marked synced and never re-sent.
 *   - OFFLINE GATE: no drain while offline; a mid-batch connectivity drop
 *     stops cleanly, leaving the rest queued.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { xapiVerbs, type XapiStatement } from '@soteria-forge/shared';

import { CompletionQueue, REJECTED_MARKER } from '../queue';
import {
  SyncEngine,
  DEFAULT_BACKOFF,
  type ConnectivityLike,
  type StatementUploader,
  type UploadOutcome,
  type UploadContext,
} from '../sync';
import { makeFakeDb } from './fakeDb';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class FakeConnectivity implements ConnectivityLike {
  isOnline = true;
  private listeners = new Set<(snap: { isOnline: boolean }) => void>();

  subscribe(listener: (snap: { isOnline: boolean }) => void): () => void {
    this.listeners.add(listener);
    listener({ isOnline: this.isOnline }); // mirror the real service: emit now
    return () => this.listeners.delete(listener);
  }

  set(online: boolean): void {
    this.isOnline = online;
    for (const l of this.listeners) l({ isOnline: online });
  }
}

interface UploadCall {
  statement: XapiStatement;
  ctx: UploadContext;
}

/** Records every call; outcomes come from a script (default: ack everything). */
function makeUploader(script: UploadOutcome[] | ((call: UploadCall) => UploadOutcome) = []) {
  const calls: UploadCall[] = [];
  const uploader: StatementUploader = async (statement, ctx) => {
    const call = { statement, ctx };
    calls.push(call);
    if (typeof script === 'function') return script(call);
    return script[calls.length - 1] ?? 'acked';
  };
  return { uploader, calls };
}

interface EngineSetup {
  currentUserId?: () => Promise<string | null>;
  script?: UploadOutcome[] | ((call: UploadCall) => UploadOutcome);
  online?: boolean;
}

function makeEngine({ currentUserId, script, online = true }: EngineSetup = {}) {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const connectivity = new FakeConnectivity();
  connectivity.isOnline = online;
  const { uploader, calls } = makeUploader(script);
  const engine = new SyncEngine({
    uploader,
    db,
    currentUserId: currentUserId ?? (async () => 'user-a'),
    connectivity,
  });
  return { engine, queue, collection, connectivity, calls };
}

async function seed(queue: CompletionQueue, userId: string, lessonId: string) {
  return queue.enqueue({
    tenantId: 'tenant-alpha',
    userId,
    actor: { name: userId },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: `https://soteria/lesson/${lessonId}` },
    context: { course_id: 'course-1', lesson_id: lessonId },
  });
}

// ---------------------------------------------------------------------------
// Happy path + idempotent re-drain
// ---------------------------------------------------------------------------

test('syncNow drains the outbox: acked rows flip synced and are never re-sent', async () => {
  const { engine, queue, calls } = makeEngine();
  const r1 = await seed(queue, 'user-a', 'l1');
  const r2 = await seed(queue, 'user-a', 'l2');

  const result = await engine.syncNow();
  assert.deepEqual(result, { attempted: 2, acked: 2, retryable: 0, rejected: 0, skipped: 0 });
  assert.equal(r1.synced, true);
  assert.equal(r2.synced, true);
  assert.ok(r1.syncedAt);
  assert.equal(await queue.pendingCount(), 0);

  // Idempotent re-drain: nothing left to upload, nothing re-sent.
  const again = await engine.syncNow();
  assert.deepEqual(again, { attempted: 0, acked: 0, retryable: 0, rejected: 0, skipped: 0 });
  assert.equal(calls.length, 2);
});

// ---------------------------------------------------------------------------
// Identity fence
// ---------------------------------------------------------------------------

test('identity fence: rows authored by a DIFFERENT user are skipped, pending, un-attempted', async () => {
  const { engine, queue, calls } = makeEngine({ currentUserId: async () => 'user-a' });
  const mine = await seed(queue, 'user-a', 'mine');
  const theirs = await seed(queue, 'user-b', 'theirs');

  const result = await engine.syncNow();
  assert.equal(result.attempted, 1);
  assert.equal(result.acked, 1);
  assert.equal(result.skipped, 1);

  // Only user-a's statement ever reached the transport…
  assert.deepEqual(calls.map((c) => c.ctx.userId), ['user-a']);
  assert.equal(mine.synced, true);
  // …and user-b's row was left exactly as it was: pending, zero attempts.
  assert.equal(theirs.synced, false);
  assert.equal(theirs.attemptCount, 0);
  assert.equal(await queue.pendingCount(), 1);
});

test('identity fence: with NO session (null user id) the engine uploads NOTHING', async () => {
  const { engine, queue, calls } = makeEngine({ currentUserId: async () => null });
  await seed(queue, 'user-a', 'l1');
  await seed(queue, 'user-b', 'l2');

  const result = await engine.syncNow();
  assert.deepEqual(result, { attempted: 0, acked: 0, retryable: 0, rejected: 0, skipped: 2 });
  assert.equal(calls.length, 0, 'no session → not a single upload');
  assert.equal(await queue.pendingCount(), 2, 'rows stay pending for their author');
});

test('identity fence: a session change MID-DRAIN stops uploading under the new identity', async () => {
  // The live session flips from user-a to user-b BETWEEN rows. Because the
  // fence re-resolves the current user per row (not once per drain), only the
  // row uploaded while user-a is live reaches the transport; the second row —
  // still authored by user-a but now seen under user-b's session — is skipped.
  // A once-per-drain snapshot would upload BOTH under the stale user-a id, and
  // the server's re-stamp trigger would misattribute the second to user-b.
  let call = 0;
  const currentUserId = async () => (call++ === 0 ? 'user-a' : 'user-b');
  const { engine, queue, calls } = makeEngine({ currentUserId });
  await seed(queue, 'user-a', 'l1');
  await seed(queue, 'user-a', 'l2');

  const result = await engine.syncNow();
  assert.equal(result.attempted, 1);
  assert.equal(result.acked, 1);
  assert.equal(result.skipped, 1);
  assert.equal(calls.length, 1, 'exactly one row uploaded before the identity changed');
  assert.equal(calls[0]?.ctx.userId, 'user-a', 'and it was uploaded under its author');
  assert.equal(await queue.pendingCount(), 1, 'the post-switch row stays pending, un-attempted');
});

// ---------------------------------------------------------------------------
// Durability: retryable + rejected + thrown errors
// ---------------------------------------------------------------------------

test('a retryable failure grows the attempt count and keeps the row pending', async () => {
  const { engine, queue } = makeEngine({ script: ['retryable'] });
  const row = await seed(queue, 'user-a', 'l1');

  const result = await engine.syncNow();
  engine.stop(); // disarm the backoff retry timer the drain scheduled

  assert.equal(result.retryable, 1);
  assert.equal(row.synced, false);
  assert.equal(row.attemptCount, 1);
  assert.equal(row.lastError, 'retryable');
  assert.ok(row.lastAttemptAt);
  assert.equal(await queue.pendingCount(), 1, 'the row is NEVER dropped');
});

test('an uploader EXCEPTION is treated as retryable — the row survives', async () => {
  const { engine, queue } = makeEngine({
    script: () => {
      throw new Error('network exploded');
    },
  });
  const row = await seed(queue, 'user-a', 'l1');

  const result = await engine.syncNow();
  engine.stop();

  assert.equal(result.retryable, 1);
  assert.equal(row.synced, false);
  assert.equal(row.attemptCount, 1);
  assert.equal(await queue.pendingCount(), 1);
});

test('a permanent rejection parks the row: marked, excluded from future drains, still stored', async () => {
  const { engine, queue, collection, calls } = makeEngine({ script: ['rejected'] });
  const row = await seed(queue, 'user-a', 'l1');

  const result = await engine.syncNow();
  engine.stop();
  assert.equal(result.rejected, 1);
  assert.equal(row.synced, false);
  assert.equal(row.lastError, REJECTED_MARKER);

  // Give-up means "stop auto-retrying", never "delete": the row is out of the
  // drain but remains stored for inspection (append-only bookkeeping).
  assert.equal(await queue.pendingCount(), 0);
  assert.equal(collection.rows.length, 1);

  const again = await engine.syncNow();
  assert.equal(again.attempted, 0);
  assert.equal(calls.length, 1, 'a rejected row never re-uploads');
});

// ---------------------------------------------------------------------------
// Offline gate + mid-batch connectivity drop + concurrency guard
// ---------------------------------------------------------------------------

test('no drain while offline: the local store stays the source of truth', async () => {
  const { engine, queue, calls } = makeEngine({ online: false });
  await seed(queue, 'user-a', 'l1');

  const result = await engine.syncNow();
  assert.deepEqual(result, { attempted: 0, acked: 0, retryable: 0, rejected: 0, skipped: 0 });
  assert.equal(calls.length, 0);
});

test('a mid-batch connectivity drop stops cleanly and leaves the rest queued', async () => {
  const setup = makeEngine({
    script: () => {
      // First upload succeeds, then the device drops offline before item two.
      setup.connectivity.isOnline = false;
      return 'acked';
    },
  });
  const { engine, queue, calls } = setup;
  await seed(queue, 'user-a', 'l1');
  const second = await seed(queue, 'user-a', 'l2');

  const result = await engine.syncNow();
  assert.equal(result.attempted, 1);
  assert.equal(result.acked, 1);
  assert.equal(calls.length, 1);
  assert.equal(second.synced, false);
  assert.equal(second.attemptCount, 0, 'the un-reached row is untouched, not failed');
  assert.equal(await queue.pendingCount(), 1);
});

test('overlapping syncNow calls do not double-upload (concurrency guard)', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const calls: UploadCall[] = [];
  const engine = new SyncEngine({
    uploader: async (statement, ctx) => {
      calls.push({ statement, ctx });
      await gate; // hold the first drain open
      return 'acked';
    },
    db,
    currentUserId: async () => 'user-a',
    connectivity: new FakeConnectivity(),
  });
  await seed(queue, 'user-a', 'l1');

  const first = engine.syncNow();
  const second = await engine.syncNow(); // while the first is in flight
  assert.deepEqual(second, { attempted: 0, acked: 0, retryable: 0, rejected: 0, skipped: 0 });

  release();
  const firstResult = await first;
  assert.equal(firstResult.acked, 1);
  assert.equal(calls.length, 1, 'the statement uploaded exactly once');
});

// ---------------------------------------------------------------------------
// start(): the connectivity-driven drain
// ---------------------------------------------------------------------------

test('start() drains when connectivity reports online, and stop() detaches', async () => {
  let uploaded!: () => void;
  const done = new Promise<void>((resolve) => {
    uploaded = resolve;
  });
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const connectivity = new FakeConnectivity();
  connectivity.isOnline = false;
  const engine = new SyncEngine({
    uploader: async () => {
      uploaded();
      return 'acked';
    },
    db,
    currentUserId: async () => 'user-a',
    connectivity,
  });
  const row = await seed(queue, 'user-a', 'l1');

  engine.start(); // subscribes; current state is offline → no drain yet
  assert.equal(row.synced, false);

  connectivity.set(true); // reconnect → the engine drains
  await done;
  // Let the drain finish its bookkeeping write.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(row.synced, true);

  engine.stop();
});
