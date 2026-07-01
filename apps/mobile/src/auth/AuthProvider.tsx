/**
 * AuthProvider + useAuth — the app's single source of truth for the signed-in
 * identity, derived ENTIRELY from the verified Cognito session.
 *
 * SECURITY INVARIANT (non-negotiable):
 *   The `tenantId` this app operates under comes ONLY from the token's
 *   `custom:tenantId` claim. It is NEVER read from user input, deep-link params,
 *   local storage the user can edit, or anywhere else. Every data request the
 *   app makes is scoped by this token-derived tenantId (see src/api). Cognito
 *   groups (`cognito:groups`) drive authorization tier the same way.
 *
 *   We read claims from the ID token via `fetchAuthSession`, which validates the
 *   session. If the claim is missing we treat the session as unusable rather
 *   than falling back to any client-supplied value.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  type SignInInput,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { normalizeGroups, type CognitoGroup } from '@soteria-forge/shared';
import { isAmplifyConfigured } from './amplifyConfig';

/** The authenticated identity, projected from verified token claims only. */
export interface AuthUser {
  /** Cognito `sub` — stable user id. */
  userId: string;
  username: string;
  email?: string;
  displayName?: string;
  /** From the verified `custom:tenantId` claim. The ONLY tenant the app trusts. */
  tenantId: string;
  /** Normalized `cognito:groups` (unknown groups dropped). */
  groups: CognitoGroup[];
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Force a re-read of the current session (e.g. after a token refresh). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Read the verified session and project it into an AuthUser. Returns null when
 * there is no usable session OR when the token lacks the mandatory
 * `custom:tenantId` claim — a token without a tenant is not trusted.
 */
async function readSession(): Promise<AuthUser | null> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken;
  if (!idToken) return null;

  const claims = idToken.payload;
  const tenantId = typeof claims['custom:tenantId'] === 'string' ? claims['custom:tenantId'] : '';

  // No tenant claim → refuse the identity. Never invent or default a tenantId.
  if (!tenantId) {
    if (__DEV__) {
      console.warn('[auth] Session token is missing custom:tenantId — treating as unauthenticated.');
    }
    return null;
  }

  // Authorization groups come from the `cognito:groups` claim on the ID token
  // (present here, and also on the access token). These are the SAME groups the
  // backend's row-level auth relies on: the pre-token-generation trigger injects
  // the caller's tenantId (and `admin::<tenantId>` for admins) into
  // `cognito:groups`, so AppSync `groupDefinedIn('tenantId')` sees them. The app
  // never SENDS a tenantId it didn't get from the token — the tenant scope is
  // derived solely from the verified `custom:tenantId` claim above, and a forged
  // tenantId would be refused server-side by the row-level gate regardless.
  const groups = normalizeGroups(claims['cognito:groups']);
  const current = await getCurrentUser();

  return {
    userId: typeof claims.sub === 'string' ? claims.sub : current.userId,
    username: current.username,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    displayName: typeof claims.name === 'string' ? claims.name : undefined,
    tenantId,
    groups,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // No backend yet → nothing can be authenticated. Stay unauthenticated.
    if (!isAmplifyConfigured()) {
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    try {
      const next = await readSession();
      setUser(next);
      setStatus(next ? 'authenticated' : 'unauthenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const signIn = useCallback(
    async (input: SignInInput) => {
      setError(null);
      try {
        await amplifySignIn(input);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        setStatus('unauthenticated');
        throw err;
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // Initial session read + react to Amplify auth events (token refresh, etc.).
  useEffect(() => {
    void refresh();
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'tokenRefresh':
          void refresh();
          break;
        case 'signedOut':
          setUser(null);
          setStatus('unauthenticated');
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, [refresh]);

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
