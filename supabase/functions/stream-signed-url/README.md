# `stream-signed-url` — tenant-checked Cloudflare Stream signed playback

A Supabase Edge Function (Deno) that mints a **short-lived, signed** Cloudflare
Stream playback URL for a lesson's video. Video bytes live on Cloudflare Stream;
`public.video_assets` holds only metadata (`provider`, `playback_id`,
`download_url`, `course_id`, `lesson_id`, `tenant_id`) — see
[ADR-0005](../../../docs/adr/0005-video-cloudflare-stream.md) and
[ADR-0008](../../../docs/adr/0008-certificates-and-video.md).

## What it does

1. Requires a caller JWT (deployed with `verify_jwt=true`) and reads the caller's
   `Authorization` header.
2. Builds a Supabase client with the **caller's** JWT + the anon key, and reads
   the requested `video_assets` row **through that client**. Postgres **RLS**
   scopes the row to the caller's tenant — a row in another tenant is invisible.
   **This is the tenant-isolation gate.** The service-role key is deliberately
   **not** used for this read.
3. Mints a signed Stream token from the Cloudflare API with a short expiry
   (~2h) and returns the signed HLS manifest URL.

## Request / response

`POST` JSON — one of:

```json
{ "video_asset_id": "<uuid>" }
{ "lesson_id": "<uuid>" }
```

Success (`200`):

```json
{
  "url": "https://customer-<code>.cloudflarestream.com/<token>/manifest/video.m3u8",
  "expiresAt": "2026-07-01T12:00:00.000Z"
}
```

Errors (clean JSON): `400` bad input · `401` missing auth · `403` video not
found / not visible to the caller's tenant (isolation gate) · `501` provider not
configured · `502` upstream Cloudflare error.

## Secrets (set with the Supabase CLI — NEVER commit the token)

| Secret | What |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare account id owning the Stream videos |
| `CF_STREAM_API_TOKEN` | Cloudflare API token scoped to **Stream** (Bearer) |
| `CF_STREAM_CUSTOMER_CODE` | the `customer-<code>` subdomain of `*.cloudflarestream.com` |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected by the platform — do not set them.

If any `CF_*` secret is missing, the function returns **501 `{ "error": "video
provider not configured" }`** — so it is safe to deploy before Cloudflare Stream
is provisioned.

## Deploy

```bash
supabase secrets set \
  CF_ACCOUNT_ID=... \
  CF_STREAM_API_TOKEN=... \
  CF_STREAM_CUSTOMER_CODE=... \
  --project-ref bgnadngztngkwzneknhd

supabase functions deploy stream-signed-url --project-ref bgnadngztngkwzneknhd
```

See [`docs/OPERATIONS.md`](../../../docs/OPERATIONS.md) → "Cloudflare Stream (video)"
for the full account + upload flow.
