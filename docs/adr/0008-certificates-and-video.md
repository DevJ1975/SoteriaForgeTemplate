# ADR-0008: Auto-issued immutable certificates; Cloudflare Stream signed playback

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform / backend / security
- **Related:** [ADR-0002](./0002-offline-event-sourcing.md),
  [ADR-0005](./0005-video-cloudflare-stream.md),
  [ADR-0007](./0007-supabase-backend.md)

## Context

Two concrete features landed on the live Supabase backend
([ADR-0007](./0007-supabase-backend.md)) and both touch the non-negotiable
tenant-isolation invariant ([ADR-0003](./0003-single-pool-multitenancy.md)), so
they are recorded together.

1. **Course-completion certificates.** When a worker finishes a course we must
   record a durable, auditable certificate. The record has to be **trustworthy** —
   a learner (or a compromised client using the publishable key) must not be able
   to forge, backdate, duplicate, or edit their own certificate — and it must be
   **tenant-scoped** like everything else.

2. **Video playback under the Supabase model.** Video bytes live on **Cloudflare
   Stream** (bytes never enter Postgres — [ADR-0005](./0005-video-cloudflare-stream.md));
   `public.video_assets` stores only metadata (`provider`, `playback_id`,
   `download_url`, `course_id`, `lesson_id`, `tenant_id`). The retired AWS design
   would have bridged AWS auth → Cloudflare with a Lambda; under Supabase we need
   the equivalent bridge that (a) authorizes the caller against **RLS**, not app
   code, and (b) is safe to ship before Cloudflare is even provisioned.

## Decision

### Certificates — system-minted, one-per-(user, course), immutable to clients

**We issue certificates from the database, never from a client.** (Migration
`11_certificates`.)

- A `public.certificates` row is
  `{ id, tenant_id, user_id, course_id, certificate_number, score, issued_at, expires_at, revoked_at }`,
  with a **`unique (user_id, course_id)`** constraint — **exactly one certificate
  per user per course.**
- Issuance is a **`SECURITY DEFINER` trigger** (`issue_certificate`) on
  `enrollments`: when an enrollment first transitions to `status = 'completed'`
  (`old.status is distinct from 'completed'`), it inserts a certificate with a
  generated `certificate_number`, `on conflict (user_id, course_id) do nothing`.
  Idempotent by construction — a re-completion cannot mint a second certificate.
  Enrollment completion is itself server-derived from append-only completion
  statements (`sync_enrollment_progress`, migration `08`), so the whole chain
  from "worker finished the required lessons" to "certificate exists" runs
  server-side.
- **Immutable to clients.** `certificates` has RLS **enabled**, `select` granted
  to `authenticated`, and a read policy scoped to **owner / same-tenant staff
  (`supervisor`/`tenant-admin`) / `super-admin`** — all tenant-checked via
  `current_tenant_id()`. There is **deliberately no INSERT, UPDATE, or DELETE
  policy**, so a client can never create or mutate a certificate; only the
  definer trigger writes the table. Revocation/expiry are represented by the
  `revoked_at` / `expires_at` columns, set by future privileged server logic —
  not by clients.

### Video — Cloudflare Stream, metadata in Postgres, RLS-gated signed playback

**We keep video on Cloudflare Stream ([ADR-0005](./0005-video-cloudflare-stream.md))
and authorize playback through an RLS-checked edge function.**

- **Metadata only in Postgres.** `video_assets` is tenant-scoped by RLS and holds
  the `playback_id`, the offline `download_url` (MP4), and the lesson/course
  links — never bytes.
- **Signed playback via `supabase/functions/stream-signed-url`.** The function
  (deployed with `verify_jwt=true`) reads the caller's JWT, builds a Supabase
  client **with the caller's auth header + the anon key**, and reads the requested
  `video_assets` row **through that client** so **RLS scopes it to the caller's
  tenant**. A row in another tenant is invisible → `403`. **The service-role key
  is deliberately not used for this read** — it would bypass RLS and could leak
  another tenant's video. Only after that gate passes does the function call the
  Cloudflare API (`POST /accounts/{id}/stream/{playback_id}/token`, Bearer
  `CF_STREAM_API_TOKEN`, short `exp`) to mint a **signed** token.
