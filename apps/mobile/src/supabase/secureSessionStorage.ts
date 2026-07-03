/**
 * secureSessionStorage — a Supabase-Auth storage adapter backed by
 * expo-secure-store (iOS Keychain / Android Keystore) instead of plaintext
 * AsyncStorage.
 *
 * WHY: the persisted Supabase session contains the refresh token — a long-lived
 * credential. AsyncStorage is unencrypted on-disk storage readable by anything
 * with device/filesystem access (backups, other processes on rooted devices);
 * the OS keystore is the right place for it.
 *
 * CHUNKING (the 2 KB limit): SecureStore values are limited to 2048 bytes on
 * Android (and larger values are discouraged on iOS). A Supabase session JSON
 * (JWT + refresh token + user object) routinely exceeds that, so values larger
 * than one chunk are transparently split:
 *
 *   - `<key>`      → `__sf_chunks__:<n>` marker (or the plain value when small)
 *   - `<key>.0..n-1` → the chunk payloads, CHUNK_SIZE chars each
 *
 * Chunks are written BEFORE the marker so a crash mid-write can never yield a
 * marker pointing at missing chunks; a partially-present chunk set reads as
 * null (Supabase then treats the session as signed out — fail closed, never a
 * corrupted session). Reads/writes/removals always clean up stale chunks so
 * key layouts can shrink safely.
 *
 * All values here are ASCII (base64/JSON), so string length ≈ byte length;
 * CHUNK_SIZE leaves headroom under the 2048-byte cap regardless.
 *
 * NOTE: sessions previously persisted in AsyncStorage are NOT migrated — the
 * app has never shipped, so there are no real sessions to carry over; a dev
 * device simply signs in again once.
 */
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const CHUNK_MARKER = '__sf_chunks__:';

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/** Delete contiguous chunk entries starting at `fromIndex` until a gap. */
async function clearChunks(key: string, fromIndex = 0): Promise<void> {
  for (let i = fromIndex; ; i++) {
    const existing = await SecureStore.getItemAsync(chunkKey(key, i));
    if (existing === null) break;
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

/**
 * The adapter object supabase-js's auth storage expects
 * ({ getItem, setItem, removeItem }, all async). Errors fail CLOSED: a value
 * that cannot be read/parsed reports null (signed out) rather than throwing
 * into supabase-js internals.
 */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const base = await SecureStore.getItemAsync(key);
      if (base === null) return null;
      if (!base.startsWith(CHUNK_MARKER)) return base;

      const count = Number.parseInt(base.slice(CHUNK_MARKER.length), 10);
      if (!Number.isInteger(count) || count <= 0) return null;

      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part === null) return null; // incomplete set → fail closed
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await clearChunks(key); // drop any stale chunks from a larger past value
        return;
      }
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(
          chunkKey(key, i),
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        );
      }
      // Marker last: a crash above leaves the previous value's marker intact
      // or (first write) no marker at all — never a dangling reference.
      await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
      await clearChunks(key, count); // drop leftovers from a longer past value
    } catch {
      // A failed persist must not crash auth; the session simply won't
      // survive a restart (supabase-js keeps it in memory for this run).
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
      await clearChunks(key);
    } catch {
      // Best-effort removal; keys are also overwritten on the next sign-in.
    }
  },
};
