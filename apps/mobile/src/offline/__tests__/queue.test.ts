/**
 * Tests for the offline queue: the append-only, idempotent-by-UUID outbox.
 *
 * Runner: node:test (built in) + node:assert/strict — SAME zero-dependency setup
 * the shared package uses, so this runs without a native SQLite adapter or a
 * React Native runtime (`npm run test` in apps/mobile compiles via
 * tsconfig.test.json and executes the emitted JS).
 *
 * The REAL CompletionQueue runs against `fakeDb.ts` — an in-memory fake that
 * interprets the actual `Q` clause objects the queue builds, so
 * `uploadableClauses()`, `pending()`, `pendingCount()`, `completedLessonIds()`
 * and `enqueue()`'s idempotency lookup all execute unmodified. Invariants
 * covered:
 *
 *   - toCompletionRow: a finished xAPI statement projects to the right columns,
 *     unsynced, keyed by the CLIENT-GENERATED UUID.
 *   - enqueue: APPEND-ONLY and IDEMPOTENT BY UUID — enqueuing the same id twice
 *     yields ONE row and never mutates the first.
 *   - pending()/pendingCount(): permanently-rejected rows are EXCLUDED while
 *     fresh (last_error NULL) and transiently-failed rows still upload — the
 *     SQL-null-safe disjunction in uploadableClauses().
 *   - completedLessonIds(): the identity fence — only the CURRENT verified
 *     user's rows count, only completion verbs count, corrupt rows are skipped.
 *   - backoffDelayMs / decideNext: retry policy — exponential + capped, ack →
 *     mark-synced, rejected → give-up, retryable → retry until maxAttempts, and
 *     it NEVER decides to drop the row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  xapiVerbs,
  createCompletionStatement,
  type XapiStatement,
} from '@soteria-forge/shared';

import { toCompletionRow, CompletionQueue, REJECTED_MARKER } from '../queue';
import { backoffDelayMs, decideNext, DEFAULT_BACKOFF } from '../sync';
import { makeFakeDb } from './fakeDb';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function sampleStatement(id?: string): XapiStatement {
  return createCompletionStatement({
    id,
    tenantId: 'tenant-alpha',
    actor: { name: 'Worker One', account: { homePage: 'https://soteria', name: 'user-1' } },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/course/c1' },
    result: { completion: true, success: true },
    timestamp: '2026-07-01T12:00:00.000Z',
  });
}

interface LessonStatementInput {
  id?: string;
  verb?: string;
  lessonId?: string | null;
  courseId?: string;
}

/** A lesson-scoped statement shaped like the app's real completion emissions. */
function lessonStatement({
  id,
  verb = xapiVerbs.completed,
  lessonId = 'lesson-1',
  courseId = 'course-1',
}: LessonStatementInput = {}): XapiStatement {
  return createCompletionStatement({
    id,
    tenantId: 'tenant-alpha',
    actor: { name: 'Worker One' },
    verb: { id: verb, display: { 'en-US': 'verb' } },
    object: { id: `https://soteria/lesson/${lessonId ?? 'none'}` },
    context: lessonId === null ? { course_id: courseId } : { course_id: courseId, lesson_id: lessonId },
  });
}

// ---------------------------------------------------------------------------
// toCompletionRow — pure projection
// ---------------------------------------------------------------------------

test('toCompletionRow projects a statement into an unsynced, UUID-keyed row', () => {
  const stmt = sampleStatement('11111111-1111-4111-8111-111111111111');
  const row = toCompletionRow(stmt, 'user-1', 1_700_000_000_000);

  assert.equal(row.statement_id, stmt.id);
  assert.equal(row.tenant_id, 'tenant-alpha');
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.verb, xapiVerbs.completed);
  assert.equal(row.object_id, 'https://soteria/course/c1');
  assert.equal(row.timestamp, '2026-07-01T12:00:00.000Z');
  // Enqueued rows are ALWAYS unsynced with zero attempts — the sync engine owns
  // the transition to synced=true, never the queue writer.
  assert.equal(row.synced, false);
  assert.equal(row.synced_at, null);
  assert.equal(row.attempt_count, 0);
  assert.equal(row.enqueued_at, 1_700_000_000_000);
  // The full canonical statement round-trips through the JSON column.
  assert.deepEqual(JSON.parse(row.statement_json), stmt);
});

