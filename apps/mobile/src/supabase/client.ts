/**
 * Supabase client — the single typed handle every backend call flows through.
 *
 * BACKEND: this app talks to a LIVE Supabase project. The client is parameterized
 * with the generated `Database` type from `@soteria-forge/shared/supabase`, so
 * every `supabase.from('<table>')` call is fully typed against the real schema and
 * a typo (or a query to a table that does not exist) fails at compile time.
 *
 * TENANT ISOLATION (the #1 rule) is enforced by POSTGRES RLS, not here. This
 * client only carries the caller's session JWT; the server derives the caller's
 * tenant from that verified token via `public.current_tenant_id()` and constrains
 * every read/write to the caller's own tenant. The client therefore NEVER sends a
 * tenant_id for authorization — a BEFORE INSERT trigger stamps tenant_id from the
 * auth context, and RLS refuses any row outside the caller's tenant regardless of
 * what the client asks for. Do not add a tenant_id to any query for scoping.
 *
 * KEY SAFETY: the publishable/anon key configured here is CLIENT-SAFE. It only
 * grants what RLS allows for the `anon`/`authenticated` roles — it is not a
 * secret and is meant to ship in the app. The SERVICE ROLE key must NEVER appear
 * in this (or any) client bundle; it bypasses RLS and belongs only server-side.
 *
 * SESSION: sessions persist in the OS keystore via `secureSessionStorage`
 * (expo-secure-store, chunked past the 2 KB Android limit) — the refresh token
 * is a long-lived credential and never sits in plaintext AsyncStorage — and
 * auto-refresh. `detectSessionInUrl` is off because there is no browser URL to
 * parse on React Native. The WHATWG URL polyfill (`react-native-url-polyfill/auto`)
 * is required by supabase-js's fetch layer on RN and is imported first here
 * (also loaded app-wide in index.ts).
 */
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@soteria-forge/shared/supabase';
import { secureSessionStorage } from './secureSessionStorage';

/**
 * Resolve a config value from EXPO_PUBLIC_* env (inlined by the Expo/Metro
 * bundler at build time) with an `expo-constants` extra fallback. Only NON-SECRET
 * values live here — the anon key is client-safe by design (RLS-protected).
 */
function readConfig(envKey: string, extraKey: string): string | undefined {
  const fromEnv = process.env[envKey];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = extra[extraKey];
  return typeof fromExtra === 'string' && fromExtra.length > 0 ? fromExtra : undefined;
}

export const SUPABASE_URL = readConfig('EXPO_PUBLIC_SUPABASE_URL', 'supabaseUrl');
export const SUPABASE_ANON_KEY = readConfig('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'supabaseAnonKey');

/**
 * Whether the client has real credentials. When false the app still BOOTS (so the
 * shell is runnable in a bare checkout) but every backend call fails predictably
 * and the UI shows an unconfigured/empty state instead of crashing at import time.
 */
export const isSupabaseConfigured: boolean =
  typeof SUPABASE_URL === 'string' && typeof SUPABASE_ANON_KEY === 'string';

const authOptions = {
  // Persist the session across launches in the OS keystore (Keychain/Keystore),
  // chunked to respect SecureStore's 2 KB per-value limit.
  storage: secureSessionStorage,
  persistSession: true,
  // Silently refresh the access token before it expires so long-lived offline
  // sessions reconnect cleanly.
  autoRefreshToken: true,
  // No browser URL to parse on React Native.
  detectSessionInUrl: false,
} as const;

/**
 * The app-wide typed Supabase client.
 *
 * If the URL/anon key are unset we still export a *client* (so imports never
 * throw and the app boots), but it is pointed at a clearly-flagged placeholder
 * origin and every call will error rather than silently succeed. `isSupabaseConfigured`
 * is the flag callers use to render an "unconfigured" state up front.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL ?? 'https://unconfigured.supabase.co',
  SUPABASE_ANON_KEY ?? 'unconfigured-anon-key',
  { auth: authOptions },
);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set — ' +
      'copy apps/mobile/.env.example to .env and fill them in. The app boots, but every ' +
      'backend call will fail until the client is configured.',
  );
}
