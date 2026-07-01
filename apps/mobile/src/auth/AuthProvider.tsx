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
 *   session. If the profile is missing (a user with no profile / tenant) we do
 *   NOT invent a tenant — instead we surface a distinct `needs-profile` state so
 *   the app can route the user to the "join a tenant" (invite redemption) flow.
 *   Redemption itself never sends a tenant_id: `redeem_invitation` creates the
 *   profile server-side from the invite (validated against the verified email),
 *   and the tenant it lands on is decided entirely by Postgres, not the client.
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

/**
 * The four mutually-exclusive identity states the whole app routes on:
 *
 *   - `loading`          — the session/profile projection is still resolving.
 *   - `authenticated`    — verified session AND a profile with a tenant. `user`
 *                          is non-null; the app stack is reachable.
 *   - `needs-profile`    — verified session but NO profile yet (1:1 profiles row
 *                          not created). `user` is null. The user must redeem an
 *                          invite to join a tenant before the app is usable.
 *   - `unauthenticated`  — no session at all (or backend unconfigured).
 */
export type AuthStatus = 'loading' | 'authenticated' | 'needs-profile' | 'unauthenticated';

/** Result of redeeming an invite — surfaced to the Join screen for messaging. */
export interface RedeemResult {
  ok: boolean;
  /** Human-readable failure reason when `ok` is false. */
  error?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Force a re-read of the current session + profile. */
  refresh: () => Promise<void>;
  /**
   * Re-read ONLY the profile for the already-verified session (no auth round
   * trip). Used after joining a tenant to flip `needs-profile` → `authenticated`.
   */
  refreshProfile: () => Promise<void>;
  /**
   * Redeem an invitation token to create the caller's profile server-side, then
   * re-project the identity. Never sends a tenant_id — the server derives the
   * tenant from the invite (validated against the verified email). Idempotent:
   * calling with an already-redeemed token is safe.
   */
  redeemInvitation: (inviteToken: string) => Promise<RedeemResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Outcome of projecting a session, kept as a discriminated union so the caller
 * can set the RIGHT status (a missing profile is materially different from a
 * missing session):
 *
 *   - `unauthenticated` — no session at all.
 *   - `needs-profile`   — verified session, but no profile row yet (must join a
 *                         tenant via invite redemption). We deliberately treat a
 *                         profile-read ERROR as `needs-profile` too, so a
 *                         signed-in user is never bounced back to sign-in on a
 *                         transient read failure — the Join screen surfaces the
 *                         retry affordance and RLS still guards everything.
 *   - `authenticated`   — verified session AND a profile with a tenant.
 */
type Projection =
  | { status: 'unauthenticated' }
  | { status: 'needs-profile' }
  | { status: 'authenticated'; user: AuthUser };

/**
 * Fetch the caller's own profile (tenant_id + role) for a given auth user.
 *
 * RLS constrains this to the caller's own row: `profiles` policies only expose
 * the row whose `id = auth.uid()` (and rows in the caller's tenant). We select by
 * the auth user id and take the single row. No tenant_id is passed — the server
 * derives scope from the session, never from us.
 *
 * Returns `needs-profile` (never `unauthenticated`) when the row is absent: the
 * session is real; the user just hasn't joined a tenant yet.
 */
async function readProfile(authUser: SupabaseUser): Promise<Projection> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, full_name, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) {
    if (__DEV__) {
      console.warn('[auth] Failed to load profile — routing to join/retry.', error.message);
    }
    // Session is valid; a read error is not a sign-out. Keep the user in the
    // signed-in-without-profile state where they can retry / redeem.
    return { status: 'needs-profile' };
  }

  // No profile row (or no tenant on it) → the user has not joined a tenant yet.
  if (!data || !data.tenant_id) {
    if (__DEV__) {
      console.warn('[auth] Session has no profile/tenant — user must join a tenant.');
    }
    return { status: 'needs-profile' };
  }

  // `profiles.role` uses the same worker/supervisor/tenant-admin/super-admin
  // vocabulary as CognitoGroup. normalizeGroups drops anything unrecognized, so a
  // malformed/unknown role yields an empty (least-privileged) group set.
  const groups = normalizeGroups([data.role]);

  const email = data.email ?? authUser.email ?? undefined;

  return {
    status: 'authenticated',
    user: {
      userId: authUser.id,
      username: email ?? authUser.id,
      email,
      displayName: data.full_name ?? undefined,
      tenantId: data.tenant_id,
      groups,
      role: data.role,
    },
  };
}