test('toCompletionRow carries a result when present and null otherwise', () => {
  const withResult = toCompletionRow(sampleStatement(), 'user-1');
  assert.ok(withResult.result_json);
  assert.deepEqual(JSON.parse(withResult.result_json as string), { completion: true, success: true });

  const noResult = toCompletionRow(
    createCompletionStatement({
      tenantId: 'tenant-alpha',
      actor: { name: 'W' },
      verb: { id: xapiVerbs.experienced, display: { 'en-US': 'experienced' } },
      object: { id: 'https://soteria/lesson/l1' },
    }),
    'user-1',
  );
  assert.equal(noResult.result_json, null);
});

// ---------------------------------------------------------------------------
// enqueue — REAL code path: append-only + idempotent by UUID
// ---------------------------------------------------------------------------

test('enqueue is append-only and idempotent by UUID (real CompletionQueue path)', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const id = '22222222-2222-4222-8222-222222222222';

  const input = {
    id,
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'Worker One' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/course/c1' },
    timestamp: '2026-07-01T12:00:00.000Z',
  };

  const first = await queue.enqueue(input);
  const second = await queue.enqueue(input); // same UUID → must NOT add a row

  assert.equal(collection.rows.length, 1, 'same UUID enqueued twice must yield ONE row');
  assert.equal(first, second, 'second enqueue returns the existing row unchanged');
  assert.equal(collection.rows[0]?.synced, false, 'existing row is never mutated by re-enqueue');
  assert.equal(collection.rows[0]?.attemptCount, 0);

  // A different UUID appends a second row (append-only growth).
  await queue.enqueue({ ...input, id: '33333333-3333-4333-8333-333333333333' });
  assert.equal(collection.rows.length, 2);
});

test('enqueue mints a fresh UUID when none is supplied', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const input = {
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'Worker One' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/course/c1' },
  };
  const a = await queue.enqueue(input);
  const b = await queue.enqueue(input); // no id → a NEW statement, appended

  assert.match(a.statementId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(a.statementId, b.statementId);
  assert.equal(collection.rows.length, 2);
});

test('a full offline course reconciles cleanly: many appends, each a distinct UUID', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  // Simulate completing 10 lessons offline — 10 statements, all unique ids.
  for (let i = 0; i < 10; i++) {
    await queue.enqueue({
      tenantId: 'tenant-alpha',
      userId: 'user-1',
      actor: { name: 'Worker One' },
      verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
      object: { id: `https://soteria/lesson/l${i}` },
    });
  }
  assert.equal(collection.rows.length, 10);
  assert.equal(collection.rows.every((r) => !r.synced), true, 'all queued, none synced yet');
  // All ids distinct → server dedupe leaves exactly one of each; no conflicts.
  const ids = new Set(collection.rows.map((r) => r.statementId));
  assert.equal(ids.size, 10);
});

// ---------------------------------------------------------------------------
// pending() / pendingCount() — rejected-row exclusion (uploadableClauses)
// ---------------------------------------------------------------------------

async function seedOutbox(queue: CompletionQueue) {
  // Four rows in enqueue order: fresh, transient-failed, rejected, synced.
  const fresh = await queue.enqueue({
    id: '44444444-4444-4444-8444-444444444441',
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/fresh' },
  });
  const retryable = await queue.enqueue({
    id: '44444444-4444-4444-8444-444444444442',
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/retryable' },
  });
  await retryable.update((r) => {
    r.attemptCount = 2;
    r.lastError = 'retryable';
  });
  const rejected = await queue.enqueue({
    id: '44444444-4444-4444-8444-444444444443',
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/rejected' },
  });
  await rejected.update((r) => {
    r.attemptCount = 1;
    r.lastError = REJECTED_MARKER;
  });
  const synced = await queue.enqueue({
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/synced' },
  });
  await synced.update((r) => {
    r.synced = true;
  });
  return { fresh, retryable, rejected, synced };
}

