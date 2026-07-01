/**
 * useLessonVideo — resolve a PLAYABLE source for a video lesson.
 *
 * Video bytes live on Cloudflare Stream; the DB holds METADATA ONLY. A signed,
 * short-lived playback bundle is minted server-side by the `stream-signed-url`
 * edge function, which we invoke with just the opaque `lesson_id`:
 *
 *     supabase.functions.invoke('stream-signed-url', { body: { lesson_id } })
 *       → { url,          // HLS manifest (.m3u8) — for react-native-video
 *           token,        // signed Cloudflare Stream token
 *           customerCode, // the customer-<code> subdomain
 *           videoId,
 *           iframeUrl,    // ready-made Stream player embed (WebView src)
 *           expiresAt }
 *
 * ONLINE vs OFFLINE playback: online we prefer the official Cloudflare Stream
 * player, loaded from the edge function's `iframeUrl` in a WebView; offline we
 * fall back to a cached MP4 played by react-native-video. The consumer branches
 * on `iframeUrl` (present ⇒ online Stream player) vs `offline` (⇒ cached MP4).
 *
 * TENANT ISOLATION: the edge function derives the caller's tenant from the
 * verified session and refuses (403) any lesson/video outside it — the client
 * never sends a tenant_id. We pass only the lesson id (itself RLS-scoped on the
 * read paths). The function returns 501 until Cloudflare is configured.
 *
 * GRACEFUL DEGRADATION (never break the lesson):
 *   - 501 ("video provider not configured") → `unconfigured`  → friendly
 *     "video isn't available yet" placeholder.
 *   - 403 (video outside your tenant / not authorized)        → `forbidden` →
 *     same friendly placeholder (we never surface a scary error).
 *   - any other error / network failure                       → `error` →
 *     placeholder + a soft retry.
 * In every case the Mark-complete flow keeps working — this hook only supplies a
 * playback source; it never gates completion.
 *
 * OFFLINE-FIRST: if this lesson's `video_assets.download_url` is already cached
 * (an offline rendition), we PREFER it and skip the network entirely, so a field
 * worker with no connectivity can still watch a downloaded lesson.
 */
import { useCallback, useEffect, useState } from 'react';
import type { VideoAssetRow } from '@soteria-forge/shared/supabase';
import { supabase, isSupabaseConfigured } from '../supabase';

/**
 * The distinct outcomes the player screen renders on. Kept as a discriminated
 * status so the UI can pick the right affordance without inspecting HTTP codes.
 */
export type VideoSourceStatus =
  | 'loading'
  | 'ready'
  | 'unconfigured' // 501 — Cloudflare not set up yet
  | 'forbidden' // 403 — not this tenant's video
  | 'error'; // any other failure

export interface LessonVideoSource {
  status: VideoSourceStatus;
  /** A playable URI (HLS `.m3u8` from the edge function, or a cached download URL). */
  uri: string | null;
  /**
   * The official Cloudflare Stream player embed to load in a WebView, minted by
   * the edge function (`https://customer-<code>.cloudflarestream.com/<token>/iframe`).
   * Present ONLY on an online mint; `null` when serving a cached offline MP4.
   * A consumer renders the Stream player when this is set, otherwise the cached
   * MP4 via `uri`. This is server-provided — the client never constructs it.
   */
  iframeUrl: string | null;
  /** The signed Cloudflare Stream token from the online mint (null when offline). */
  token: string | null;
  /** The `customer-<code>` subdomain from the online mint (null when offline). */
  customerCode: string | null;
  /** True when `uri` is a locally/remotely cached offline rendition (not the signed HLS). */
  offline: boolean;
  /** A short, user-facing explanation for the non-`ready` states. */
  message: string | null;
  /** Re-attempt resolution (used by the placeholder's soft retry). */
  refetch: () => void;
}

/**
 * Best-effort extraction of an HTTP status from a supabase-functions error.
 *
 * `functions.invoke` rejects HTTP errors as a `FunctionsHttpError` whose
 * `.context` is the underlying `Response` (so `.context.status` is the code). We
 * read it defensively — shape can vary across supabase-js minor versions and we
 * must never throw while classifying a failure.
 */