- **One endpoint, every player surface (function v2).** The function returns both
  delivery shapes from the single tenant-checked call: the signed HLS `url`
  (`…/<token>/manifest/video.m3u8`) for a native player, and the raw signed
  `token` + `customerCode` + a ready-made `iframeUrl` (`…/<token>/iframe`) for the
  official Cloudflare Stream player. This lets **mobile** use a React Native
  `WebView` (the Stream player) online and `react-native-video` on the cached MP4
  offline, the **console** render an admin `<iframe>` preview, and an optional
  **React web** surface use `@cloudflare/stream-react` — all off the same signed,
  RLS-gated response. The token is scoped to that one video and short-lived; it is
  safe to hand to a player and is **not** the Cloudflare API token.
- **Graceful before Cloudflare exists.** If any of `CF_ACCOUNT_ID`,
  `CF_STREAM_API_TOKEN`, `CF_STREAM_CUSTOMER_CODE` is unset, the function returns
  **`501 { "error": "video provider not configured" }`** — so it can be deployed
  and pass a tenant-isolation review before the Cloudflare account is set up.
- **Offline** ([ADR-0002](./0002-offline-event-sourcing.md)) still uses the
  Cloudflare **MP4 download** rendition (`video_assets.download_url`) cached on
  device; only the *streaming* path needs a fresh signed token.

## Alternatives considered

- **Client-issued certificates (mobile/console writes the row) — rejected.** A
  client holding the publishable key could forge, duplicate, backdate, or edit a
  certificate. Making certificates trustworthy requires that only the database
  mints them; hence the definer trigger and the absence of any write policy.
- **A separate certificates service / scheduled job — rejected.** A trigger on the
  `completed` transition is synchronous, atomic with the completion, and needs no
  extra infrastructure. The `unique (user_id, course_id)` + `do nothing` already
  gives idempotency; a job would add moving parts for no gain.
- **Read the video row with the service-role key in the edge function — rejected.**
  It would bypass RLS and reintroduce app-code tenant checks — exactly the
  split-brain authorization [ADR-0007](./0007-supabase-backend.md) removed. Reading
  through the caller's client makes RLS the single gate.
- **Return unsigned / public Cloudflare URLs — rejected.** That would let anyone
  with the URL stream tenant video. Signed, short-lived tokens keep access
  time-bounded and tied to an authorized request.
- **Move video into Supabase Storage — rejected.** Re-litigates
  [ADR-0005](./0005-video-cloudflare-stream.md): Cloudflare Stream already gives
  transcode, adaptive delivery, and the downloadable MP4 for offline.

## Consequences

**Easier**

- Certificates are **trustworthy by construction** — one per (user, course),
  system-minted, immutable, tenant-scoped — with no client trust required.
- Video authorization has **one gate: RLS.** The edge function adds no parallel
  tenant check; if RLS can't see the row, no token is minted.
- The video function is **safe to ship early** — the `501` path means it can be
  deployed and reviewed before Cloudflare Stream exists.

**Harder / ongoing cost**

- **Two clouds again.** The AWS/Cloudflare split of
  [ADR-0005](./0005-video-cloudflare-stream.md) is now a Supabase/Cloudflare split:
  a Cloudflare account, a Stream-scoped API token, and three function secrets
  (`CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_CUSTOMER_CODE`) must be
  provisioned and kept out of git (see [`docs/OPERATIONS.md`](../OPERATIONS.md)).
- **Certificate lifecycle is only half-built.** Issuance is automatic; revocation,
  expiry, re-issue, and the rendered PDF/artifact are future privileged
  server-side work — clients still may not write the table.
- **`certificate_number` format is a contract.** It embeds a tenant slug fragment
  and a year; changing the format later needs care so existing numbers stay valid
  and unique.
- **Signed-URL TTL is a tradeoff.** A ~2h token balances not re-minting on every
  seek against limiting a leaked URL's window; long offline sessions use the MP4
  download path instead.
