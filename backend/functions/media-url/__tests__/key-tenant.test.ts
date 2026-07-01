/**
 * Unit tests for the media-url key->tenant parse + assert logic (AWS-free).
 *
 * Runner: node:test (built in). No framework dependency; assertions use
 * node:assert/strict only. These cover the OBJECT-LEVEL tenant boundary in
 * isolation from any AWS wiring — proving that a cross-tenant or malformed key is
 * refused BEFORE any URL could be signed.
 *
 * Coverage:
 *   - parseKeyTenant: valid keys yield the tenant; malformed/traversal/short keys yield null
 *   - assertKeyTenant: passes on same-tenant, throws on mismatch / unparseable / empty claim
 *   - isMediaKind / isMediaOp narrowing
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseKeyTenant,
  assertKeyTenant,
  isMediaKind,
  isMediaOp,
  TenantIsolationError,
} from '../key-tenant.ts'

test('parseKeyTenant extracts the tenant from a well-formed media key', () => {
  assert.equal(parseKeyTenant('media/videos/acme-co/lesson-42/source.mp4'), 'acme-co')
  assert.equal(parseKeyTenant('media/documents/tenant-b/guide.pdf'), 'tenant-b')
  assert.equal(parseKeyTenant('media/thumbnails/t1/a/b/c.png'), 't1')
  assert.equal(parseKeyTenant('media/offline-bundles/t1/bundle.zip'), 't1')
})

test('parseKeyTenant returns null for malformed / unsafe keys', () => {
  // Wrong prefix.
  assert.equal(parseKeyTenant('private/videos/t1/x.mp4'), null)
  // Unknown kind.
  assert.equal(parseKeyTenant('media/secrets/t1/x.mp4'), null)
  // No object beyond the tenant prefix (bare prefix — a listing attempt).
  assert.equal(parseKeyTenant('media/videos/t1'), null)
  assert.equal(parseKeyTenant('media/videos/t1/'), null)
  // Path traversal anywhere.
  assert.equal(parseKeyTenant('media/videos/t1/../t2/x.mp4'), null)
  assert.equal(parseKeyTenant('media/videos/../t2/x.mp4'), null)
  // Empty segments.
  assert.equal(parseKeyTenant('media//t1/x.mp4'), null)
  assert.equal(parseKeyTenant('media/videos//x.mp4'), null)
  // Absolute / scheme-y.
  assert.equal(parseKeyTenant('/media/videos/t1/x.mp4'), null)
  assert.equal(parseKeyTenant('s3://media/videos/t1/x.mp4'), null)
  // Empty / nullish.
  assert.equal(parseKeyTenant(''), null)
  assert.equal(parseKeyTenant(null), null)
  assert.equal(parseKeyTenant(undefined), null)
})

test('assertKeyTenant passes when the key tenant matches the verified claim', () => {
  assert.doesNotThrow(() => assertKeyTenant('acme-co', 'media/videos/acme-co/x.mp4'))
  assert.equal(assertKeyTenant('acme-co', 'media/videos/acme-co/x.mp4'), 'acme-co')
})

test('assertKeyTenant REFUSES a cross-tenant key', () => {
  assert.throws(
    () => assertKeyTenant('acme-co', 'media/videos/other-tenant/secret.mp4'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
})

test('assertKeyTenant REFUSES an unparseable key (cannot prove ownership)', () => {
  assert.throws(
    () => assertKeyTenant('acme-co', 'media/videos/acme-co'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
  assert.throws(
    () => assertKeyTenant('acme-co', 'not-a-media-key'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
})

test('assertKeyTenant REFUSES when the caller claim is empty (empty => deny)', () => {
  assert.throws(
    () => assertKeyTenant('', 'media/videos/acme-co/x.mp4'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
  assert.throws(
    () => assertKeyTenant(null, 'media/videos/acme-co/x.mp4'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
})

test('assertKeyTenant does NOT allow a tenant to be a prefix of another (strict equality)', () => {
  // 'acme' must not be accepted for a key owned by 'acme-co'.
  assert.throws(
    () => assertKeyTenant('acme', 'media/videos/acme-co/x.mp4'),
    (err: unknown) => err instanceof TenantIsolationError,
  )
})

test('isMediaKind / isMediaOp narrow correctly', () => {
  assert.equal(isMediaKind('videos'), true)
  assert.equal(isMediaKind('secrets'), false)
  assert.equal(isMediaKind(undefined), false)
  assert.equal(isMediaOp('get'), true)
  assert.equal(isMediaOp('put'), true)
  assert.equal(isMediaOp('delete'), false)
  assert.equal(isMediaOp(null), false)
})