function statusFromFunctionsError(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const ctx = (err as { context?: unknown }).context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as { status?: unknown }).status === 'number') {
    return (ctx as { status: number }).status;
  }
  // Some versions surface the status directly on the error.
  const direct = (err as { status?: unknown }).status;
  return typeof direct === 'number' ? direct : null;
}

/** Map a resolved status to its user-facing message. */
function messageFor(status: VideoSourceStatus): string | null {
  switch (status) {
    case 'unconfigured':
      return 'This lesson’s video isn’t available yet. You can still mark the lesson complete.';
    case 'forbidden':
      return 'This video isn’t available to your organization. You can still mark the lesson complete.';
    case 'error':
      return 'We couldn’t load the video right now. You can still mark the lesson complete.';
    default:
      return null;
  }
}

/**
 * Look up any cached offline rendition for this lesson. RLS-scoped: the metadata
 * row only resolves within the caller's tenant, and we read `download_url` only —
 * never bytes. Returns null when there's no cached offline URL (the common case
 * until a lesson is downloaded for offline use).
 */
async function readCachedDownloadUrl(lessonId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('video_assets')
      .select('download_url')
      .eq('lesson_id', lessonId)
      .not('download_url', 'is', null)
      .limit(1)
      .maybeSingle<Pick<VideoAssetRow, 'download_url'>>();
    if (error) return null;
    return data?.download_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a playable source for a video lesson, preferring a cached offline
 * rendition and otherwise minting a signed HLS URL via the edge function.
 * Degrades gracefully on 501/403/any error without ever breaking the lesson.
 */
/** The online-mint fields the edge function returns on a 200. */
interface StreamSignedUrlResponse {
  url?: string;
  token?: string;
  customerCode?: string;
  videoId?: string;
  iframeUrl?: string;
  expiresAt?: string;
}

export function useLessonVideo(lessonId: string | undefined): LessonVideoSource {
  const [status, setStatus] = useState<VideoSourceStatus>('loading');
  const [uri, setUri] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [customerCode, setCustomerCode] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const resetOnlineFields = () => {
      setUri(null);
      setIframeUrl(null);
      setToken(null);
      setCustomerCode(null);
      setOffline(false);
    };

    if (!lessonId) {
      setStatus('error');
      resetOnlineFields();
      return;
    }

    setStatus('loading');
    resetOnlineFields();

    // 1. PREFER a cached offline rendition — zero network, works in the field.
    //    Offline plays the cached MP4 via react-native-video, so there is NO
    //    iframeUrl in this branch (the Stream embed needs connectivity).
    const cached = await readCachedDownloadUrl(lessonId);
    if (cached) {
      setUri(cached);
      setOffline(true);
      setStatus('ready');
      return;
    }

    // Without a backend we can't mint a signed URL — degrade to the placeholder
    // rather than hitting an unconfigured origin.
    if (!isSupabaseConfigured) {
      setStatus('unconfigured');
      return;
    }

    // 2. Mint a signed playback bundle from the edge function (tenant-checked
    //    server-side; the client sends only the lesson id, never a tenant_id).
    try {
      const { data, error } = await supabase.functions.invoke<StreamSignedUrlResponse>(
        'stream-signed-url',
        { body: { lesson_id: lessonId } },
      );

      if (error) {
        const code = statusFromFunctionsError(error);
        if (code === 501) setStatus('unconfigured');
        else if (code === 403) setStatus('forbidden');
        else setStatus('error');
        return;
      }

      const url = data?.url;
      if (!url) {
        // A 2xx with no URL is treated as "not available yet", not a hard error.
        setStatus('unconfigured');
        return;
      }

      // Online mint: keep the HLS `url` as `uri` (react-native-video fallback)
      // and surface the ready-made Stream embed for the WebView player. All of
      // these come straight from the RLS-checked edge response — never built here.
      setUri(url);
      setIframeUrl(data?.iframeUrl ?? null);
      setToken(data?.token ?? null);
      setCustomerCode(data?.customerCode ?? null);
      setOffline(false);
      setStatus('ready');
    } catch {
      // Network failure / unexpected throw — degrade, never break the lesson.
      setStatus('error');
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return {
    status,
    uri,
    iframeUrl,
    token,
    customerCode,
    offline,
    message: messageFor(status),
    refetch,
  };
}
