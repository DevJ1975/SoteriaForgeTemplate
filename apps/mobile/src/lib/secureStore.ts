/**
 * AsyncKeyValueStore — the minimal async key/value surface this app needs from
 * a secure store. It is exactly the shape of `expo-secure-store`'s module API
 * (getItemAsync / setItemAsync / deleteItemAsync), so the real module object
 * satisfies it directly, while unit tests inject an in-memory fake.
 *
 * Consumers: `src/supabase/chunkedSecureStorage.ts` (session persistence) and
 * `src/auth/profileCacheCore.ts` (offline cold-start identity bridge).
 */
export interface AsyncKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
