/**
 * profileCache — the last-known profile projection (id / tenantId / role /
 * displayName / email), persisted in the OS keystore KEYED BY THE AUTH USER ID,
 * for offline cold-start.
 *
 * THREAT MODEL / TRUST RULES (do not weaken):
 *   - The cache is written ONLY from a successful, RLS-scoped profile read
 *     performed with a verified session — i.e. its contents were once the
 *     server's own answer for that exact user.
 *   - It is read ONLY when a VERIFIED persisted Supabase session exists, and
 *     ONLY under the key of that session's user id; a cached projection whose
 *     `userId` differs from the requesting session's user id is DISCARDED.
 *     The tenantId therefore never comes from anywhere but this
 *     verified-session-keyed cache — never from user input or shared storage.
 *   - It is a COLD-START BRIDGE, not an authority: the app re-projects from
 *     the network as soon as it can (connectivity restore / next auth event),
 *     and the server's RLS still gates every actual data access — a stale or
 *     even tampered cache could only mislabel the UI, never widen access.
 *   - An authoritative "no profile row" answer from the server CLEARS the
 *     cache (the user genuinely has no tenant anymore).
 *
 * Values are small (well under SecureStore's 2 KB Android limit), so no
 * chunking is needed here. All operations are fail-soft: a keystore hiccup
 * degrades to "no cache", never a crash.
 */
import * as SecureStore from 'expo-secure-store';

/** The minimal identity projection worth trusting across an offline restart. */
export interface CachedProfileProjection {
  /** Supabase auth user id — MUST match the verified session that reads it. */
  userId: string;
  /** The tenant from the user's own profile row, as last read under RLS. */
  tenantId: string;
  /** Raw role string from the profile row (re-normalized on load). */
  role: string;
  displayName?: string;
  email?: string;
}

const KEY_PREFIX = 'sf.profile.';

/** SecureStore keys allow [A-Za-z0-9._-]; auth user ids are UUIDs, which fit. */
function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** Persist the projection for its own userId. Fail-soft. */
export async function saveProfileProjection(
  projection: CachedProfileProjection,
): Promise<void> {
  if (!projection.userId || !projection.tenantId) return; // never cache junk
  try {
    await SecureStore.setItemAsync(keyFor(projection.userId), JSON.stringify(projection));
  } catch {
    // Cache write failure only costs the offline cold-start convenience.
  }
}

/**
 * Load the projection for EXACTLY this verified-session user id. Returns null
 * on absence, parse failure, or any mismatch — a mismatched cache is discarded
 * (deleted), never returned.
 */
export async function loadProfileProjection(
  sessionUserId: string,
): Promise<CachedProfileProjection | null> {
  if (!sessionUserId) return null;
  try {
    const raw = await SecureStore.getItemAsync(keyFor(sessionUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProfileProjection> | null;
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.tenantId !== 'string' ||
      typeof parsed.role !== 'string' ||
      parsed.userId !== sessionUserId ||
      parsed.tenantId.length === 0
    ) {
      // Cache↔session mismatch or corruption → discard, never trust.
      await SecureStore.deleteItemAsync(keyFor(sessionUserId)).catch(() => {});
      return null;
    }
    return {
      userId: parsed.userId,
      tenantId: parsed.tenantId,
      role: parsed.role,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
}

/** Remove the cached projection for one user (sign-out / authoritative absence). */
export async function clearProfileProjection(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await SecureStore.deleteItemAsync(keyFor(userId));
  } catch {
    // Best-effort: a leftover cache is still session-keyed and mismatch-guarded.
  }
}
