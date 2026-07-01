# Architecture Decision Records

This directory captures the load-bearing decisions behind the Soteria Forge
rebuild — the move off the Vercel + Express + MongoDB template to an Expo learner
app, a Turborepo monorepo, and (as of [ADR-0007](./0007-supabase-backend.md)) a
**Supabase** backend. The AWS/Amplify backend originally chosen in ADR-0001/0003
was defined-as-code but never deployed, and has been superseded by Supabase; those
records are kept for history. Each ADR records *why* a path was chosen, what was
rejected, and what living with the decision costs us.

These records are the durable rationale behind the code in `supabase/`,
`apps/mobile/`, `packages/shared`, and `packages/ui`. When the code and an ADR
disagree, one of them is a bug — reconcile deliberately, don't drift.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-backend-amplify-gen2.md) | Backend on Amplify Gen 2 (over raw CDK) | Superseded by [0007](./0007-supabase-backend.md) |
| [0002](./0002-offline-event-sourcing.md) | Offline via append-only event sourcing, idempotent-by-UUID sync | Accepted |
| [0003](./0003-single-pool-multitenancy.md) | Single Cognito pool + `custom:tenantId` + single-table DynamoDB | AWS mechanism superseded by [0007](./0007-supabase-backend.md); tenant-isolation intent stands |
| [0004](./0004-turborepo-monorepo.md) | Turborepo over plain npm workspaces | Accepted |
| [0005](./0005-video-cloudflare-stream.md) | Cloudflare Stream for video; DB stores metadata only | Accepted |
| [0006](./0006-adopt-soteria-forge-ui-kit.md) | Adopt the Soteria Forge UI kit as `packages/ui` (mobile) | Accepted |
| [0007](./0007-supabase-backend.md) | Supabase (Postgres + RLS + Auth + Storage) replaces AWS/Amplify | Accepted |

## How these relate

- **0007** is the current backend: **Supabase** (Postgres + RLS + Auth +
  Storage). It supersedes **0001** in full and the AWS *enforcement mechanism* of
  **0003**, while keeping **0003**'s tenant-isolation *intent* intact.
- **0003** still defines the spine — the multi-tenant invariant (no request may
  read or write another tenant's data) and what "same tenant" means. Everything
  else must not violate it; only its Cognito/AppSync/DynamoDB mechanism is now
  replaced by RLS (`current_tenant_id()`) per **0007**.
- **0001** *(superseded)* picked Amplify Gen 2 to express **0003**'s isolation as
  code. The `backend/` definition it describes has been deleted; the record is
  kept for history.
- **0002** explains how the offline learner app stays correct with append-only,
  idempotent-by-UUID `CompletionStatement`s — unchanged in spirit under **0007**,
  where sync is an `upsert(onConflict: 'id', ignoreDuplicates: true)`.
- **0004** is the repo topology that lets `apps/mobile`, `apps/console`,
  `supabase/`, and the shared packages share one type/tenant contract.
- **0005** keeps video bytes out of the database entirely — Cloudflare Stream
  holds the bytes; the database holds only `video_assets` metadata. Unchanged by
  the Supabase move.
- **0006** makes `packages/ui` a real cross-platform RN component kit for
  `apps/mobile`. Note the **open brand divergence** it records: mobile is now
  ember/spark while `apps/console` + the root `CLAUDE.md` stay Ink/Bone/Cobalt —
  an owner decision (rebrand console, or re-skin the kit) left unresolved.

## Status values

- **Proposed** — under discussion, not yet acted on.
- **Accepted** — decided; the code reflects (or is being made to reflect) it.
- **Superseded by ADR-XXXX** — replaced; keep the record, link forward.
- **Deprecated** — no longer applies, not directly replaced.

## Template

Copy this for any new ADR. Keep it short; link out for detail. Number
sequentially (`NNNN-kebab-title.md`) and add a row to the index above.

```markdown
# ADR-NNNN: <short decision title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** <roles/people>
- **Supersedes / Superseded by:** <links, if any>

## Context

What forces are in play — technical constraints, product goals, prior art,
the specific problem. State the facts that make the decision non-obvious. Name
the invariants this decision must not break (e.g. the tenant-isolation
invariant).

## Decision

The choice, stated in the active voice ("We will …"). Be specific enough that a
reader can tell whether the code obeys it.

## Alternatives considered

Each realistic option, and the concrete reason it lost. "We didn't consider
anything" is a smell.

## Consequences

What becomes easier and what becomes harder. Include the ongoing costs, the new
risks, and the follow-up work this creates. Positive *and* negative.
```
