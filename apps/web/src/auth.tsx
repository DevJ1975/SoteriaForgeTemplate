/**
 * AuthProvider + useAuth — the web surface's single source of truth for the
 * signed-in identity, derived ENTIRELY from the verified Supabase session + the
 * caller's own `public.profiles` row.
 *
 * SECURITY INVARIANT (non-negotiable):
 *   The `tenantId` this app operates under comes ONLY from the caller's profile
 *   row, which is itself readable only under RLS (a caller can only ever read
 *   their own tenant's rows, and their own profile). It is NEVER read from user
 *   input, query params, or editable storage. The app NEVER sends a tenant_id for
 *   authorization: every read is constrained by RLS to the caller's tenant via
 *   `public.current_tenant_id()`. A forged tenant_id in a request cannot widen
 *   access — Postgres refuses it.
 *
 *   The session (access token, user id, email) comes from Supabase Auth. The
 *   tenant + role come from the profile row fetched with that authenticated
 *   session. A session with NO profile (or no tenant on it) is treated as
 *   UNAUTHENTICATED here — this preview surface has no invite-redemption flow, so
 *   there is nothing to route such a user to; it never invents a tenant.
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
} from 'react'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'

/** The authenticated identity, projected from the verified session + profile only. */
export interface AuthUser {
  /** Supabase auth user id (`auth.users.id`) — stable, matches `profiles.id`. */
  id: string
  email?: string
  displayName?: string
  /** From the caller's `profiles.tenant_id`. The ONLY tenant the app trusts. */
  tenantId: string
  /** Raw role string as stored on the caller's profile (worker/supervisor/…). */
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Fetch the caller's own profile (tenant_id + role) for a given auth user.
 *
 * RLS constrains this to the caller's own row: `profiles` policies only expose
 * the row whose `id = auth.uid()`. We select by the auth user id and take the
 * single row. No tenant_id is passed — the server derives scope from the session,
 * never from us. Returns null when there is no profile/tenant (treated as
 * unauthenticated on this surface).
 */
async function readProfile(authUser: SupabaseUser): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, full_name, email')
    .eq('id', authUser.id)
    .maybeSingle()

  if (error || !data || !data.tenant_id) return null

  const email = data.email ?? authUser.email ?? undefined
  return {
    id: authUser.id,
    email,
    displayName: data.full_name ?? undefined,
    tenantId: data.tenant_id,
    role: data.role,
  }
}

/** Project a session (or null) into the trusted AuthUser (or null). */
async function projectSession(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null
  return readProfile(session.user)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Guards against a late async projection landing after a newer auth event.
  const projectionSeq = useRef(0)

  const applySession = useCallback(async (session: Session | null): Promise<AuthUser | null> => {
    const seq = ++projectionSeq.current
    const next = await projectSession(session)
    // A newer session change superseded this projection — drop the stale result.
    if (seq !== projectionSeq.current) return next
    setUser(next)
    setLoading(false)
    return next
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null)
      if (!isSupabaseConfigured) {
        const message = 'Backend is not configured yet.'
        setError(message)
        throw new Error(message)
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message || 'Sign-in failed')
        throw signInError
      }
      // onAuthStateChange('SIGNED_IN') also fires; project here so the caller can
      // await a fully-resolved identity without racing the listener.
      const { data } = await supabase.auth.getSession()
      const resolved = await applySession(data.session)
      // A valid session but no linked profile/tenant means there is no tenant to
      // enter here — fail closed AND tell the user why (instead of a silent bounce
      // back to the sign-in form).
      if (!data.session) {
        setError('Sign-in failed')
      } else if (!resolved) {
        setError('Your account isn’t linked to an organization yet. Contact your administrator.')
      }
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    setError(null)
    try {
      if (isSupabaseConfigured) await supabase.auth.signOut()
    } finally {
      // Bump the sequence so any in-flight projection is discarded.
      projectionSeq.current++
      setUser(null)
      setLoading(false)
    }
  }, [])

  // Initial session read + react to Supabase auth events (sign-in, sign-out,
  // token refresh). onAuthStateChange emits the current session immediately on
  // subscribe, so this also covers the initial read.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null)
      setLoading(false)
      return
    }

    let active = true
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        projectionSeq.current++
        setUser(null)
        setLoading(false)
        return
      }
      // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION → re-project.
      void applySession(session)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [applySession])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Access auth state + actions. Throws outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
