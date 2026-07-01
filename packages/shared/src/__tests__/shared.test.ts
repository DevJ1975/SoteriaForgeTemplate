/**
 * Unit tests for the shared domain package.
 *
 * Runner: node:test (built in). No framework dependency. After `tsc` emits to
 * dist/, run with `node --test dist/__tests__/shared.test.js` (see the package's
 * "test" script). Assertions use node:assert/strict only.
 *
 * Coverage:
 *   - assertTenantMatch throws on mismatch, passes on match; isSameTenant predicate
 *   - completion-statement idempotency key stability (id, not timestamp)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
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
