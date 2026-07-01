/**
 * Unit tests for the server-side tenant-ownership STAMP logic (AWS-free).
 *
 * Runner: node:test (built in). No framework dependency; assertions use
 * node:assert/strict only. These prove the stamp derives BOTH isolation fields
 * from the single verified claim and can never take them from client input —
 * in isolation from any AWS wiring.
 *
 * Coverage:
 *   - stampTenantOwnership derives tenantId + adminGroup from the one claim
 *   - tenantAdminGroup format (admin::<tenantId>)
 *   - applyTenantStamp OVERWRITES client-supplied tenantId/adminGroup, keeps the rest
 *   - empty / whitespace / delimiter-bearing claims are refused (fail closed)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  stampTenantOwnership,
  tenantAdminGroup,
  applyTenantStamp,
  ADMIN_GROUP_PREFIX,
  TenantIsolationError,
} from '../tenant-stamp.ts'

test('stampTenantOwnership derives both fields from the one verified claim', () => {
  assert.deepEqual(stampTenantOwnership('acme-co'), {
    tenantId: 'acme-co',
    adminGroup: 'admin::acme-co',
  })
})

test('tenantAdminGroup uses the admin:: prefix', () => {
  assert.equal(ADMIN_GROUP_PREFIX, 'admin::')
  assert.equal(tenantAdminGroup('acme-co'), 'admin::acme-co')
})

test('applyTenantStamp OVERWRITES any client-supplied tenant fields', () => {
  const clientInput = {
    courseId: 'c1',
    title: 'Ladder Safety',
    // A malicious client trying to author into another tenant:
    tenantId: 'victim-tenant',
    adminGroup: 'admin::victim-tenant',
  }
  const stamped = applyTenantStamp('acme-co', clientInput)
  // The client's tenant fields are discarded; the stamp's are authoritative.
  assert.equal(stamped.tenantId, 'acme-co')
  assert.equal(stamped.adminGroup, 'admin::acme-co')
  // Non-tenant fields pass through untouched.
  assert.equal(stamped.courseId, 'c1')
  assert.equal(stamped.title, 'Ladder Safety')
})

test('applyTenantStamp does not mutate the input object', () => {
  const input = { tenantId: 'victim', title: 't' }
  const stamped = applyTenantStamp('acme-co', input)
  assert.equal(input.tenantId, 'victim') // original untouched
  assert.equal(stamped.tenantId, 'acme-co') // copy stamped
  assert.notEqual(input, stamped)
})

test('stampTenantOwnership fails closed on an empty / whitespace claim', () => {
  assert.throws(() => stampTenantOwnership(''), (e: unknown) => e instanceof TenantIsolationError)
  assert.throws(() => stampTenantOwnership('   '), (e: unknown) => e instanceof TenantIsolationError)
  // @ts-expect-error — exercising the runtime guard against non-string input.
  assert.throws(() => stampTenantOwnership(undefined), (e: unknown) => e instanceof TenantIsolationError)
})

test('stampTenantOwnership refuses a claim containing the key delimiter', () => {
  // A '#' could forge a cross-entity key / malformed group string.
  assert.throws(
    () => stampTenantOwnership('acme#evil'),
    (e: unknown) => e instanceof TenantIsolationError,
  )
})

test('applyTenantStamp fails closed when the claim is empty (no row could be written)', () => {
  assert.throws(
    () => applyTenantStamp('', { title: 't' }),
    (e: unknown) => e instanceof TenantIsolationError,
  )
})
