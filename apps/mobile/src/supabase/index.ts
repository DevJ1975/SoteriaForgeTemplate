/**
 * Supabase barrel — the typed client + its configuration flags.
 *
 * `supabase` is the ONE handle the auth layer, the data client, and the sync
 * engine share. It is typed against `@soteria-forge/shared/supabase` so every
 * query is checked against the live schema, and tenant scoping is enforced by
 * Postgres RLS (never by a client-supplied tenant_id).
 */
export {
  supabase,
  isSupabaseConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from './client';
