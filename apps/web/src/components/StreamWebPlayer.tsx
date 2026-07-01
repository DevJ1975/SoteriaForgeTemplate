/**
 * StreamWebPlayer — the React (web) player for a Soteria Forge lesson video.
 *
 * Adapted from docs/examples/StreamWebPlayer.tsx for this app: it imports the
 * app's shared `supabase` client directly (no `supabase` prop) and keeps only
 * `lessonId` + optional `onPlay`/`onPause`.
 *
 * It reuses the SAME tenant-checked edge function as mobile/console: it asks
 * `stream-signed-url` for a short-lived signed token (RLS-scoped to the caller's
 * tenant — NO tenant_id is ever sent; the request body carries ONLY the lesson_id)
 * and hands that token to the official Cloudflare Stream player. The player loads
 * ONLY the server-returned token + customerCode — it never constructs a
 * cross-origin URL from client input. It degrades gracefully:
 *   - 501 → provider not configured yet (CF_* secrets unset)
 *   - 403 → the video isn't in the caller's tenant
 *   - any other error → a friendly retry.
 */
import { useCallback, useEffect, useState } from 'react'
import { Stream } from '@cloudflare/stream-react'
import { supabase } from '../supabase'

/** The shape the `stream-signed-url` edge function returns on 200. */
interface SignedPlayback {
  url: string
  token: string
  customerCode: string
  videoId: string
  iframeUrl: string
  expiresAt: string
}

type PlayerStatus = 'loading' | 'ready' | 'unconfigured' | 'forbidden' | 'error'

/** Best-effort HTTP status from a supabase-functions error (shape varies by version). */
function statusFromFunctionsError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null
  const ctx = (err as { context?: unknown }).context
  if (ctx && typeof ctx === 'object' && typeof (ctx as { status?: unknown }).status === 'number') {
    return (ctx as { status: number }).status
  }
  const direct = (err as { status?: unknown }).status
  return typeof direct === 'number' ? direct : null
}

const MESSAGES: Record<Exclude<PlayerStatus, 'loading' | 'ready'>, string> = {
  unconfigured: "This lesson's video isn't available yet.",
  forbidden: 'This video isn’t available to your organization.',
  error: 'We couldn’t load the video right now.',
}

export interface StreamWebPlayerProps {
  /** The lesson whose video to play. The tenant is derived server-side; never passed here. */
  lessonId: string
  /** Optional playback callbacks (wire these to xAPI played/paused if desired). */
  onPlay?: () => void
  onPause?: () => void
}

/**
 * Fetches a signed token for `lessonId` and renders the official Cloudflare
 * Stream player. Never sends a tenant_id — the edge function derives the tenant
 * from the verified session and returns 403 for anything outside it.
 */
export function StreamWebPlayer({ lessonId, onPlay, onPause }: StreamWebPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [playback, setPlayback] = useState<SignedPlayback | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setPlayback(null)
    try {
      const { data, error } = await supabase.functions.invoke<SignedPlayback>('stream-signed-url', {
        // ONLY the lesson_id — the tenant is derived server-side from the session.
        body: { lesson_id: lessonId },
      })
      if (error) {
        const code = statusFromFunctionsError(error)
        setStatus(code === 501 ? 'unconfigured' : code === 403 ? 'forbidden' : 'error')
        return
      }
      if (!data?.token || !data?.customerCode) {
        setStatus('unconfigured')
        return
      }
      setPlayback(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [lessonId])

  useEffect(() => {
    void load()
  }, [load])

  if (status === 'loading') {
    return <div className="stream-player stream-player--loading">Loading…</div>
  }

  if (status !== 'ready' || !playback) {
    return (
      <div className="stream-player stream-player--placeholder" role="status">
        <p>{MESSAGES[status as Exclude<PlayerStatus, 'loading' | 'ready'>]}</p>
        {status === 'error' ? (
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  // `src` is the signed token; `customerCode` selects the customer-<code> subdomain.
  // Both come only from the server response — never from client-supplied input.
  return (
    <div className="stream-player">
      <Stream
        controls
        responsive
        src={playback.token}
        customerCode={playback.customerCode}
        onPlay={onPlay}
        onPause={onPause}
      />
    </div>
  )
}
