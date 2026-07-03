/**
 * Tests for the chunked secure session storage (createChunkedSecureStorage):
 * the supabase-js auth storage adapter that splits values past SecureStore's
 * 2 KB Android cap and FAILS CLOSED on any inconsistency — a partially-present
 * or corrupt chunk set must read as null (signed out), never as a mangled
 * session. Runs against an in-memory fake AsyncKeyValueStore.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createChunkedSecureStorage,
  CHUNK_SIZE,
  CHUNK_MARKER,
  chunkKey,
} from '../chunkedSecureStorage';
import type { AsyncKeyValueStore } from '../../lib/secureStore';

class FakeSecureStore implements AsyncKeyValueStore {
  map = new Map<string, string>();
  failReads = false;
  failWrites = false;

  async getItemAsync(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('keystore read failure');
    return this.map.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('keystore write failure');
    this.map.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.map.delete(key);
  }
}

function makeStorage() {
  const store = new FakeSecureStore();
  const storage = createChunkedSecureStorage(store);
  return { store, storage };
}

const KEY = 'sb-session';
/** An ASCII payload guaranteed to span `n` chunks. */
function payload(n: number): string {
  return 'x'.repeat(CHUNK_SIZE * (n - 1) + 42);
}

test('a small value round-trips as a single plain entry (no chunks)', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, 'short-session-json');
  assert.equal(await storage.getItem(KEY), 'short-session-json');
  assert.equal(store.map.size, 1, 'exactly the base key, no chunk entries');
  assert.equal(store.map.get(KEY), 'short-session-json');
});

test('a value past the 2 KB cap chunks transparently and round-trips byte-identical', async () => {
  const { store, storage } = makeStorage();
  const value = payload(3);
  await storage.setItem(KEY, value);

  // Layout: marker under the base key, chunk payloads under <key>.0..2.
  assert.equal(store.map.get(KEY), `${CHUNK_MARKER}3`);
  assert.equal(store.map.get(chunkKey(KEY, 0))?.length, CHUNK_SIZE);
  assert.equal(store.map.get(chunkKey(KEY, 1))?.length, CHUNK_SIZE);
  assert.equal(store.map.get(chunkKey(KEY, 2))?.length, 42);
  assert.equal(store.map.has(chunkKey(KEY, 3)), false);

  assert.equal(await storage.getItem(KEY), value);
});

test('a MISSING chunk fails closed: getItem reports null (signed out), never a partial value', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, payload(3));
  store.map.delete(chunkKey(KEY, 1)); // simulate a crash-torn write / eviction
  assert.equal(await storage.getItem(KEY), null);
});

test('a corrupt chunk-count marker fails closed', async () => {
  const { store, storage } = makeStorage();
  for (const marker of ['garbage', '0', '-2', 'NaN', '']) {
    store.map.set(KEY, `${CHUNK_MARKER}${marker}`);
    assert.equal(await storage.getItem(KEY), null, `marker "${marker}" must read as null`);
  }
});

test('a missing key reads as null', async () => {
  const { storage } = makeStorage();
  assert.equal(await storage.getItem('never-written'), null);
});

test('shrinking a value cleans up stale chunks (large → small → no leftovers)', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, payload(4));
  assert.equal(store.map.size, 5); // marker + 4 chunks

  await storage.setItem(KEY, 'now-tiny');
  assert.equal(await storage.getItem(KEY), 'now-tiny');
  assert.equal(store.map.size, 1, 'every stale chunk from the larger value is gone');
});

test('shrinking the chunk COUNT cleans up the tail chunks', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, payload(4));
  await storage.setItem(KEY, payload(2));
  assert.equal(await storage.getItem(KEY), payload(2));
  assert.equal(store.map.has(chunkKey(KEY, 2)), false, 'chunk .2 from the old value removed');
  assert.equal(store.map.has(chunkKey(KEY, 3)), false, 'chunk .3 from the old value removed');
});

test('removeItem deletes the marker AND every chunk', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, payload(3));
  await storage.removeItem(KEY);
  assert.equal(await storage.getItem(KEY), null);
  assert.equal(store.map.size, 0);
});

test('keystore read failures degrade to null; write failures never throw into auth', async () => {
  const { store, storage } = makeStorage();
  await storage.setItem(KEY, 'value');

  store.failReads = true;
  assert.equal(await storage.getItem(KEY), null, 'fail closed on read errors');

  store.failReads = false;
  store.failWrites = true;
  await assert.doesNotReject(() => storage.setItem(KEY, payload(2)));
  await assert.doesNotReject(() => storage.removeItem(KEY));
});
