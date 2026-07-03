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
 * The chunking + fail-closed logic lives in `./chunkedSecureStorage.ts`
 * (node-safe, unit-tested); this module only binds it to the real
 * expo-secure-store, which requires the native runtime.
 *
 * NOTE: sessions previously persisted in AsyncStorage are NOT migrated — the
 * app has never shipped, so there are no real sessions to carry over; a dev
 * device simply signs in again once.
 */
import * as SecureStore from 'expo-secure-store';
import { createChunkedSecureStorage } from './chunkedSecureStorage';

export const secureSessionStorage = createChunkedSecureStorage(SecureStore);
