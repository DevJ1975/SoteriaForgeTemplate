# ADR-0002: Offline via append-only event sourcing, idempotent-by-UUID sync

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Mobile / backend
- **Related:** [ADR-0001](./0001-backend-amplify-gen2.md), [ADR-0003](./0003-single-pool-multitenancy.md), [ADR-0005](./0005-video-cloudflare-stream.md)

## Context

The learner app (`apps/mobile`, React Native + Expo) targets field, construction,
and austere-environment workers who complete training with **no connectivity**
and sync later. So completion has to be recorded offline and reconciled when the
network returns — without losing records and without inventing a conflict-
resolution scheme.

Two hard constraints shape the design:

1. **Amplify Gen 2 has no DataStore.** The Gen 1 offline story (Amplify
   DataStore: a synced local replica with automatic, last-writer-wins conflict
   resolution) does not exist in Gen 2, which we adopted in
   [ADR-0001](./0001-backend-amplify-gen2.md). We cannot lean on a framework to
   "just handle" offline sync.
2. **The completion record is already event-shaped.** A completion is an **xAPI
   statement**: `{ id, tenantId, actor, verb, object, result?, context?,
   timestamp }`. It describes a thing that *happened*. Events don't get edited;
   they accumulate.

The danger to avoid is bidirectional sync with mutable rows, where the same
record edited on device and server must be merged — the classic source of
data-loss bugs and unbounded conflict-resolution complexity.

## Decision

**We model offline completion as append-only event sourcing with idempotent,
UUID-keyed sync — and we do not use DataStore.**

- **Client-generated UUID id.** Each xAPI `CompletionStatement` gets its `id`
  **on the device, at creation time**, from `@soteria-forge/shared`
  (`generateStatementId`). React Native supplies the crypto RNG via the
  `react-native-get-random-values` polyfill loaded in the app entry point.
- **Append-only, immutable.** Statements are never updated or deleted. Server
  auth grants `create` + `read` only (even `super-admin` is read-only for
  statements — see [ADR-0003](./0003-single-pool-multitenancy.md)). The row is
  written once and never disagrees with itself.
- **Idempotent sync by id.** Sync re-sends any not-yet-acknowledged statement.
  Because the primary key is the client-generated UUID, a re-sent statement
  **collides on the key and is a no-op create** — the server dedupes by
  construction. A retry storm is harmless.
- **No conflict resolution — by design.** Immutable rows keyed by a stable UUID
  can never conflict, so there is nothing to merge and no last-writer-wins
  policy. This is a property we protect, not a feature we defer.
- **Local stack: WatermelonDB + NetInfo + AppSync.**
  - **WatermelonDB** (`@nozbe/watermelondb`) is the on-device store: the outbox
    of pending statements plus a local cache of tenant-scoped course/lesson data
    for offline reads.
  - **NetInfo** (`@react-native-community/netinfo`) detects connectivity
    transitions and drives the offline banner and the drain of the outbox.
  - **AppSync** (via the Amplify Data client) is the sync target — plain
    `create` mutations for pending statements, plain `list` queries to refresh
    the local cache. No DataStore subscription/merge layer.

The mobile shell leaves explicit seams for this layer (`src/offline/**`,
`src/db/**`, `useCourses.ts`, `OfflineBanner.tsx`, `AppProviders.tsx`) so the
offline engine drops in without touching the UI.

## Alternatives considered

- **Amplify DataStore — not available.** The Gen 1 answer to exactly this
  problem, but Gen 2 removed it. Even were it present, its automatic
  last-writer-wins conflict resolution is the *opposite* of what append-only
  semantics want; we would be fighting it to preserve every record.
- **Mutable "progress" rows synced bidirectionally — rejected.** Editing a
  per-learner progress row on both device and server forces a merge policy and
  risks silently dropping a completion. Event sourcing sidesteps the entire
  class of bug.
- **Server-assigned ids with a client dedupe key — rejected as redundant.** If
  the id is assigned server-side, the client needs a separate idempotency token
  and the server needs dedupe logic keyed on it. Making the **id itself** the
  client UUID collapses "identity" and "idempotency key" into one thing, so the
  DynamoDB primary key does the dedupe for free.
- **A custom operation log with vector clocks / CRDTs — rejected as
  over-engineered.** Warranted only if records were mutable and concurrently
  editable. They are neither.

## Consequences

**Easier**

- Sync is "send everything unacknowledged; ignore key collisions." Reasoning
  about correctness under flaky networks and app kills reduces to "did the
  create reach the server at least once?"
- Retries, duplicate submits, and re-installs (with the outbox intact) are all
  safe: at-least-once delivery + idempotent create = exactly-once *effect*.
- The offline layer is decoupled from the shell via documented seams, so it can
  land and be reviewed independently.

**Harder / ongoing cost**

- We own the sync engine. WatermelonDB, the outbox drain, NetInfo wiring, and
  backoff are our code and our tests — there is no framework to fall back on.
- **UUID generation must be correct and available offline.** A weak or missing
  RNG would break the idempotency guarantee; the crypto polyfill in the app
  entry point is load-bearing and must not be dropped.
- Append-only means completion records **only grow**. Retention/archival of
  `STMT#…` rows becomes an operational concern over the platform's life.
- Local cached course data can be **stale**; the app must present it as a
  best-effort offline view and refresh on reconnect, and offline reads stay
  tenant-scoped to the signed-in user's `custom:tenantId`
  ([ADR-0003](./0003-single-pool-multitenancy.md)) — never a device-editable
  tenant value.