/** Project a session (or null) into a discriminated identity outcome. */
async function projectSession(session: Session | null): Promise<Projection> {
  if (!session?.user) return { status: 'unauthenticated' };
  return readProfile(session.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a late async projection landing after a newer auth event.
  const projectionSeq = useRef(0);
  // The last verified session, retained so `refreshProfile`/`redeemInvitation`
  // can re-read the profile for the SAME session without an auth round trip.
  // This is set ONLY from Supabase auth events / getSession — never from input.
  const sessionRef = useRef<Session | null>(null);

  const applySession = useCallback(async (session: Session | null) => {
    const seq = ++projectionSeq.current;
    sessionRef.current = session;
    const next = await projectSession(session);
    // A newer session change superseded this projection — drop the stale result.
    if (seq !== projectionSeq.current) return;
    if (next.status === 'authenticated') {
      setUser(next.user);
      setStatus('authenticated');
    } else {
      // needs-profile / unauthenticated both carry no usable AuthUser.
      setUser(null);
      setStatus(next.status);
    }
  }, []);

  const refresh = useCallback(async () => {
    // No backend configured → nothing can be authenticated. Stay unauthenticated.
    if (!isSupabaseConfigured) {
      sessionRef.current = null;
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
    } catch {
      sessionRef.current = null;
      setUser(null);
      setStatus('unauthenticated');
    }
  }, [applySession]);

  /**
   * Re-read just the profile for the current verified session. If there is no
   * session anymore, fall back to a full refresh (which resolves to
   * unauthenticated). This is the cheap path used after invite redemption.
   */
  const refreshProfile = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      await refresh();
      return;
    }
    await applySession(session);
  }, [applySession, refresh]);

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
      sessionRef.current = null;
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  /**
   * Redeem an invitation token, joining the caller to a tenant.
   *
   * SECURITY: this calls the `redeem_invitation(invite_token)` RPC and passes
   * ONLY the opaque invite token — never a tenant_id. The server creates the
   * caller's `profiles` row from the invitation, validating the token against
   * the caller's VERIFIED email and stamping the tenant from the invite. The
   * client cannot choose a tenant here; a forged/mismatched token simply fails.
   * The RPC is idempotent, so a double-tap or an already-redeemed token is safe.
   *
   * On success we re-project the identity (refreshProfile) so `status` flips from
   * `needs-profile` → `authenticated` and the app stack becomes reachable.
   */
  const redeemInvitation = useCallback(
    async (inviteToken: string): Promise<RedeemResult> => {
      if (!isSupabaseConfigured) {
        return { ok: false, error: 'Backend is not configured yet.' };
      }
      const token = inviteToken.trim();
      if (!token) {
        return { ok: false, error: 'Enter your invite code to continue.' };
      }
      // Guard: you must be signed in to redeem (the RPC keys off the verified
      // session). Without one, redemption cannot bind a profile to an identity.
      if (!sessionRef.current) {
        return { ok: false, error: 'Your session expired. Sign in again to join.' };
      }

      const { error: rpcError } = await supabase.rpc('redeem_invitation', {
        invite_token: token,
      });

      if (rpcError) {
        if (__DEV__) {
          console.warn('[auth] redeem_invitation failed.', rpcError.message);
        }
        return {
          ok: false,
          error: rpcError.message || 'That invite could not be redeemed.',
        };
      }

      // Profile now exists server-side — re-read it so the app unlocks.
      await refreshProfile();
      return { ok: true };
    },
    [refreshProfile],
  );

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
        sessionRef.current = null;
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
    () => ({
      status,
      user,
      error,
      signIn,
      signOut,
      refresh,
      refreshProfile,
      redeemInvitation,
    }),
    [status, user, error, signIn, signOut, refresh, refreshProfile, redeemInvitation],
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
