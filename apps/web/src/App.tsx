/**
 * App — the shell.
 *
 * Routing here is intentionally state-based (no react-router) to keep the
 * dependency surface minimal for this preview app:
 *   - backend unconfigured → a "backend not configured" banner,
 *   - no verified user     → <SignIn/>,
 *   - signed in            → header (app name + sign-out) + CourseList/CourseDetail.
 *
 * The tenant the app operates under is derived entirely from the verified session
 * (see auth.tsx). No tenant_id is ever read from input or sent for authorization.
 */
import { useState } from 'react'
import { AuthProvider, useAuth } from './auth'
import { isSupabaseConfigured } from './supabase'
import { SignIn } from './screens/SignIn'
import { CourseList } from './screens/CourseList'
import { CourseDetail } from './screens/CourseDetail'

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

function Shell() {
  const { user, signOut } = useAuth()
  const [openCourseId, setOpenCourseId] = useState<string | null>(null)

  return (
    <div className="shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">SOTERIA</span>
          <span className="app-header__forge">FORGE</span>
        </div>
        <div className="app-header__right">
          {user?.email ? <span className="app-header__user">{user.email}</span> : null}
          <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        {openCourseId ? (
          <CourseDetail courseId={openCourseId} onBack={() => setOpenCourseId(null)} />
        ) : (
          <CourseList onOpenCourse={(id) => setOpenCourseId(id)} />
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
  if (!isSupabaseConfigured) {
    return <BackendNotConfigured />
  }
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}

export default App
