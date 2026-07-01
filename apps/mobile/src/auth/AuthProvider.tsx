/**
 * AuthProvider + useAuth — the app's single source of truth for the signed-in
 * identity, derived ENTIRELY from the verified Supabase session + the caller's
 * own `public.profiles` row.
 *
 * SECURITY INVARIANT (non-negotiable):
 *   The `tenantId` this app operates under comes ONLY from the caller's profile
 *   row, which is itself readable only under RLS (a caller can only ever read
 *   their own tenant's rows, and their own profile). It is NEVER read from user
 *   input, deep-link params, or editable storage. The app NEVER sends a tenant_id
 *   for authorization: every read is constrained by RLS to the caller's tenant
 *   via `public.current_tenant_id()`, and every insert is tenant-stamped by a
 *   BEFORE INSERT trigger from the verified auth context. A forged tenant_id in a
 *   request cannot widen access — Postgres refuses it.
 *
 *   The session (access token, user id, email) comes from Supabase Auth. The
 *   tenant + role come from the profile row fetched with that authenticated
 *   session. If the profile is missing (a user with no profile / tenant) we treat
 *   the session as unusable rather than inventing a tenant.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { normalizeGroups, type CognitoGroup } from '@soteria-forge/shared';
import { supabase, isSupabaseConfigured } from '../supabase';

/** Email/password credentials for sign-in. Tenancy is NEVER part of this input. */
export interface SignInInput {
  /** The `username` field name is kept for call-site compatibility; it is an email. */
  username: string;
  password: string;
}

/** The authenticated identity, projected from the verified session + profile only. */
export interface AuthUser {
  /** Supabase auth user id (`auth.users.id`) — stable, matches `profiles.id`. */
  userId: string;
  username: string;
  email?: string;
  displayName?: string;
  /** From the caller's `profiles.tenant_id`. The ONLY tenant the app trusts. */
  tenantId: string;
  /**
   * Authorization tier, projected from `profiles.role` into the shared
   * CognitoGroup vocabulary (worker/supervisor/tenant-admin/super-admin) so
   * existing group checks (`hasMinimumGroup`, `hasRequiredGroup`) keep working
   * unchanged. Roles are NOT a tenant scope — that is always the tenantId above.
   */
  groups: CognitoGroup[];
  /** Raw role string as stored on the profile (source of `groups`). */
  role: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Force a re-read of the current session + profile. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Fetch the caller's own profile (tenant_id + role) for a given auth user.
 *
 * RLS constrains this to the caller's own row: `profiles` policies only expose
 * the row whose `id = auth.uid()` (and rows in the caller's tenant). We select by
 * the auth user id and take the single row. No tenant_id is passed — the server
 * derives scope from the session, never from us.
 */
async function readProfile(authUser: SupabaseUser): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, full_name, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) {
    if (__DEV__) {
      console.warn('[auth] Failed to load profile — treating session as unauthenticated.', error.message);
    }
    return null;
  }

  // No profile row → no tenant. Refuse the identity rather than invent a tenant.
  if (!data || !data.tenant_id) {
    if (__DEV__) {
      console.warn('[auth] Session has no profile/tenant — treating as unauthenticated.');
    }
    return null;
  }

  // `profiles.role` uses the same worker/supervisor/tenant-admin/super-admin
  // vocabulary as CognitoGroup. normalizeGroups drops anything unrecognized, so a
  // malformed/unknown role yields an empty (least-privileged) group set.
  const groups = normalizeGroups([data.role]);

  const email = data.email ?? authUser.email ?? undefined;

  return {
    userId: authUser.id,
    username: email ?? authUser.id,
    email,
    displayName: data.full_name ?? undefined,
    tenantId: data.tenant_id,
    groups,
    role: data.role,
  };
}

/** Project a session (or null) into an AuthUser (or null). */
async function projectSession(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null;
  return readProfile(session.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a late async projection landing after a newer auth event.
  const projectionSeq = useRef(0);

  const applySession = useCallback(async (session: Session | null) => {
    const seq = ++projectionSeq.current;
    const next = await projectSession(session);
    // A newer session change superseded this projection — drop the stale result.
    if (seq !== projectionSeq.current) return;
    setUser(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  const refresh = useCallback(async () => {
    // No backend configured → nothing can be authenticated. Stay unauthenticated.
    if (!isSupabaseConfigured) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, [applySession]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: input.username,
        password: input.password,
      });
      if (signInError) {
        setError(signInError.message || 'Sign-in failed');
        setStatus('unauthenticated');
        throw signInError;
      }
      // onAuthStateChange('SIGNED_IN') also fires; refresh here so the caller can
      // await a fully-projected identity without racing the listener.
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Bump the sequence so any in-flight projection is discarded.
      projectionSeq.current++;
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // Initial session read + react to Supabase auth events (sign-in, sign-out,
  // token refresh, user update). onAuthStateChange emits the current session
  // immediately on subscribe, so this also covers the initial read.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }

    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        projectionSeq.current++;
        setUser(null);
        setStatus('unauthenticated');
        return;
      }
      // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION → re-project.
      void applySession(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, error, signIn, signOut, refresh }),
    [status, user, error, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access auth state + actions. Throws outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}

/**
 * Convenience accessor for the verified tenantId. Throws if called while
 * unauthenticated — callers in the app stack always have a tenant. This is the
 * ONLY sanctioned way for feature code to obtain the tenant scope.
 */
export function useTenantId(): string {
  const { user } = useAuth();
  if (!user) {
    throw new Error('useTenantId called without an authenticated session');
  }
  return user.tenantId;
}
