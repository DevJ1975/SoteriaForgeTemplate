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
 *
 *   OFFLINE COLD-START: when a persisted VERIFIED session exists but the
 *   profile read fails (airplane-mode relaunch), the identity is bridged from
 *   a SecureStore cache of the last successful profile read, keyed by — and
 *   validated against — that session's own user id (see profileCache.ts); any
 *   mismatch discards the cache. The tenant still never comes from anywhere
 *   but a verified-session-derived source, and it is re-projected from the
 *   network the moment connectivity returns.
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
import { syncEngine, connectivity } from '../offline';
import { resetDatabase } from '../db';
import {
  saveProfileProjection,
  loadProfileProjection,
  clearProfileProjection,
} from './profileCache';

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

/** Result of a simple auth action (e.g. requesting a password reset). */
export interface AuthActionResult {
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
  /**
   * Ask Supabase Auth to email a password-reset link. Fire-and-forget from the
   * caller's perspective: success does NOT reveal whether an account exists
   * (Supabase answers OK for unknown emails), so the UI shows the same neutral
   * message either way. Completing the reset happens via the emailed link
   * (in-app deep-link completion is a documented follow-up).
   */
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Upper bound on the final outbox drain attempted during sign-out. Sign-out must
 * stay responsive on a dead network, so the drain is raced against this timer —
 * whatever has not uploaded by then is wiped with the rest of the local store
 * (the sync engine's identity fence guarantees a leftover row could never be
 * uploaded under a different user anyway).
 */
const SIGN_OUT_DRAIN_TIMEOUT_MS = 8_000;

/**
 * Outcome of projecting a session, kept as a discriminated union so the caller
 * can set the RIGHT status (a missing profile is materially different from a
 * missing session, and both differ from a read that merely FAILED):
 *
 *   - `unauthenticated`      — no session at all.
 *   - `needs-profile`        — verified session and the server AUTHORITATIVELY
 *                              says there is no profile row / tenant yet (must
 *                              join via invite redemption).
 *   - `profile-unavailable`  — verified session but the profile READ FAILED
 *                              (offline cold-start, transient outage). This is
 *                              NOT an identity answer — the caller may bridge
 *                              it with the verified-session-keyed cache, or
 *                              fall back to the retry-able Join state.
 *   - `authenticated`        — verified session AND a profile with a tenant.
 */
type Projection =
  | { status: 'unauthenticated' }
  | { status: 'needs-profile' }
  | { status: 'profile-unavailable' }
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
      console.warn('[auth] Failed to load profile — will try cache/retry.', error.message);
    }
    // Session is valid; a read error is not a sign-out AND not an identity
    // answer. Surface it distinctly so the caller can bridge an offline
    // cold-start with the verified-session-keyed cache.
    return { status: 'profile-unavailable' };
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
  // True while the current 'authenticated' state rests on the CACHED profile
  // projection (offline cold-start) rather than a fresh network read. Drives
  // the background re-projection when connectivity returns.
  const usedCachedProfileRef = useRef(false);

  const applySession = useCallback(async (session: Session | null) => {
    const seq = ++projectionSeq.current;
    sessionRef.current = session;
    const next = await projectSession(session);
    // A newer session change superseded this projection — drop the stale result.
    if (seq !== projectionSeq.current) return;

    if (next.status === 'authenticated') {
      usedCachedProfileRef.current = false;
      setUser(next.user);
      setStatus('authenticated');
      // Refresh the offline cold-start cache from this fresh, RLS-scoped read
      // (keyed by the verified session's own user id). Fire-and-forget.
      void saveProfileProjection({
        userId: next.user.userId,
        tenantId: next.user.tenantId,
        role: next.user.role,
        displayName: next.user.displayName,
        email: next.user.email,
      });
      return;
    }

    if (next.status === 'profile-unavailable' && session?.user) {
      // OFFLINE COLD-START BRIDGE: the session is verified but the profile
      // read failed (no network / transient outage). Trust ONLY the cached
      // projection keyed by THIS session's user id — loadProfileProjection
      // discards any cache↔session mismatch — and re-project from the network
      // in the background once connectivity returns (see the connectivity
      // effect below). The tenant here still originates from a past verified,
      // RLS-scoped read; RLS remains the real gate for every data access.
      const cached = await loadProfileProjection(session.user.id);
      if (seq !== projectionSeq.current) return;
      if (cached) {
        usedCachedProfileRef.current = true;
        setUser({
          userId: cached.userId,
          username: cached.email ?? cached.userId,
          email: cached.email,
          displayName: cached.displayName,
          tenantId: cached.tenantId,
          groups: normalizeGroups([cached.role]),
          role: cached.role,
        });
        setStatus('authenticated');
        return;
      }
      // No trusted cache → keep the prior behavior: the signed-in-without-
      // profile state, where the Join screen offers the retry affordance.
      usedCachedProfileRef.current = false;
      setUser(null);
      setStatus('needs-profile');
      return;
    }

    usedCachedProfileRef.current = false;
    if (next.status === 'needs-profile' && session?.user) {
      // AUTHORITATIVE absence: the server says this user has no profile — a
      // stale cached projection must not survive to resurrect a tenant.
      void clearProfileProjection(session.user.id);
    }
    // needs-profile / unauthenticated both carry no usable AuthUser.
    setUser(null);
    setStatus(next.status === 'unauthenticated' ? 'unauthenticated' : 'needs-profile');
  }, []);

  // While authenticated FROM CACHE, re-project from the network the moment
  // connectivity returns, so the bridge state is as short-lived as possible.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const unsubscribe = connectivity.subscribe((snap) => {
      if (snap.isOnline && usedCachedProfileRef.current && sessionRef.current) {
        void applySession(sessionRef.current);
      }
    });
    return unsubscribe;
  }, [applySession]);

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

  /**
   * Sign out with DATA-INTEGRITY FENCING (compliance records must never cross
   * identities). Order matters:
   *
   *   1. FINAL DRAIN (best-effort, time-bounded): flush the offline outbox
   *      while THIS user's session is still the one attached to the Supabase
   *      client, so their queued completions upload under their own identity.
   *      The server BEFORE INSERT trigger stamps user_id/tenant_id from the
   *      CURRENT session — draining after sign-out (or under the next user)
   *      would mis-attribute statements.
   *   2. WIPE the local store (resetDatabase): no cached tenant catalog and no
   *      unsynced statements may survive into another identity's session on
   *      this device. Anything the drain did not upload is intentionally
   *      discarded — the sync engine's identity fence additionally guarantees
   *      that even a missed wipe could never upload user A's rows as user B.
   *   3. Sign out of Supabase Auth and clear the projected identity.
   *
   * Every step is failure-isolated: a dead network or an unopenable local store
   * must never trap a user in a signed-in state.
   */
  const signOut = useCallback(async () => {
    try {
      await Promise.race([
        syncEngine.syncNow(),
        new Promise<void>((resolve) => setTimeout(resolve, SIGN_OUT_DRAIN_TIMEOUT_MS)),
      ]);
    } catch {
      // Best-effort only — an offline/failed drain never blocks sign-out.
    }
    try {
      await resetDatabase();
    } catch {
      // An unopenable store must not block sign-out; the engine's identity
      // fence still prevents any leftover row from crossing identities.
    }
    // Drop the offline cold-start profile cache for the departing identity —
    // a signed-out user leaves no projection behind. (Read from the session
    // ref, not React state: this callback must not close over stale state.)
    const departingUserId = sessionRef.current?.user?.id;
    if (departingUserId) {
      await clearProfileProjection(departingUserId);
    }
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

  /**
   * Request a password-reset email. Carries ONLY the email address — no
   * tenancy, no identifiers. The reset link Supabase emails completes the flow
   * outside the app for now (deep-link completion is a follow-up); the caller
   * shows a neutral confirmation that never confirms account existence.
   */
  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthActionResult> => {
      if (!isSupabaseConfigured) {
        return { ok: false, error: 'Backend is not configured yet.' };
      }
      const address = email.trim();
      if (!address) {
        return { ok: false, error: 'Enter your email address.' };
      }
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(address);
      if (resetError) {
        // Supabase answers OK even for unknown emails, so anything surfacing
        // here is a real config/rate-limit problem worth showing.
        return { ok: false, error: resetError.message || 'Could not send the reset email.' };
      }
      return { ok: true };
    },
    [],
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
      requestPasswordReset,
    }),
    [
      status,
      user,
      error,
      signIn,
      signOut,
      refresh,
      refreshProfile,
      redeemInvitation,
      requestPasswordReset,
    ],
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
