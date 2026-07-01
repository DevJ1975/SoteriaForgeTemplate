/**
 * Unit tests for the shared domain package.
 *
 * Runner: node:test (built in). No framework dependency. After `tsc` emits to
 * dist/, run with `node --test dist/__tests__/shared.test.js` (see the package's
 * "test" script). Assertions use node:assert/strict only.
 *
 * Coverage:
 *   - key builders round-trip through parseSk
 *   - assertTenantMatch throws on mismatch, passes on match; isSameTenant predicate
 *   - completion-statement idempotency key stability (id, not timestamp)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  // keys
  tenantPk,
  parseTenantPk,
  tenantMetaSk,
  userSk,
  courseSk,
  moduleSk,
  lessonSk,
  enrollmentSk,
  stmtSk,
  videoSk,
  parseSk,
  primaryKey,
  // tenant
  assertTenantMatch,
  isSameTenant,
  TenantIsolationError,
  // xapi
  createCompletionStatement,
  statementIdempotencyKey,
  isUuid,
  generateStatementId,
  xapiVerbs,
  // roles
  hasRequiredGroup,
  hasMinimumGroup,
  groupToUserRole,
  userRoleToGroup,
  normalizeGroups,
} from '../index.js'

// ---------------------------------------------------------------------------
// keys: builders round-trip via parseSk
// ---------------------------------------------------------------------------

test('tenantPk builds and parseTenantPk round-trips', () => {
  const pk = tenantPk('acme')
  assert.equal(pk, 'TENANT#acme')
  assert.equal(parseTenantPk(pk), 'acme')
  assert.equal(parseTenantPk('WRONG#acme'), null)
  assert.equal(parseTenantPk('TENANT'), null)
})

test('tenantMetaSk parses to TENANT_META', () => {
  const sk = tenantMetaSk()
  assert.equal(sk, 'TENANT#META')
  assert.deepEqual(parseSk(sk), { entityType: 'TENANT_META' })
})

test('userSk round-trips', () => {
  const sk = userSk('u-1')
  assert.equal(sk, 'USER#u-1')
  assert.deepEqual(parseSk(sk), { entityType: 'USER', userId: 'u-1' })
})

test('courseSk round-trips', () => {
  const sk = courseSk('c-1')
  assert.equal(sk, 'COURSE#c-1')
  assert.deepEqual(parseSk(sk), { entityType: 'COURSE', courseId: 'c-1' })
})

test('moduleSk round-trips', () => {
  const sk = moduleSk('c-1', 'm-1')
  assert.equal(sk, 'MODULE#c-1#m-1')
  assert.deepEqual(parseSk(sk), { entityType: 'MODULE', courseId: 'c-1', moduleId: 'm-1' })
})

test('lessonSk round-trips', () => {
  const sk = lessonSk('c-1', 'm-1', 'l-1')
  assert.equal(sk, 'LESSON#c-1#m-1#l-1')
  assert.deepEqual(parseSk(sk), {
    entityType: 'LESSON',
    courseId: 'c-1',
    moduleId: 'm-1',
    lessonId: 'l-1',
  })
})

test('enrollmentSk round-trips', () => {
  const sk = enrollmentSk('u-1', 'c-1')
  assert.equal(sk, 'ENROLLMENT#u-1#c-1')
  assert.deepEqual(parseSk(sk), { entityType: 'ENROLLMENT', userId: 'u-1', courseId: 'c-1' })
})

test('stmtSk round-trips', () => {
  const sk = stmtSk('11111111-1111-4111-8111-111111111111')
  assert.equal(sk, 'STMT#11111111-1111-4111-8111-111111111111')
  assert.deepEqual(parseSk(sk), {
    entityType: 'STATEMENT',
    statementId: '11111111-1111-4111-8111-111111111111',
  })
})

test('videoSk round-trips', () => {
  const sk = videoSk('v-1')
  assert.equal(sk, 'VIDEO#v-1')
  assert.deepEqual(parseSk(sk), { entityType: 'VIDEO', videoId: 'v-1' })
})

test('parseSk returns null for unknown or malformed keys', () => {
  assert.equal(parseSk('BOGUS#x'), null)
  assert.equal(parseSk('MODULE#only-one'), null)
  assert.equal(parseSk('TENANT#not-meta'), null)
  assert.equal(parseSk('USER#'), null)
})

test('key builders reject empty and delimiter-bearing ids', () => {
  assert.throws(() => userSk(''), /non-empty/)
  assert.throws(() => courseSk('c#evil'), /delimiter/)
  assert.throws(() => moduleSk('c-1', 'm#x'), /delimiter/)
})

test('primaryKey composes PK and SK', () => {
  assert.deepEqual(primaryKey('acme', courseSk('c-1')), { PK: 'TENANT#acme', SK: 'COURSE#c-1' })
})

// ---------------------------------------------------------------------------
// tenant: isolation guard
// ---------------------------------------------------------------------------

test('isSameTenant is true only on exact match', () => {
  assert.equal(isSameTenant('acme', 'acme'), true)
  assert.equal(isSameTenant('acme', 'globex'), false)
  assert.equal(isSameTenant('', 'acme'), false)
  assert.equal(isSameTenant('acme', ''), false)
  assert.equal(isSameTenant(null, null), false)
  assert.equal(isSameTenant(undefined, 'acme'), false)
})

test('assertTenantMatch passes on match', () => {
  assert.doesNotThrow(() => assertTenantMatch('acme', 'acme'))
})

test('assertTenantMatch throws TenantIsolationError on mismatch', () => {
  assert.throws(
    () => assertTenantMatch('acme', 'globex'),
    (err: unknown) => {
      assert.ok(err instanceof TenantIsolationError)
      assert.equal((err as TenantIsolationError).code, 'TENANT_ISOLATION_VIOLATION')
      assert.equal((err as TenantIsolationError).claimTenantId, 'acme')
      assert.equal((err as TenantIsolationError).targetTenantId, 'globex')
      return true
    },
  )
})

test('assertTenantMatch throws when claim is missing (never coerces to match)', () => {
  assert.throws(() => assertTenantMatch(undefined, 'acme'), TenantIsolationError)
  assert.throws(() => assertTenantMatch('', ''), TenantIsolationError)
})

// ---------------------------------------------------------------------------
// xapi: idempotency key stability
// ---------------------------------------------------------------------------

const ACTOR = { name: 'Worker', mbox: 'mailto:worker@example.com' }
const VERB = { id: xapiVerbs.completed, display: { 'en-US': 'completed' } }
const OBJECT = { id: 'https://soteria.example/courses/c-1' }

test('createCompletionStatement uses the supplied UUID as the idempotency key', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  const stmt = createCompletionStatement({
    id,
    tenantId: 'acme',
    actor: ACTOR,
    verb: VERB,
    object: OBJECT,
    result: { completion: true },
  })
  assert.equal(stmt.id, id)
  assert.equal(statementIdempotencyKey(stmt), id)
})

test('idempotency key is stable across rebuilds with the same id despite different timestamps', () => {
  const id = '33333333-3333-4333-8333-333333333333'
  const first = createCompletionStatement({
    id,
    tenantId: 'acme',
    actor: ACTOR,
    verb: VERB,
    object: OBJECT,
    timestamp: '2026-01-01T00:00:00.000Z',
  })
  const second = createCompletionStatement({
    id,
    tenantId: 'acme',
    actor: ACTOR,
    verb: VERB,
    object: OBJECT,
    timestamp: '2026-07-01T00:00:00.000Z',
  })
  assert.notEqual(first.timestamp, second.timestamp)
  // Same id => same idempotency key => server dedupes to one statement.
  assert.equal(statementIdempotencyKey(first), statementIdempotencyKey(second))
})

test('createCompletionStatement generates a valid UUID when id omitted', () => {
  const stmt = createCompletionStatement({
    tenantId: 'acme',
    actor: ACTOR,
    verb: VERB,
    object: OBJECT,
  })
  assert.ok(isUuid(stmt.id), `generated id should be a UUID, got ${stmt.id}`)
})

test('createCompletionStatement rejects a non-UUID id', () => {
  assert.throws(
    () =>
      createCompletionStatement({
        id: 'not-a-uuid',
        tenantId: 'acme',
        actor: ACTOR,
        verb: VERB,
        object: OBJECT,
      }),
    /valid UUID/,
  )
})

test('generateStatementId produces distinct valid UUIDs', () => {
  const a = generateStatementId()
  const b = generateStatementId()
  assert.ok(isUuid(a))
  assert.ok(isUuid(b))
  assert.notEqual(a, b)
})

// ---------------------------------------------------------------------------
// roles: Cognito group model + legacy mapping
// ---------------------------------------------------------------------------

test('group <-> legacy UserRole mapping is 1:1', () => {
  assert.equal(groupToUserRole('worker'), 'learner')
  assert.equal(groupToUserRole('supervisor'), 'manager')
  assert.equal(groupToUserRole('tenant-admin'), 'admin')
  assert.equal(groupToUserRole('super-admin'), 'superadmin')
  assert.equal(userRoleToGroup('learner'), 'worker')
  assert.equal(userRoleToGroup('superadmin'), 'super-admin')
})

test('hasRequiredGroup: super-admin satisfies anything, others must match', () => {
  assert.equal(hasRequiredGroup(['super-admin'], ['tenant-admin']), true)
  assert.equal(hasRequiredGroup(['worker'], ['tenant-admin']), false)
  assert.equal(hasRequiredGroup(['supervisor'], ['supervisor', 'tenant-admin']), true)
  assert.equal(hasRequiredGroup(['worker'], []), true)
})

test('hasMinimumGroup ranks correctly', () => {
  assert.equal(hasMinimumGroup(['supervisor'], 'worker'), true)
  assert.equal(hasMinimumGroup(['worker'], 'supervisor'), false)
  assert.equal(hasMinimumGroup(['tenant-admin'], 'tenant-admin'), true)
})

test('normalizeGroups drops unknown groups and de-dupes', () => {
  assert.deepEqual(normalizeGroups(['worker', 'worker', 'bogus', 'super-admin']), ['worker', 'super-admin'])
  assert.deepEqual(normalizeGroups('not-an-array'), [])
})
