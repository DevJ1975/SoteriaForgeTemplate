/**
 * SignIn — the signed-out surface: a Supabase email/password sign-in card.
 *
 * Tenancy is NEVER part of this input. The tenant the app operates under is
 * derived server-side from the caller's profile after a successful sign-in
 * (see auth.tsx) — never typed here, never sent for authorization.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

/** Pragmatic client-side shape check — Supabase Auth remains the real gate. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FieldErrors {
  email?: string
  password?: string
}

export function SignIn() {
  const { signIn, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Decide ONCE per mount whether the background is the looping jobsite video or
  // the still photo — random, so the screen varies visit to visit. Never the
  // video under reduced-motion (autoplaying motion is unwanted there).
  const [useVideo] = useState(() => {
    if (typeof window === 'undefined') return false
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    return Math.random() < 0.5
  })
  // If the video can't load/decode, fall back to the still layer.
  const [videoFailed, setVideoFailed] = useState(false)
  const showVideo = useVideo && !videoFailed

  // Subtle pointer parallax on the background photo — the layer drifts a few px
  // opposite the cursor. Disabled for reduced-motion and coarse (touch)
  // pointers, where there is no cursor to track and motion is unwanted.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === 'undefined') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia('(pointer: fine)').matches
    if (reduceMotion || !finePointer) return

    let frame = 0
    const MAX = 14 // px of drift at the viewport edge
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const nx = (event.clientX / window.innerWidth) * 2 - 1 // -1..1
        const ny = (event.clientY / window.innerHeight) * 2 - 1
        root.style.setProperty('--sf-parallax-x', `${(-nx * MAX).toFixed(1)}px`)
        root.style.setProperty('--sf-parallax-y', `${(-ny * MAX).toFixed(1)}px`)
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  const validate = (): boolean => {
    const next: FieldErrors = {}
    const trimmed = email.trim()
    if (!trimmed) {
      next.email = 'Enter your email address.'
    } else if (!EMAIL_PATTERN.test(trimmed)) {
      next.email = 'Enter a valid email address, like name@example.com.'
    }
    if (!password) {
      next.password = 'Enter your password.'
    }
    setFieldErrors(next)
    return !next.email && !next.password
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!validate()) return
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
    <div className="signin" ref={rootRef}>
      {/* Full-bleed jobsite background (parallax layer) + ember scrim behind the
          card. Randomly the looping video or the still photo. Decorative —
          hidden from assistive tech. */}
      {showVideo ? (
        <video
          className="signin__bg signin__bg--video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/signin-bg.jpg"
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
        >
          <source src="/signin-bg.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="signin__bg" aria-hidden="true" />
      )}
      <div className="signin__scrim" aria-hidden="true" />
      <form className="card signin__card" onSubmit={onSubmit} noValidate>
        <div className="signin__brand">
          <span className="signin__brand-mark">SOTERIA</span>
          <span className="signin__brand-forge">FORGE</span>
        </div>
        <h1 className="signin__title">Sign in</h1>
        <p className="signin__subtitle">Browse and play your training.</p>

        <div className="field">
          <label className="field__label" htmlFor="signin-email">
            Email
          </label>
          <input
            id="signin-email"
            className={fieldErrors.email ? 'field__input field__input--error' : 'field__input'}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }))
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined}
            required
          />
          {fieldErrors.email ? (
            <p className="field__error" id="signin-email-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="signin-password">
            Password
          </label>
          <div className="field__control">
            <input
              id="signin-password"
              className={
                fieldErrors.password ? 'field__input field__input--error' : 'field__input'
              }
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }))
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined}
              required
            />
            <button
              type="button"
              className="field__toggle"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {fieldErrors.password ? (
            <p className="field__error" id="signin-password-error">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? <span className="btn__spinner" aria-hidden="true" /> : null}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
