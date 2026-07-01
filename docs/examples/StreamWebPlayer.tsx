/**
 * StreamWebPlayer — REFERENCE React (web) player for a Soteria Forge lesson video.
 *
 * This is the surface where `@cloudflare/stream-react` fits natively: a React
 * DOM app (the mobile app is React Native and the console is Vue, so neither can
 * import this package — see docs/examples/README.md). It is a self-contained
 * reference, NOT yet wired into a build target — drop it into a React web app
 * (or a new `apps/web`) once you decide where the web player should live.
 *
 * It reuses the SAME tenant-checked edge function as mobile/console: it asks
 * `stream-signed-url` for a short-lived signed token (RLS-scoped to the caller's
 * tenant — no tenant_id is ever sent) and hands that token to the official
 * Cloudflare Stream player. It degrades gracefully:
 *   - 501 → provider not configured yet (CF_* secrets unset)
 *   - 403 → the video isn't in the caller's tenant
 *   - any other error → a friendly retry.
 *
 * Install (in the host React web app — NOT run here):
 *   npm add @cloudflare/stream-react @supabase/supabase-js
 */
import { useCallback, useEffect, useState } from 'react';
import { Stream } from '@cloudflare/stream-react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The shape the `stream-signed-url` edge function returns on 200. */
interface SignedPlayback {
  url: string;
  token: string;
  customerCode: string;
  videoId: string;
  iframeUrl: string;
  expiresAt: string;
}

type PlayerStatus = 'loading' | 'ready' | 'unconfigured' | 'forbidden' | 'error';

/** Best-effort HTTP status from a supabase-functions error (shape varies by version). */
function statusFromFunctionsError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const ctx = (err as { context?: unknown }).context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as { status?: unknown }).status === 'number') {
    return (ctx as { status: number }).status;
  }
  const direct = (err as { status?: unknown }).status;
  return typeof direct === 'number' ? direct : null;
}

const MESSAGES: Record<Exclude<PlayerStatus, 'loading' | 'ready'>, string> = {
  unconfigured: "This lesson's video isn't available yet.",
  forbidden: 'This video isn’t available to your organization.',
  error: 'We couldn’t load the video right now.',
};

export interface StreamWebPlayerProps {
  /** An authenticated Supabase client (carries the caller's session — RLS scopes the token). */
  supabase: SupabaseClient;
  /** The lesson whose video to play. The tenant is derived server-side; never passed here. */
  lessonId: string;
  /** Optional playback callbacks (wire these to xAPI played/paused if desired). */
  onPlay?: () => void;
  onPause?: () => void;
}

/**
 * Fetches a signed token for `lessonId` and renders the official Cloudflare
 * Stream player. Never sends a tenant_id — the edge function derives the tenant
 * from the verified session and returns 403 for anything outside it.
 */
export function StreamWebPlayer({ supabase, lessonId, onPlay, onPause }: StreamWebPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [playback, setPlayback] = useState<SignedPlayback | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setPlayback(null);
    try {
      const { data, error } = await supabase.functions.invoke<SignedPlayback>('stream-signed-url', {
        body: { lesson_id: lessonId },
      });
      if (error) {
        const code = statusFromFunctionsError(error);
        setStatus(code === 501 ? 'unconfigured' : code === 403 ? 'forbidden' : 'error');
        return;
      }
      if (!data?.token || !data?.customerCode) {
        setStatus('unconfigured');
        return;
      }
      setPlayback(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [supabase, lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'loading') return <div className="stream-player stream-player--loading">Loading…</div>;

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
    );
  }

  // `src` is the signed token; `customerCode` selects the customer-<code> subdomain.
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
  );
}
