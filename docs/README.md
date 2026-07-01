# Soteria Forge — Documentation

Product, architecture, and operational notes for the **AWS-era Soteria Forge
rebuild**: the move from the Vercel + Express + MongoDB template to an Amplify
Gen 2 backend, an Expo (React Native) learner app, a kept Vue admin console, and
a Turborepo monorepo.

> **Phase 0 is defined-as-code only.** Nothing in this rebuild is deployed and no
> AWS/Cloudflare/Expo resources exist. These docs describe the intended system;
> correctness of the *definition* is the deliverable.

## Start here

- **[`SOTERIA_FORGE_REBUILD_PLAN.md`](./SOTERIA_FORGE_REBUILD_PLAN.md)** — the
  rebuild plan: goals, target architecture, and the phased path from the old
  template to the AWS-era platform. *(Placed here by the orchestrator.)*
- **[`CLAUDE_SWARM.md`](./CLAUDE_SWARM.md)** — the swarm guide: how the
  multi-agent rebuild is organized, which agent owns which subtree, and the
  shared architecture contract every agent honors. *(Placed here by the
  orchestrator.)*

## Architecture Decision Records

The load-bearing decisions behind the rebuild live in **[`adr/`](./adr/)** — see
[`adr/README.md`](./adr/README.md) for the index and the ADR template.

| ADR | Decision |
|-----|----------|
| [0001](./adr/0001-backend-amplify-gen2.md) | Backend on **Amplify Gen 2** (over raw CDK). |
| [0002](./adr/0002-offline-event-sourcing.md) | Offline via **append-only event sourcing**, idempotent-by-UUID sync (no DataStore); WatermelonDB + NetInfo + AppSync. |
| [0003](./adr/0003-single-pool-multitenancy.md) | **Single Cognito pool** + `custom:tenantId` + groups; **single-table DynamoDB** with `TENANT#` partition; the tenant-match invariant. |
| [0004](./adr/0004-turborepo-monorepo.md) | **Turborepo** over plain npm workspaces; retire `lms` + old `api`, keep console, add mobile + backend + ui. |
| [0005](./adr/0005-video-cloudflare-stream.md) | **Cloudflare Stream** stays (AWS/CF split is deliberate); MP4 download enables offline; DynamoDB stores metadata only. |
| [0006](./adr/0006-adopt-soteria-forge-ui-kit.md) | Adopt the **Soteria Forge UI kit** as `packages/ui` for mobile (ember/spark + Oswald/Barlow, light/dark, gamification/report components). Records an **open brand divergence**: mobile is ember/spark while console + root stay Ink/Bone/Cobalt. |

## Operational and product notes

These predate the AWS rebuild and describe the current template / product shape.
Where they mention MongoDB, the Express API, or Vercel routing, the ADRs above
supersede them for the AWS-era platform; they remain useful for product intent
and the marketplace/billing model.

- [`template-product-plan.md`](./template-product-plan.md) — what the training
  app template is and the reusable modules it ships.
- [`safety-forge-10-hour.md`](./safety-forge-10-hour.md) — the Safety FORGE
  10-hour course shell: the first reusable compliance-style course pattern.
- [`marketplace-billing.md`](./marketplace-billing.md) — marketplace vs.
  dedicated tenant modes, Stripe setup, and entitlement behavior.
- [`deployment.md`](./deployment.md) — deployment notes (Vercel-era; the storage
  policy "no video in the database" carries forward — see
  [ADR-0005](./adr/0005-video-cloudflare-stream.md)).

## Where the architecture lives in code

- `backend/` — Amplify Gen 2 definition (auth, data, storage, functions).
  See [`backend/README.md`](../backend/README.md) and
  [`backend/data/tenant-isolation.md`](../backend/data/tenant-isolation.md).
- `apps/mobile/` — Expo learner app. See
  [`apps/mobile/README.md`](../apps/mobile/README.md).
- `apps/console/` — kept Vue admin (canonical brand tokens in
  `apps/console/src/theme/tokens.css`).
- `packages/shared/` — domain types, xAPI schema, single-table key builders
  (`keys.ts`), and the tenant guard (`tenant.ts`).
- `packages/ui/` — the **Soteria Forge UI kit**: a cross-platform React Native
  component library (ember/spark palette, Oswald/Barlow type, light/dark)
  consumed by `apps/mobile`. See [ADR-0006](./adr/0006-adopt-soteria-forge-ui-kit.md)
  and `packages/ui/CLAUDE.md`. **Brand divergence:** this kit is ember/spark
  while `apps/console` + the root `CLAUDE.md` remain Ink/Bone/Cobalt — an open
  reconciliation decision for the owner.

## The non-negotiable invariant

Every data access is scoped by `TENANT#<tenantId>`, and a caller may only touch
their own tenant's partition. The tenant comes **only** from the verified Cognito
`custom:tenantId` claim — never from request args, body, headers, or subdomain.
Isolation is enforced **row-level** by AppSync dynamic-group authorization
(`allow.groupDefinedIn('tenantId')`). See
[ADR-0003](./adr/0003-single-pool-multitenancy.md),
[`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md), and
`backend/data/tenant-isolation.md`.

## Security review

[`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) records the adversarial Phase 0
review: the cross-tenant findings that were caught, the row-level remediation
that closed them, and the tracked residuals (S3 signed-URL mint, `adminGroup`
stamping) that must close before regulated production use.
