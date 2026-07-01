# Soteria Forge

Mobile-first (iOS + Android), **offline-capable**, **multi-tenant** training platform with heavy
video, single sign-on, and headroom for 64,000 workers. Anchor use case: the ATL "Curb to Cabin"
workforce training program.

> **Status — AWS-era rebuild, Phase 0 foundation. Defined-as-code, UNDEPLOYED.**
> This repo currently contains the *code-first* foundation of the rebuild: the Turborepo layout,
> the shared domain model, the Amplify Gen 2 backend definition, the Expo mobile app + offline
> layer, and the agent-swarm scaffolding. **Nothing here has been `npm install`ed, built native,
> or deployed** — no AWS/Cloudflare/Expo resources exist yet. Live provisioning (AWS account,
> Cognito/DynamoDB/AppSync/Lambda, Cloudflare Stream, EAS builds) is the next, credentialed step.
> See [`docs/SOTERIA_FORGE_REBUILD_PLAN.md`](docs/SOTERIA_FORGE_REBUILD_PLAN.md).

## Architecture

```
Mobile app (React Native + Expo)  ──GraphQL(AppSync)──►  AWS backend (Amplify Gen 2)
  • Cognito auth (custom:tenantId)                          • Cognito (single pool, Lite)
  • WatermelonDB offline store                              • AppSync + DynamoDB (single-table)
  • react-native-video v7           ──signed playback──►    • Lambda (tenant authorizer, logic)
  • append-only, idempotent sync                            • S3 + CloudFront
                                                            ▲
Admin console (Vue, kept + repointed) ──GraphQL(same API)──┘

Video bytes: Cloudflare Stream (MP4 download endpoint powers offline). DynamoDB stores metadata only.
```

## Monorepo layout (Turborepo)

| Path | What | Stack | State |
|------|------|-------|-------|
| `apps/mobile/` | Learner app | React Native + Expo (custom dev client) | **NEW** |
| `apps/console/` | Admin / superadmin console | Vue 3 + Vite | **KEPT** (repointed in Phase 6) |
| `packages/shared/` | Domain types, xAPI schemas, single-table keys, tenant guard | TypeScript | **EXPANDED** |
| `packages/ui/` | Design tokens (Ink/Bone/Cobalt) | TypeScript + CSS | **NEW** |
| `backend/` | Amplify Gen 2 definition (`auth/ data/ storage/ functions/`) | TypeScript (CDK) | **NEW** |
| `docs/` | Rebuild plan, swarm guide, ADRs | — | — |
| `.claude/` | Agent-swarm definitions + guardrail hooks | — | — |

**Retired** (preserved in git history, not carried forward): `apps/lms` (Vue web LMS → replaced by
the mobile app), `apps/api` (Vercel/Express/Mongo API → replaced by `backend/`), MongoDB, and the
Vercel API hosting config.

## Multi-tenancy & the #1 invariant

Single Cognito pool with an immutable `custom:tenantId` attribute; groups `worker`, `supervisor`,
`tenant-admin`, `super-admin`. Data is single-table with `PK = TENANT#<tenantId>`. **Tenant
isolation is non-negotiable**: a worker/supervisor/tenant-admin can never read or write another
tenant's data, enforced at the row level by AppSync dynamic-group authorization keyed on the
verified tenant claim (see [`backend/data/tenant-isolation.md`](backend/data/tenant-isolation.md)
and [`CLAUDE.md`](CLAUDE.md)). Every phase is gated on this invariant still holding.

## Offline (the hard part)

No Amplify DataStore in Gen 2 — offline is assembled from three parts: **WatermelonDB** (local
SQLite), **NetInfo** (connectivity), and an **event-sourced sync queue** of xAPI completion
statements. Statements are **append-only** and **idempotent by client-generated UUID**, so there
are no merge conflicts to resolve. See [`docs/adr/0002-offline-event-sourcing.md`](docs/adr/0002-offline-event-sourcing.md).

## Working in this repo

```bash
# Type-check / build / test everything through Turborepo (build shared + ui first).
npm run build          # turbo run build
npm run typecheck      # turbo run typecheck
npm run test           # turbo run test

# The pure-TypeScript packages compile and test standalone today:
npm run build --workspace @soteria-forge/shared && npm run test --workspace @soteria-forge/shared
npm run build --workspace @soteria-forge/ui
```

> `package-lock.json` was removed during the restructure (it pinned the retired packages); it
> regenerates on the next `npm install`. The RN/Amplify workspaces are source-only until their
> toolchains are installed and provisioned.

## Documentation

- [`docs/SOTERIA_FORGE_REBUILD_PLAN.md`](docs/SOTERIA_FORGE_REBUILD_PLAN.md) — the phased plan.
- [`docs/CLAUDE_SWARM.md`](docs/CLAUDE_SWARM.md) — how the agent swarm builds this.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`CLAUDE.md`](CLAUDE.md) — the shared contract every package agrees on.