test('pending() uploads fresh + transiently-failed rows but EXCLUDES rejected and synced', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const { fresh, retryable } = await seedOutbox(queue);

  const pending = await queue.pending();
  assert.deepEqual(
    pending.map((r) => r.statementId),
    [fresh.statementId, retryable.statementId],
    'fresh (last_error NULL) and retryable rows drain; rejected/synced do not',
  );
  assert.equal(await queue.pendingCount(), 2);
});

test('a fresh row with NULL last_error is uploadable (SQL null semantics guard)', async () => {
  // The regression this guards: `last_error != "rejected"` alone excludes NULL
  // rows under SQL three-valued logic — brand-new rows would never upload. The
  // fake's notEq implements SQL semantics, so uploadableClauses()'s explicit
  // IS-NULL disjunction is what makes this pass.
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const row = await queue.enqueue({
    tenantId: 'tenant-alpha',
    userId: 'user-1',
    actor: { name: 'W' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/l1' },
  });
  assert.equal(row.lastError, undefined);
  assert.equal(await queue.pendingCount(), 1);
});

test('pending() preserves append order (oldest first)', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  await seedOutbox(queue);
  // Scramble enqueuedAt to prove the sort is real, not insertion order.
  collection.rows[0]!.enqueuedAt = 300;
  collection.rows[1]!.enqueuedAt = 100;
  const pending = await queue.pending();
  assert.deepEqual(
    pending.map((r) => r.enqueuedAt),
    [100, 300],
  );
});

// ---------------------------------------------------------------------------
// completedLessonIds — identity fence + verb set + defensive parsing
// ---------------------------------------------------------------------------

test('completedLessonIds returns ONLY the requesting user’s completions', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  await queue.enqueue({
    tenantId: 'tenant-alpha',
    userId: 'user-a',
    actor: { name: 'A' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/a1' },
    context: { course_id: 'course-1', lesson_id: 'lesson-a1' },
  });
  await queue.enqueue({
    tenantId: 'tenant-alpha',
    userId: 'user-b',
    actor: { name: 'B' },
    verb: { id: xapiVerbs.completed, display: { 'en-US': 'completed' } },
    object: { id: 'https://soteria/lesson/b1' },
    context: { course_id: 'course-1', lesson_id: 'lesson-b1' },
  });

  // The fence: one user's completions can never render as another's.
  assert.deepEqual([...(await queue.completedLessonIds('user-a'))], ['lesson-a1']);
  assert.deepEqual([...(await queue.completedLessonIds('user-b'))], ['lesson-b1']);
  assert.equal((await queue.completedLessonIds('user-c')).size, 0);
  // No verified identity → nothing to show, never "everything".
  assert.equal((await queue.completedLessonIds('')).size, 0);
});

test('completedLessonIds counts exactly the server trigger’s verb set (completed|passed, never failed)', async () => {
  const { db } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const enq = (verb: string, lessonId: string) =>
    queue.enqueue({
      tenantId: 'tenant-alpha',
      userId: 'user-1',
      actor: { name: 'W' },
      verb: { id: verb, display: { 'en-US': 'v' } },
      object: { id: `https://soteria/lesson/${lessonId}` },
      context: { course_id: 'course-1', lesson_id: lessonId },
    });
  await enq(xapiVerbs.completed, 'l-completed');
  await enq(xapiVerbs.passed, 'l-passed');
  await enq(xapiVerbs.failed, 'l-failed'); // recorded, but NEVER counts
  await enq(xapiVerbs.experienced, 'l-experienced');

  const ids = await queue.completedLessonIds('user-1');
  assert.deepEqual([...ids].sort(), ['l-completed', 'l-passed']);
});

