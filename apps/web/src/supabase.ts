/**
 * Supabase browser client for the web learner/preview surface (React + Vite).
 *
 * ONE client, created once and shared. It is typed with the generated `Database`
 * schema from `@soteria-forge/shared/supabase`, so every `supabase.from('…')`
 * call is column- and row-typed against the live Postgres schema.
 *
 * TENANT ISOLATION (the #1 rule) is NOT an app-layer concern here — it is enforced
 * by Postgres Row-Level Security. Every read/write is constrained to the caller's
 * own tenant via `public.current_tenant_id()` (derived from the session JWT), and
 * INSERTs are tenant-stamped by a BEFORE INSERT trigger from the verified auth
 * context. This app therefore NEVER sends a `tenant_id` for authorization and
 * NEVER sets a tenant header — RLS derives the tenant from the session, full stop.
 *
 * KEY SAFETY: only the anon/publishable key belongs in this client bundle. It is
 * client-safe precisely because RLS is the real gate. The SERVICE-ROLE key must
 * never be imported, referenced, or shipped here — it bypasses RLS. See
 * `.env.example`.
 *
 * UNLIKE the console, this module does NOT throw at import when the env is unset.
 * Mirroring the mobile app's "backend not configured" pattern, it always exports a
 * usable client (pointed at a clearly-flagged placeholder when unconfigured) plus
 * an `isSupabaseConfigured` flag, so the app still renders — showing a "backend
 * not configured" state — instead of crashing on a bare checkout.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@soteria-forge/shared/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether the client has real credentials. When false the app still BOOTS (so the
 * shell is runnable in a bare checkout) but every backend call fails predictably
 * and the UI shows a "backend not configured" state instead of throwing at import.
 */
export const isSupabaseConfigured: boolean =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0

/**
 * The app-wide typed Supabase client.
 *
 * If the URL/anon key are unset we STILL export a client (so imports never throw
 * and the app boots), but it is pointed at a clearly-flagged placeholder origin
 * and every call will error rather than silently succeed. Callers gate on
 * `isSupabaseConfigured` to render the unconfigured state up front, so those
 * placeholder calls are never actually made.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl && supabaseUrl.length > 0 ? supabaseUrl : 'https://unconfigured.supabase.co',
  supabaseAnonKey && supabaseAnonKey.length > 0 ? supabaseAnonKey : 'unconfigured-anon-key',
  {
    auth: {
      // Persist the session so a learner stays signed in across reloads, and let
      // supabase-js transparently refresh the JWT. RLS reads the tenant from
      // whatever session is current, so keeping it fresh keeps reads authorized.
      persistSession: true,
      autoRefreshToken: true,
      // No auth callback URL to parse for an email/password preview surface.
      detectSessionInUrl: false,
    },
  },
)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — copy ' +
      'apps/web/.env.example to .env and fill them in. The app boots, but every ' +
      'backend call will fail until the client is configured.',
  )
}

export type SupabaseWebClient = typeof supabase
