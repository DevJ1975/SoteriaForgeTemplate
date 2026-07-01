/**
 * Auth barrel — everything auth-related is imported from `@/auth`.
 *
 * Auth is Supabase Auth (email/password) against the single project. The tenant +
 * role are projected from the caller's `public.profiles` row (RLS-scoped); the
 * app never sends a tenant_id for authorization.
 */
export { AuthProvider, useAuth, useTenantId } from './AuthProvider';
export type { AuthUser, AuthStatus, SignInInput, RedeemResult } from './AuthProvider';
// Re-exported so screens can gate UI on whether the backend is wired without
// reaching into the supabase module directly.
export { isSupabaseConfigured } from '../supabase';
