/**
 * Tests for the profile-projection cache trust rules (profileCacheCore): the
 * offline cold-start bridge is only ever valid under the EXACT verified-session
 * user id that wrote it. A mismatched or corrupt cache is discarded — deleted,
 * never returned — and junk is never cached in the first place. Runs against
 * an in-memory fake AsyncKeyValueStore.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  saveProfileProjectionTo,
  loadProfileProjectionFrom,
  clearProfileProjectionIn,
  keyFor,
  type CachedProfileProjection,
} from '../profileCacheCore';
import type { AsyncKeyValueStore } from '../../lib/secureStore';

class FakeSecureStore implements AsyncKeyValueStore {
  map = new Map<string, string>();
  failWrites = false;
  failDeletes = false;

  async getItemAsync(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('keystore write failure');
    this.map.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    if (this.failDeletes) throw new Error('keystore delete failure');
    this.map.delete(key);
  }
}

const PROJECTION: CachedProfileProjection = {
  userId: 'user-a',
  tenantId: 'tenant-alpha',
  role: 'worker',
  displayName: 'Worker One',
  email: 'worker@example.com',
};

test('round-trip: the cache is valid ONLY under the matching verified user id', async () => {
  const store = new FakeSecureStore();
  await saveProfileProjectionTo(store, PROJECTION);
  assert.deepEqual(await loadProfileProjectionFrom(store, 'user-a'), PROJECTION);
});

test('a DIFFERENT session user id never sees another user’s cache', async () => {
  const store = new FakeSecureStore();
  await saveProfileProjectionTo(store, PROJECTION);
  // user-b's key simply has no entry — the cache is per-user-id-keyed.
  assert.equal(await loadProfileProjectionFrom(store, 'user-b'), null);
  // And user-a's entry is untouched.
  assert.ok(store.map.has(keyFor('user-a')));
});

test('a cache whose CONTENT mismatches its key is discarded AND deleted (tamper guard)', async () => {
  const store = new FakeSecureStore();
  // Simulate tampering: user-b's slot holds a projection claiming to be user-a.
  store.map.set(keyFor('user-b'), JSON.stringify(PROJECTION));

  assert.equal(await loadProfileProjectionFrom(store, 'user-b'), null);
  assert.equal(store.map.has(keyFor('user-b')), false, 'the mismatched entry is deleted, never trusted');
});

test('corrupt or structurally-invalid cache content is discarded, never a crash', async () => {
  const store = new FakeSecureStore();
  const bads = [
    '{not json',
    'null',
    '[]',
    JSON.stringify({ userId: 'user-a' }), // no tenantId/role
    JSON.stringify({ userId: 'user-a', tenantId: '', role: 'worker' }), // empty tenant
    JSON.stringify({ userId: 'user-a', tenantId: 42, role: 'worker' }), // wrong type
    JSON.stringify({ userId: 'user-a', tenantId: 'tenant-alpha' }), // no role
  ];
  for (const bad of bads) {
    store.map.set(keyFor('user-a'), bad);
    assert.equal(await loadProfileProjectionFrom(store, 'user-a'), null, `must reject: ${bad}`);
  }
});

test('non-string optional fields are dropped rather than trusted', async () => {
  const store = new FakeSecureStore();
  store.map.set(
    keyFor('user-a'),
    JSON.stringify({ userId: 'user-a', tenantId: 'tenant-alpha', role: 'worker', displayName: 7, email: {} }),
  );
  const loaded = await loadProfileProjectionFrom(store, 'user-a');
  assert.ok(loaded);
  assert.equal(loaded.displayName, undefined);
  assert.equal(loaded.email, undefined);
});

test('an empty session user id loads nothing', async () => {
  const store = new FakeSecureStore();
  await saveProfileProjectionTo(store, PROJECTION);
  assert.equal(await loadProfileProjectionFrom(store, ''), null);
});

test('junk is never cached: a projection without userId or tenantId is not persisted', async () => {
  const store = new FakeSecureStore();
  await saveProfileProjectionTo(store, { ...PROJECTION, userId: '' });
  await saveProfileProjectionTo(store, { ...PROJECTION, tenantId: '' });
  assert.equal(store.map.size, 0);
});

test('clear removes exactly the one user’s projection (sign-out / authoritative absence)', async () => {
  const store = new FakeSecureStore();
  await saveProfileProjectionTo(store, PROJECTION);
  await saveProfileProjectionTo(store, { ...PROJECTION, userId: 'user-b' });

  await clearProfileProjectionIn(store, 'user-a');
  assert.equal(await loadProfileProjectionFrom(store, 'user-a'), null);
  const b = await loadProfileProjectionFrom(store, 'user-b');
  assert.equal(b?.userId, 'user-b', 'other users’ caches are untouched');
});

test('keystore hiccups are fail-soft: save/clear never throw', async () => {
  const store = new FakeSecureStore();
  store.failWrites = true;
  await assert.doesNotReject(() => saveProfileProjectionTo(store, PROJECTION));
  store.failDeletes = true;
  await assert.doesNotReject(() => clearProfileProjectionIn(store, 'user-a'));
});
