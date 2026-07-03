/**
 * App — the shell.
 *
 * Routing is state-driven WITH History-API URL sync (still no react-router, to
 * keep the dependency surface minimal for this preview app):
 *   - backend unconfigured → a "backend not configured" banner,
 *   - no verified user     → <SignIn/>,
 *   - signed in            → header (brand + theme toggle + identity + sign-out)
 *                            + CourseList ↔ CourseDetail.
 *
 * The open course is mirrored to the URL as `/courses/:id` (pushState on
 * open/back; a popstate listener re-syncs state on browser back/forward).
 *
 * SECURITY: the URL carries a resource id ONLY — Postgres RLS gates the read
 * server-side, so a pasted/shared/forged id can never resolve outside the
 * caller's tenant (an unknown id just renders CourseDetail's not-found state).
 * No tenant material ever appears in, or is read from, the URL. The tenant the
 * app operates under is derived entirely from the verified session (see
 * auth.tsx); no tenant_id is ever read from input or sent for authorization.
 */
import { useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import { isSupabaseConfigured } from './supabase'
import { applyTheme, getStoredTheme, setTheme, type ThemePreference } from './theme/theme'
import { SignIn } from './screens/SignIn'
import { CourseList } from './screens/CourseList'
import { CourseDetail } from './screens/CourseDetail'
import { PwaNotices } from './pwa/PwaNotices'
import { InstallButton } from './pwa/InstallButton'

/**
 * Parse an open-course id out of the URL path (`/courses/:id`). The id is an
 * opaque resource id — malformed or unknown values degrade gracefully to the
 * list view or CourseDetail's existing not-found/error state.
 */
function courseIdFromPath(pathname: string): string | null {
  const match = /^\/courses\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    const id = decodeURIComponent(match[1]).trim()
    return id.length > 0 ? id : null
  } catch {
    // Malformed percent-encoding — treat as "no course open".
    return null
  }
}

/** Initials for the avatar chip, from a display name or an email local part. */
function initialsOf(identity: string): string {
  const base = identity.trim().split('@')[0] ?? ''
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function BackendNotConfigured() {
  return (
    <div className="banner-screen">
      <div className="card banner">
        <h1 className="banner__title">Backend not configured</h1>
        <p className="banner__body">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
          <code>apps/web/.env</code> (copy from <code>.env.example</code>) to sign in and browse
          your training. Use only the client-safe anon/publishable key — never the service-role key.
        </p>
      </div>
    </div>
  )
}

/* ── Theme toggle (light → dark → system) ─────────────────────────────────
 * Small inline SVG glyphs, stroke/fill via `currentColor` — these are UI
 * pictograms, not brand colors; no hex ever appears here. */

const THEME_CYCLE: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const THEME_TITLES: Record<ThemePreference, string> = {
  light: 'Theme: light. Activate to switch to dark.',
  dark: 'Theme: dark. Activate to switch to system.',
  system: 'Theme: system. Activate to switch to light.',
}

function ThemeGlyph({ pref }: { pref: ThemePreference }) {
  if (pref === 'light') {
    // Sun
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (pref === 'dark') {
    // Moon
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    )
  }
  // System/auto: half-filled circle
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getStoredTheme())

  const cycle = () => {
    const next = THEME_CYCLE[pref]
    setTheme(next)
    setPref(next)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={THEME_TITLES[pref]}
      aria-label={THEME_TITLES[pref]}
    >
      <ThemeGlyph pref={pref} />
    </button>
  )
}

function Shell() {
  const { user, signOut } = useAuth()
  // The URL is the initial source of truth for the open course (deep link).
  const [openCourseId, setOpenCourseId] = useState<string | null>(() =>
    courseIdFromPath(window.location.pathname),
  )
  // False until the user navigates within the shell — the first rendered view
  // (initial page load / deep link) must not steal focus.
  const [hasNavigated, setHasNavigated] = useState(false)

  // Browser back/forward → re-derive the open course from the URL.
  useEffect(() => {
    const onPopState = () => {
      setOpenCourseId(courseIdFromPath(window.location.pathname))
      setHasNavigated(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openCourse = useCallback((courseId: string) => {
    setOpenCourseId(courseId)
    setHasNavigated(true)
    window.history.pushState(null, '', `/courses/${encodeURIComponent(courseId)}`)
  }, [])

  const closeCourse = useCallback(() => {
    setOpenCourseId(null)
    setHasNavigated(true)
    window.history.pushState(null, '', '/')
  }, [])

  const identity = user?.displayName ?? user?.email ?? null

  return (
    <div className="shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">SOTERIA</span>
          <span className="app-header__forge">FORGE</span>
        </div>
        <div className="app-header__right">
          <InstallButton />
          <ThemeToggle />
          {identity ? (
            <span className="app-header__identity" title={user?.email ?? undefined}>
              <span className="avatar-chip" aria-hidden="true">
                {initialsOf(identity)}
              </span>
              <span className="app-header__user">{identity}</span>
            </span>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        {openCourseId ? (
          <CourseDetail courseId={openCourseId} onBack={closeCourse} />
        ) : (
          <CourseList onOpenCourse={openCourse} focusHeadingOnLoad={hasNavigated} />
        )}
      </main>
    </div>
  )
}

function Routes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <p className="state state--loading state--fullscreen">Loading…</p>
  }
  if (!user) {
    return <SignIn />
  }
  return <Shell />
}

export function App() {
  // Apply the persisted theme preference on startup (data-theme on <html>;
  // attribute absent for 'system' so prefers-color-scheme applies).
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return (
    <>
      {/* Mounted regardless of auth/config state so the service worker registers
          and offline/update notices always surface. */}
      <PwaNotices />
      {isSupabaseConfigured ? (
        <AuthProvider>
          <Routes />
        </AuthProvider>
      ) : (
        <BackendNotConfigured />
      )}
    </>
  )
}

export default App
