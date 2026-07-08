# ADR-0011: Record lesson completions on the web learner surface

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Owner, Platform
- **Related:** [ADR-0002](./0002-offline-event-sourcing.md) (offline event
  sourcing / append-only xAPI), [ADR-0007](./0007-supabase-backend.md) (Supabase
  + RLS), [ADR-0010](./0010-web-installable-pwa.md) (web installable PWA)

## Context

`apps/web` (React + Vite PWA) shipped as **browse + play only**: sign in with
Supabase Auth, browse the caller's RLS-scoped courses, play lesson video via the
official Cloudflare Stream player. Recording completions, offline sync,
certificates, and authoring were deliberately kept out (see the prior "Scope
(deliberately narrow)" note in `apps/web/CLAUDE.md`).

That split means training done on a **kiosk or desktop** through the web app
earns **no credit** — a worker who completes a document or passes a quiz in the
browser produces no `completion_statements` row, so the compliance record for a
person depends on *which device* they used. For a safety-training product where
training records are legal evidence, a device-dependent record is a defect.

The owner approved expanding the web app into a **learning surface that records
completions**, explicitly superseding the old "do not add sync/completion here"
note. The hard requirement: the web client must record **identically** to
`apps/mobile`, so the two clients write the same rows and the same server
progress trigger counts them the same way — no second, divergent completion
path.

Constraints that shape the design:

- **Tenant isolation is non-negotiable.** The tenant comes only from the verified
  session; the client never sends a tenant_id for authorization. Enforcement is
  Postgres RLS + the `BEFORE INSERT` tenant-stamp trigger.
- **xAPI statements are append-only + idempotent by client UUID.** No conflict
  resolution, ever. Re-sending a statement is a guaranteed no-op.
- **No new npm dependency.** The web app is verified in throwaway installs and
  deployed on Vercel; a new dep risks `verify-deps-resolve` and the build. Use
  browser-native APIs only.
- **Never cache an RLS response.** ADR-0010 makes Supabase a Workbox
  `NetworkOnly` route; that must stay true.

## Decision

Add a completion-recording path to `apps/web` that is a **faithful mirror of the
mobile offline-sync layer**, built on browser-native primitives.

### 1. Durable append-only outbox on IndexedDB

`src/offline/outbox.ts` is an IndexedDB-backed, append-only store of xAPI
statements — the web analogue of mobile's on-disk WatermelonDB outbox. Statements
are built with the shared `createCompletionStatement` (client UUID = primary key
= idempotency key). Enqueue is idempotent by that UUID (a duplicate returns the
stored record; `add` never overwrites). Records carry a `synced` flag and attempt
bookkeeping; a permanently server-**rejected** row keeps a terminal marker so it
stops re-uploading forever yet remains stored for audit — exactly mobile's
`REJECTED_MARKER` semantics.

The pure logic (record shape, idempotency, status derivation, the
`completed`/`passed` completion-verb set, and the "which lessons are locally
complete" projection) lives in a **framework-free, storage-free** module
`src/offline/outboxCore.ts`, reviewable and unit-testable without a browser —
mirroring how mobile keeps `queue.ts`'s rules node-safe.

**Why IndexedDB, not the service-worker cache:** the SW cache is for the app
shell, and RLS responses must never be cached. The outbox stores the learner's
**own outbound writes**, not fetched tenant data, in a separate IndexedDB
database that is never a Workbox runtime cache. ADR-0010's rule is fully
preserved; Supabase stays `NetworkOnly`.

### 2. Idempotent sync engine

`src/offline/sync.ts` (`WebSyncEngine`) drains the outbox to
`public.completion_statements`, connectivity-gated by the browser's
`useOnlineStatus`. `src/offline/transport.ts` performs the **identical** write
mobile does:

```ts
supabase.from('completion_statements')
  .upsert([row], { onConflict: 'id', ignoreDuplicates: true })
```

with the identical column mapping: `id`, `user_id`, `actor`, `verb`, `object`,
`result`, `context`, `occurred_at` (= the statement's activity timestamp). It
carries `tenant_id: statement.tenantId` **only** to satisfy the non-nullable
`TablesInsert<'completion_statements'>` column shape — its value derives from the
verified profile (never request input), and the `BEFORE INSERT` trigger
re-stamps it from `auth.uid()` regardless. The client never *chooses* the tenant;
this is exactly mobile's ServerStamped discipline. The engine reproduces mobile's
backoff, give-up policy, and per-row **identity fence** (a record only uploads
under the session that authored it) verbatim, and drains on reconnect and after
each enqueue.

There is no merge logic and no conflict resolution, for the same reason mobile
has none: the id fixes identity and the payload is immutable, so re-sending
converges to exactly one stored copy.

### 3. Lesson play + on-device scoring

`src/components/LessonPlayer.tsx` renders a selected lesson beside the existing
Stream video player and closes the learning loop:

- **document / reflection / video / practical-signoff** → render `content.body`
  (parsed by the shared `parseLessonContent`) and a **Mark complete** control
  that records verb `completed`, `result.completion = true`.
- **quiz with authored questions** → `src/components/QuizView.tsx` scores answers
  on-device with the shared `scoreQuiz` + `resolvePassingScore` and records verb
  `passed` / `failed` with `result.score` + `result.success`.

Every statement's `context` is exactly `{ course_id, lesson_id }` — the shape the
migration-12 progress trigger reads — so a web completion advances enrollment
progress identically to a mobile one. The actor/tenant/user come only from the
verified session via `OutboxProvider.recordCompletion`, never from component or
route input.

### 4. Surfacing sync + completion state

`src/offline/OutboxProvider.tsx` exposes `recordCompletion`, a `pendingSyncCount`,
and a `completionVersion` counter. `src/components/SyncStatus.tsx` shows a header
chip ("N pending", "offline") from that context, and `CourseDetail` reflects a
just-completed lesson **immediately** from the local outbox — before the server
confirms — mirroring mobile's `completedLessonIds` pattern. Each new surface
covers loading / empty / error / offline / content states.

## Consequences

**Positive**

- The compliance record is device-independent: kiosk/desktop training earns the
  same credit as mobile, written as the same append-only, idempotent rows.
- No new dependency; the outbox is browser-native IndexedDB. The PWA caching
  contract is untouched (Supabase stays `NetworkOnly`).
- Pure logic is isolated and testable without a browser or React, matching the
  mobile layer's structure.

**Negative / trade-offs**

- Unlike mobile, the web quiz has **no cross-reload resume store**: a kiosk reload
  mid-quiz restarts the attempt. Acceptable for a browser surface; the recorded
  result is still append-only and idempotent once submitted.
- Quizzes are scored **on device** (the `correctChoiceId` ships in RLS-readable
  content) — the same accepted MVP trade-off documented in
  `packages/shared/src/lessonContent.ts`. Server-side scoring is the future
  hardening.
- This adds a write path to a client that previously only read. It goes through
  **security-reviewer** (the tenant-isolation gate), which validates that the
  upload sends no client-chosen tenant_id for authorization and relies wholly on
  RLS + the insert trigger.

## Alternatives considered

- **Keep web read-only, route all completion through mobile.** Rejected: it is
  the defect — training happens on kiosks/desktops too, and the record must not
  depend on the device.
- **A bespoke web completion format / direct insert.** Rejected: a second,
  divergent path invites drift from mobile and from the server trigger's expected
  shape. Mirroring the proven mobile contract is the whole point.
- **localStorage instead of IndexedDB.** Rejected: localStorage is synchronous,
  small, string-only, and easy to clobber; IndexedDB is the durable,
  structured-record store browsers provide natively (no dependency).
