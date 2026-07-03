/**
 * profileCache — the app-facing binding of the profile-projection cache to the
 * OS keystore (expo-secure-store). The trust rules (verified-session keying,
 * mismatch discard, fail-soft) live in `./profileCacheCore.ts`, which is
 * node-safe and unit-tested with an in-memory fake store; this module only
 * supplies the real store. See profileCacheCore.ts for the threat model.
 */
import * as SecureStore from 'expo-secure-store';
import {
  saveProfileProjectionTo,
  loadProfileProjectionFrom,
  clearProfileProjectionIn,
  type CachedProfileProjection,
} from './profileCacheCore';

export type { CachedProfileProjection } from './profileCacheCore';

/** Persist the projection for its own userId. Fail-soft. */
export async function saveProfileProjection(
  projection: CachedProfileProjection,
): Promise<void> {
  return saveProfileProjectionTo(SecureStore, projection);
}

/**
 * Load the projection for EXACTLY this verified-session user id. Returns null
 * on absence, parse failure, or any mismatch — a mismatched cache is discarded
 * (deleted), never returned.
 */
export async function loadProfileProjection(
  sessionUserId: string,
): Promise<CachedProfileProjection | null> {
  return loadProfileProjectionFrom(SecureStore, sessionUserId);
}

/** Remove the cached projection for one user (sign-out / authoritative absence). */
export async function clearProfileProjection(userId: string): Promise<void> {
  return clearProfileProjectionIn(SecureStore, userId);
}
