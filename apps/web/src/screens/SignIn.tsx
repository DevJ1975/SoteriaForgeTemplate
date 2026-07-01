/**
 * SignIn — the signed-out surface: a Supabase email/password sign-in card.
 *
 * Tenancy is NEVER part of this input. The tenant the app operates under is
 * derived server-side from the caller's profile after a successful sign-in
 * (see auth.tsx) — never typed here, never sent for authorization.
 */
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

export function SignIn() {
  const { signIn, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch {
      // The error is surfaced via the auth context's `error`; nothing to do here.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="signin">
      <form className="card signin__card" onSubmit={onSubmit} noValidate>
        <div className="signin__brand">
          <span className="signin__brand-mark">SOTERIA</span>
          <span className="signin__brand-forge">FORGE</span>
        </div>
        <h1 className="signin__title">Sign in</h1>
        <p className="signin__subtitle">Browse and play your training.</p>

        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="field__input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
