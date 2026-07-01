# Soteria Forge — Documentation

Product, architecture, and operational notes for the **Soteria Forge rebuild**:
the move from the Vercel + Express + MongoDB template to a **Supabase** backend
(Postgres + RLS + Auth + Storage), an Expo (React Native) learner app, a kept Vue
admin console, and a Turborepo monorepo.

> **Backend pivot: AWS/Amplify → Supabase** ([ADR-0007](./adr/0007-supabase-backend.md)).
> The AWS/Amplify backend originally planned (ADR-0001/0003) was defined-as-code but
> **never deployed**, and has been deleted in favor of Supabase. A **live Supabase
> project** (ref `bgnadngztngkwzneknhd`) is provisioned, migrated, and seeded, and is
> mirrored as code in [`supabase/`](../supabase/). The **client apps** (`apps/mobile`,
> `apps/console`) remain source-only until their toolchains are installed and deployed.

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
| [0001](./adr/0001-backend-amplify-gen2.md) | Backend on **Amplify Gen 2** (over raw CDK). **Superseded by [0007](./adr/0007-supabase-backend.md).** |
| [0002](./adr/0002-offline-event-sourcing.md) | Offline via **append-only event sourcing**, idempotent-by-UUID sync (no DataStore). Under Supabase, sync is an `upsert(onConflict: 'id', ignoreDuplicates: true)`. |
| [0003](./adr/0003-single-pool-multitenancy.md) | **Multi-tenant, tenant-isolation invariant** (the #1 rule). Its AWS mechanism (single Cognito pool + single-table DynamoDB) is **superseded by [0007](./adr/0007-supabase-backend.md)** (RLS); the isolation *intent* stands. |
| [0004](./adr/0004-turborepo-monorepo.md) | **Turborepo** over plain npm workspaces; retire `lms` + old `api`, keep console, add mobile + ui. |
| [0005](./adr/0005-video-cloudflare-stream.md) | **Cloudflare Stream** stays; MP4 download enables offline; the database stores video metadata only. |
| [0006](./adr/0006-adopt-soteria-forge-ui-kit.md) | Adopt the **Soteria Forge UI kit** as `packages/ui` for mobile (ember/spark + Oswald/Barlow, light/dark, gamification/report components). Records an **open brand divergence**: mobile is ember/spark while console + root stay Ink/Bone/Cobalt. |
| [0007](./adr/0007-supabase-backend.md) | **Supabase** (Postgres + RLS + Auth + Storage) replaces AWS/Amplify. RLS via `current_tenant_id()` is the tenant-isolation gate. Supersedes 0001 and the AWS specifics of 0003. |

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

- `supabase/` — the Supabase backend as code: `config.toml`, `migrations/` (schema,
  RLS policies, storage, grant hardening), and `seed.sql`. Mirrors the live project
  (ref `bgnadngztngkwzneknhd`). See [`supabase/README.md`](../supabase/README.md).
- `apps/mobile/` — Expo learner app (supabase-js client). See
  [`apps/mobile/README.md`](../apps/mobile/README.md).
- `apps/console/` — kept Vue admin, repointed at Supabase (canonical brand tokens in
  `apps/console/src/theme/tokens.css`).
- `packages/shared/` — domain types, xAPI schema, the Supabase-generated DB types,
  and the tenant guard (`tenant.ts`). *(The AWS-era single-table key builders in
  `keys.ts` are dormant — superseded by RLS; see
  [ADR-0007](./adr/0007-supabase-backend.md).)*
- `packages/ui/` — the **Soteria Forge UI kit**: a cross-platform React Native
  component library (ember/spark palette, Oswald/Barlow type, light/dark)
  consumed by `apps/mobile`. See [ADR-0006](./adr/0006-adopt-soteria-forge-ui-kit.md)
  and `packages/ui/CLAUDE.md`. **Brand divergence:** this kit is ember/spark
  while `apps/console` + the root `CLAUDE.md` remain Ink/Bone/Cobalt — an open
  reconciliation decision for the owner.

## The non-negotiable invariant

A caller may only touch their own tenant's data, and **no request may ever read or
write another tenant's data.** The tenant comes **only** from the verified session
JWT — never from request args, body, headers, or subdomain, and clients must never
send a `tenant_id` for authorization. Isolation is enforced **row-level by Postgres
RLS** via `public.current_tenant_id()`, with new rows tenant-stamped by a
`BEFORE INSERT` trigger from the verified auth context. See
[ADR-0003](./adr/0003-single-pool-multitenancy.md) (the invariant),
[ADR-0007](./adr/0007-supabase-backend.md) (the RLS mechanism),
[`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md), and
`supabase/migrations/…02_rls_policies.sql`.

## Security review

[`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) records the adversarial tenant-isolation
review. It was written against the AWS/Amplify model; the **invariant it protects is
unchanged**, but the enforcement it describes (AppSync dynamic groups, Lambda
authorizer, S3 signed-URL mint, `adminGroup` stamping) is superseded by the Supabase
RLS model ([ADR-0007](./adr/0007-supabase-backend.md)). A fresh adversarial review of
the RLS policies is warranted before regulated production use.