test('completedLessonIds filters by course, requires context.lesson_id, and skips corrupt rows', async () => {
  const { db, collection } = makeFakeDb();
  const queue = new CompletionQueue(db);
  const enq = (stmt: XapiStatement) =>
    queue.enqueue({
      id: stmt.id,
      tenantId: stmt.tenantId,
      userId: 'user-1',
      actor: stmt.actor,
      verb: stmt.verb,
      object: stmt.object,
      context: stmt.context,
    });
  await enq(lessonStatement({ lessonId: 'in-course', courseId: 'course-1' }));
  await enq(lessonStatement({ lessonId: 'other-course', courseId: 'course-2' }));
  await enq(lessonStatement({ lessonId: null, courseId: 'course-1' })); // no lesson_id → ignored

  // A corrupt local JSON payload must not blank the whole list — skip it.
  const corrupt = await enq(lessonStatement({ lessonId: 'corrupt', courseId: 'course-1' }));
  await corrupt.update((r) => {
    (r as { statementJson: string }).statementJson = '{not json';
  });
  assert.equal(collection.rows.length, 4);

  assert.deepEqual([...(await queue.completedLessonIds('user-1', 'course-1'))], ['in-course']);
  assert.deepEqual(
    [...(await queue.completedLessonIds('user-1'))].sort(),
    ['in-course', 'other-course'],
    'without a courseId filter, every course’s completions are visible',
  );
});

// ---------------------------------------------------------------------------
// Backoff policy — pure
// ---------------------------------------------------------------------------

test('backoffDelayMs grows exponentially and caps at maxMs', () => {
  const p = DEFAULT_BACKOFF;
  assert.equal(backoffDelayMs(0, p), p.baseMs); // 1s
  assert.equal(backoffDelayMs(1, p), p.baseMs * p.factor); // 2s
  assert.equal(backoffDelayMs(2, p), p.baseMs * p.factor * p.factor); // 4s
  // The delay is monotonically non-decreasing attempt over attempt…
  for (let a = 1; a < 20; a++) {
    assert.ok(backoffDelayMs(a, p) >= backoffDelayMs(a - 1, p));
  }
  // …and far out it saturates at the cap and never exceeds it.
  assert.equal(backoffDelayMs(9, p), p.maxMs); // 1s × 2^9 = 512s > 300s cap
  assert.equal(backoffDelayMs(100, p), p.maxMs);
  // Negative/zero attempts degrade to the base, never to 0 or NaN.
  assert.equal(backoffDelayMs(-3, p), p.baseMs);
});

// ---------------------------------------------------------------------------
// Retry decision — pure; proves the queue is NEVER dropped
// ---------------------------------------------------------------------------

test('decideNext: ack → mark-synced', () => {
  assert.deepEqual(decideNext('acked', 0), { action: 'mark-synced' });
  assert.deepEqual(decideNext('acked', 5), { action: 'mark-synced' });
});

test('decideNext: rejected → give-up (but the row is retained, not deleted)', () => {
  // give-up means "stop auto-retrying"; the engine still keeps the row on disk.
  assert.deepEqual(decideNext('rejected', 0), { action: 'give-up' });
  assert.deepEqual(decideNext('rejected', DEFAULT_BACKOFF.maxAttempts + 5), { action: 'give-up' });
});

test('decideNext: retryable retries with GROWING backoff until maxAttempts, then gives up', () => {
  const p = DEFAULT_BACKOFF;
  let previousDelay = 0;
  for (let attempt = 0; attempt < p.maxAttempts - 1; attempt++) {
    const d = decideNext('retryable', attempt, p);
    assert.equal(d.action, 'retry', `attempt ${attempt} still retries`);
    const delay = (d as { delayMs: number }).delayMs;
    assert.equal(delay, backoffDelayMs(attempt, p));
    assert.ok(delay >= previousDelay, 'delay never shrinks as attempts grow');
    previousDelay = delay;
  }
  // On the last permitted attempt — and beyond — switch to give-up (still
  // never drops the row).
  assert.deepEqual(decideNext('retryable', p.maxAttempts - 1, p), { action: 'give-up' });
  assert.deepEqual(decideNext('retryable', p.maxAttempts, p), { action: 'give-up' });
  assert.deepEqual(decideNext('retryable', p.maxAttempts + 100, p), { action: 'give-up' });
});

test('decideNext never returns an action that discards the queued statement', () => {
  const actions = new Set<string>();
  (['acked', 'retryable', 'rejected'] as const).forEach((o) => {
    for (let a = 0; a < DEFAULT_BACKOFF.maxAttempts + 2; a++) {
      actions.add(decideNext(o, a).action);
    }
  });
  // The only three outcomes are mark-synced / retry / give-up — there is no
  // "drop" or "delete": a queued statement is never thrown away.
  assert.deepEqual([...actions].sort(), ['give-up', 'mark-synced', 'retry']);
});
