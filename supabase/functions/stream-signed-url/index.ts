// supabase/functions/stream-signed-url/index.ts
//
// Mint a short-lived, tenant-checked Cloudflare Stream SIGNED playback URL for a
// lesson's video. The bytes live on Cloudflare Stream; `public.video_assets`
// holds metadata only (see ADR-0005 / ADR-0008).
//
// TENANT-ISOLATION GATE (the #1 rule): the requested `video_assets` row is read
// THROUGH a Supabase client built with the CALLER's own JWT, so Postgres RLS
// scopes it to the caller's tenant. If the row is not visible to the caller it
// is treated as not-found → 403. We deliberately do NOT use the service-role key
// for this read — doing so would bypass RLS and could leak another tenant's video.
//
// GRACEFUL DEGRADATION: if the Cloudflare secrets are not configured this returns
// 501 (not 500), so the function is safe to deploy BEFORE Cloudflare Stream is set up.
//
// ── Required secrets (set with `supabase secrets set …`) ─────────────────────
//   CF_ACCOUNT_ID           Cloudflare account id that owns the Stream videos
//   CF_STREAM_API_TOKEN     Cloudflare API token, scoped to Stream (Bearer)
//   CF_STREAM_CUSTOMER_CODE the `customer-<code>` subdomain of *.cloudflarestream.com
// Auto-injected by the platform (do NOT set these yourself):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//
// ── Deploy (verify_jwt is ON so every call carries a real user session) ──────
//   supabase functions deploy stream-signed-url --project-ref bgnadngztngkwzneknhd
//
// NEVER commit the CF token — it is a secret and lives only in function config.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// How long a minted playback token stays valid.
const TOKEN_TTL_SECONDS = 2 * 60 * 60 // 2 hours

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface RequestBody {
  video_asset_id?: string
  lesson_id?: string
}

Deno.serve(async (req: Request) => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  // A caller JWT is mandatory (the function is deployed with verify_jwt=true, but
  // we still need the header to build a caller-scoped client and let RLS act).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'missing Authorization header' }, 401)
  }

  // Parse input: either a specific video_asset_id, or a lesson_id.
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const videoAssetId = body.video_asset_id?.trim()
  const lessonId = body.lesson_id?.trim()
  if (!videoAssetId && !lessonId) {
    return json({ error: 'video_asset_id or lesson_id is required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    // Platform-injected; absence is a deploy/config error, not a caller error.
    return json({ error: 'server misconfigured' }, 500)
  }

  // Build a Supabase client that carries the CALLER's JWT. Every query through it
  // runs under the caller's session → RLS scopes rows to the caller's tenant.
  // The anon key is client-safe (RLS-protected); we do NOT use the service role.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Read the requested video asset THROUGH the caller-scoped client. RLS on
  // `video_assets` restricts this to the caller's tenant; a row in another tenant
  // is simply invisible (returns no rows), so we cannot leak across tenants.
  let query = supabase
    .from('video_assets')
    .select('id, playback_id, provider, tenant_id, lesson_id')
    .limit(1)

  query = videoAssetId ? query.eq('id', videoAssetId) : query.eq('lesson_id', lessonId!)

  const { data: asset, error: readError } = await query.maybeSingle()

  if (readError) {
    return json({ error: 'failed to read video asset' }, 500)
  }
  if (!asset) {
    // Not found OR not visible to this tenant — same response either way.
    // This is the tenant-isolation gate: no cross-tenant existence disclosure.
    return json({ error: 'video not found' }, 403)
  }

  // Cloudflare creds. If any is missing, the provider isn't configured yet →
  // 501 so the function is safe to ship before Cloudflare Stream exists.
  const cfAccountId = Deno.env.get('CF_ACCOUNT_ID')
  const cfApiToken = Deno.env.get('CF_STREAM_API_TOKEN')
  const cfCustomerCode = Deno.env.get('CF_STREAM_CUSTOMER_CODE')
  if (!cfAccountId || !cfApiToken || !cfCustomerCode) {
    return json({ error: 'video provider not configured' }, 501)
  }

  const playbackId = asset.playback_id
  if (!playbackId) {
    return json({ error: 'video asset has no playback id' }, 502)
  }

  // Mint a signed Stream token via the Cloudflare API, with a short expiry.
  const expSeconds = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  let cfResponse: Response
  try {
    cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${playbackId}/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exp: expSeconds }),
      },
    )
  } catch {
    return json({ error: 'failed to reach video provider' }, 502)
  }

  if (!cfResponse.ok) {
    return json({ error: 'video provider rejected the request' }, 502)
  }

  let cfJson: { success?: boolean; result?: { token?: string } }
  try {
    cfJson = await cfResponse.json()
  } catch {
    return json({ error: 'invalid response from video provider' }, 502)
  }

  const token = cfJson?.result?.token
  if (!cfJson?.success || !token) {
    return json({ error: 'video provider did not return a token' }, 502)
  }

  // Build the signed HLS manifest URL against the tenant's customer subdomain.
  const url = `https://customer-${cfCustomerCode}.cloudflarestream.com/${token}/manifest/video.m3u8`

  return json(
    {
      url,
      expiresAt: new Date(expSeconds * 1000).toISOString(),
    },
    200,
  )
})
