# Architecture Decision Records

This directory captures the load-bearing decisions behind the **AWS-era Soteria
Forge rebuild** — the move from the Vercel + Express + MongoDB template to an
Amplify Gen 2 backend, an Expo learner app, and a Turborepo monorepo. Each ADR
records *why* a path was chosen, what was rejected, and what living with the
decision costs us.

These records are the durable rationale behind the code in `backend/`,
`apps/mobile/`, `packages/shared`, and `packages/ui`. When the code and an ADR
disagree, one of them is a bug — reconcile deliberately, don't drift.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](./0001-backend-amplify-gen2.md) | Backend on Amplify Gen 2 (over raw CDK) | Accepted |
| [0002](./0002-offline-event-sourcing.md) | Offline via append-only event sourcing, idempotent-by-UUID sync | Accepted |
| [0003](./0003-single-pool-multitenancy.md) | Single Cognito pool + `custom:tenantId` + single-table DynamoDB | Accepted |
| [0004](./0004-turborepo-monorepo.md) | Turborepo over plain npm workspaces | Accepted |
| [0005](./0005-video-cloudflare-stream.md) | Cloudflare Stream for video; DynamoDB stores metadata only | Accepted |

## How these relate

- **0003** is the spine: single pool, `custom:tenantId`, single-table
  `TENANT#` partition, and the tenant-match invariant. Everything else must not
  violate it.
- **0001** picks the tool (Amplify Gen 2) that lets us express **0003**'s
  resolvers, groups, and Lambda authorizer as code.
- **0002** explains how the offline learner app stays correct *without* Amplify
  DataStore (which Gen 2 dropped), leaning on **0003**'s append-only,
  idempotent-by-UUID `CompletionStatement`.
- **0004** is the repo topology that lets `apps/mobile`, `apps/console`,
  `backend`, and the shared packages share one type/tenant contract.
- **0005** keeps video bytes out of AWS entirely and out of DynamoDB
  specifically — DynamoDB holds only `VideoAsset` metadata.

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
