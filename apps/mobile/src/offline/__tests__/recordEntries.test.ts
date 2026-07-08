/**
 * Tests for the "My training record" read model + retry action (#15a) on the
 * append-only outbox. Same zero-dependency node:test setup as queue.test.ts: the
 * REAL CompletionQueue runs against the in-memory `fakeDb.ts`, so
 * `recordEntries()` and `retry()` execute their production code paths without a
 * native SQLite adapter or a React Native runtime.
 *
 * Invariants covered:
 *   - deriveRecordStatus / toRecordEntry: pure status derivation
 *     (synced/waiting/needs-attention) + context extraction, robust to a corrupt
 *     JSON payload (denormalized columns still render).
 *   - recordEntries: identity fence (only the requesting user's rows), status
 *     mapping over real rows, and NEWEST-FIRST ordering.
 *   - retry: clears the REJECTED_MARKER + resets backoff so the row re-enters the
 *     uploadable set; keeps the SAME client UUID and payload (idempotent
 *     re-upload); refuses to un-sync an accepted row; never deletes/mutates the
 *     server statement (it is purely local — no transport is involved).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { xapiVerbs, createCompletionStatement } from '@soteria-forge/shared';

import {
  CompletionQueue,
  toRecordEntry,
  deriveRecordStatus,
  REJECTED_MARKER,
} from '../queue';
import { makeFakeDb } from './fakeDb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EnqOpts {
  id?: string;
  userId?: string;
  verb?: string;
  lessonId?: string;
  courseId?: string;
  timestamp?: string;
}

function enqueue(queue: CompletionQueue, opts: EnqOpts = {}) {
  const {
    id,
    userId = 'user-1',
    verb = xapiVerbs.completed,
    lessonId = 'lesson-1',
    courseId = 'course-1',
    timestamp,
  } = opts;
  return queue.enqueue({
    id,
    tenantId: 'tenant-alpha',
    userId,
    actor: { name: 'Worker One' },
    verb: { id: verb, display: { 'en-US': 'v' } },
    object: { id: `https://soteria/lesson/${lessonId}` },
    context: { course_id: courseId, lesson_id: lessonId },
    timestamp,
  });
}

// ---------------------------------------------------------------------------
// deriveRecordStatus / toRecordEntry — pure
// ---------------------------------------------------------------------------

test('deriveRecordStatus: synced wins, then rejected marker, else waiting', () => {
  assert.equal(deriveRecordStatus({ synced: true }), 'synced');
  // synced outranks any stale last_error.
  assert.equal(deriveRecordStatus({ synced: true, lastError: REJECTED_MARKER }), 'synced');
  assert.equal(deriveRecordStatus({ synced: false, lastError: REJECTED_MARKER }), 'needs-attention');
  assert.equal(deriveRecordStatus({ synced: false }), 'waiting');
  // A transient failure is still "waiting" — it auto-retries.
  assert.equal(deriveRecordStatus({ synced: false, lastError: 'retryable' }), 'waiting');
});

test('toRecordEntry projects context + denormalized columns and survives corrupt JSON', () => {
  const stmt = createCompletionStatement({
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-alpha',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.passed, display: { 'en-US': 'passed' } },
    object: { id: 'https://soteria/lesson/l1' },
    context: { course_id: 'course-9', lesson_id: 'lesson-9' },
    timestamp: '2026-07-01T12:00:00.000Z',
  });
  const good = toRecordEntry({
    statementId: stmt.id,
    verb: stmt.verb.id,
    objectId: stmt.object.id,
    timestamp: stmt.timestamp,
    synced: false,
    lastError: undefined,
    get statement() {
      return stmt;
    },
  });
  assert.deepEqual(good, {
    statementId: stmt.id,
    verbId: xapiVerbs.passed,
    objectId: 'https://soteria/lesson/l1',
    lessonId: 'lesson-9',
    courseId: 'course-9',
    timestamp: '2026-07-01T12:00:00.000Z',
    status: 'waiting',
  });

  // Corrupt payload: still renders from denormalized columns, no lesson/course.
  const corrupt = toRecordEntry({
    statementId: stmt.id,
    verb: stmt.verb.id,
    objectId: stmt.object.id,
    timestamp: stmt.timestamp,
    synced: true,
    lastError: undefined,
    get statement(): never {
      throw new Error('corrupt JSON');
    },
  });
  assert.equal(corrupt.status, 'synced');
  assert.equal(corrupt.verbId, xapiVerbs.passed);
  assert.equal(corrupt.lessonId, undefined);
  assert.equal(corrupt.courseId, undefined);
});

// ---------------------------------------------------------------------------
// recordEntries — real CompletionQueue path over the fake store
// ---------------------------------------------------------------------------

test('recordEntries derives synced / waiting / needs-attention from real rows', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);

  const waiting = await enqueue(queue, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    lessonId: 'l-waiting',
    timestamp: '2026-07-01T09:00:00.000Z',
  });
  const synced = await enqueue(queue, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    lessonId: 'l-synced',
    timestamp: '2026-07-01T10:00:00.000Z',
  });
  await synced.update((r) => {
    r.synced = true;
  });
  const rejected = await enqueue(queue, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    lessonId: 'l-rejected',
    timestamp: '2026-07-01T11:00:00.000Z',
  });
  await rejected.update((r) => {
    r.attemptCount = 1;
    r.lastError = REJECTED_MARKER;
  });

  const entries = await queue.recordEntries('user-1');
  const byId = new Map(entries.map((e) => [e.statementId, e]));
  assert.equal(byId.get(waiting.statementId)?.status, 'waiting');
  assert.equal(byId.get(synced.statementId)?.status, 'synced');
  assert.equal(byId.get(rejected.statementId)?.status, 'needs-attention');
  // Context + verb surface on the entry.
  assert.equal(byId.get(waiting.statementId)?.lessonId, 'l-waiting');
  assert.equal(byId.get(waiting.statementId)?.courseId, 'course-1');
  assert.equal(byId.get(waiting.statementId)?.verbId, xapiVerbs.completed);
});

test('recordEntries is identity-fenced to the requesting user (and empty for none)', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  await enqueue(queue, { userId: 'user-a', lessonId: 'a1', timestamp: '2026-07-01T09:00:00.000Z' });
  await enqueue(queue, { userId: 'user-b', lessonId: 'b1', timestamp: '2026-07-01T09:00:00.000Z' });

  const a = await queue.recordEntries('user-a');
  assert.deepEqual(a.map((e) => e.lessonId), ['a1']);
  const b = await queue.recordEntries('user-b');
  assert.deepEqual(b.map((e) => e.lessonId), ['b1']);
  assert.equal((await queue.recordEntries('user-c')).length, 0);
  // No verified identity → nothing, never "everything".
  assert.equal((await queue.recordEntries('')).length, 0);
});

test('recordEntries sorts newest activity first regardless of enqueue order', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  await enqueue(queue, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', lessonId: 'oldest', timestamp: '2026-07-01T08:00:00.000Z' });
  await enqueue(queue, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', lessonId: 'newest', timestamp: '2026-07-03T08:00:00.000Z' });
  await enqueue(queue, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', lessonId: 'middle', timestamp: '2026-07-02T08:00:00.000Z' });

  const entries = await queue.recordEntries('user-1');
  assert.deepEqual(
    entries.map((e) => e.lessonId),
    ['newest', 'middle', 'oldest'],
  );
});

// ---------------------------------------------------------------------------
// retry — LOCAL re-arm; append-only server contract untouched
// ---------------------------------------------------------------------------

test('retry clears the rejected marker so the row becomes uploadable again, same UUID', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const row = await enqueue(queue, { id, lessonId: 'stuck' });
  const originalJson = row.statementJson;
  await row.update((r) => {
    r.attemptCount = 3;
    r.lastAttemptAt = 123;
    r.lastError = REJECTED_MARKER;
  });

  // Before retry: excluded from the uploadable set, shown as needs-attention.
  assert.equal(await queue.pendingCount(), 0);
  assert.equal((await queue.recordEntries('user-1'))[0]?.status, 'needs-attention');

  const reArmed = await queue.retry(id);
  assert.equal(reArmed, true);

  // After retry: back in the uploadable set, shown as waiting again.
  assert.equal(await queue.pendingCount(), 1);
  const pending = await queue.pending();
  assert.deepEqual(pending.map((r) => r.statementId), [id]);
  assert.equal((await queue.recordEntries('user-1'))[0]?.status, 'waiting');

  // Local bookkeeping only: attempt counters reset, marker cleared.
  assert.equal(row.attemptCount, 0);
  assert.equal(row.lastError, undefined);
  assert.equal(row.lastAttemptAt, undefined);

  // Idempotency preserved: SAME client UUID and byte-identical payload — no new
  // row, no re-created statement. The server statement is never touched here.
  assert.equal(row.statementId, id);
  assert.equal(row.statementJson, originalJson);
  assert.equal(collection.rows.length, 1);
});

test('retry refuses to un-sync an already-accepted row and no-ops on an unknown id', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  const row = await enqueue(queue, { id, lessonId: 'done' });
  await row.update((r) => {
    r.synced = true;
    r.syncedAt = 999;
  });

  // Cannot retry a statement the server already stored (append-only accepted).
  assert.equal(await queue.retry(id), false);
  assert.equal(row.synced, true);
  assert.equal(row.syncedAt, 999);
  assert.equal((await queue.recordEntries('user-1'))[0]?.status, 'synced');

  // Unknown id → harmless no-op.
  assert.equal(await queue.retry('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9'), false);
});
