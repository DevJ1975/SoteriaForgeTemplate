/**
 * Supabase browser client for the console (Vue/Vite).
 *
 * ONE client, created once and shared. It is typed with the generated
 * `Database` schema from `@soteria-forge/shared/supabase`, so every
 * `supabase.from('…')` call is column- and row-typed against the live Postgres
 * schema.
 *
 * Tenant isolation is NOT an app-layer concern here: it is enforced by Postgres
 * Row-Level Security. Every read/write is constrained to the caller's own tenant
 * via `public.current_tenant_id()` (derived from the session JWT), and INSERTs
 * are tenant-stamped by a BEFORE INSERT trigger from the verified auth context.
 * The console therefore NEVER sends a `tenant_id` for authorization and NEVER
 * sets a tenant header — RLS derives the tenant from the session, full stop.
 *
 * Only the anon/publishable key belongs in the client bundle. It is client-safe
 * precisely because RLS is the real gate. The SERVICE ROLE key must never be
 * imported, referenced, or shipped here. See `.env.example`.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@soteria-forge/shared/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/console/.env (see .env.example).',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session so a superadmin stays signed in across reloads, and
    // let supabase-js transparently refresh the JWT. RLS reads the tenant from
    // whatever session is current, so keeping it fresh keeps reads authorized.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export type SupabaseConsoleClient = typeof supabase
