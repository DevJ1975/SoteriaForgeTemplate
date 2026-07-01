/// <reference types="vite/client" />

/**
 * Typed client env for the console. Only VITE_-prefixed, CLIENT-SAFE values are
 * inlined into the bundle. The Supabase URL is public; the anon/publishable key
 * is client-safe because Row-Level Security is the real gate. The SERVICE ROLE
 * key must NEVER appear here or anywhere in the client. See `.env.example`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
