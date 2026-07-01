# Soteria Forge

Mobile-first (iOS + Android), **offline-capable**, **multi-tenant** training platform with heavy
video, single sign-on, and headroom for 64,000 workers. Anchor use case: the ATL "Curb to Cabin"
workforce training program.

> **Status — Supabase backend LIVE; clients defined-as-code.**
> The backend pivoted **AWS/Amplify → Supabase** ([ADR-0007](docs/adr/0007-supabase-backend.md)):
> a **live Supabase project** (ref `bgnadngztngkwzneknhd`) is provisioned, migrated, and seeded,
> and is mirrored as code in [`supabase/`](supabase/). The rest of the repo is the *code-first*
> foundation of the rebuild: the Turborepo layout, the shared domain model, the Expo mobile app +
> offline layer, and the agent-swarm scaffolding. The **client apps have not been `npm install`ed,
> built native, or deployed** — no Cloudflare/Expo resources exist yet; wiring the clients to
> supabase-js and EAS builds are the next steps. The retired Amplify Gen 2 definition (`backend/`)
> has been deleted (preserved in git history).
> See [`docs/SOTERIA_FORGE_REBUILD_PLAN.md`](docs/SOTERIA_FORGE_REBUILD_PLAN.md).

## Architecture

```
Mobile app (React Native + Expo)  ──supabase-js──►  Supabase backend
  • Supabase Auth (email/password)                     • Postgres + Row-Level Security
  • WatermelonDB offline store                         • Auth (users ⇄ profiles: tenant_id + role)
  • react-native-video v7        ──signed playback──►  • Storage (tenant-media, signed URLs)
  • append-only, idempotent sync                       ▲
                                                       │
Admin console (Vue, kept + repointed) ──supabase-js───┘

Tenant isolation is enforced in the database by RLS (current_tenant_id()) — not app code.
Video bytes: Cloudflare Stream (MP4 download endpoint powers offline). The DB stores metadata only.
```

## Monorepo layout (Turborepo)

| Path | What | Stack | State |
|------|------|-------|-------|
| `apps/mobile/` | Learner app | React Native + Expo (custom dev client), supabase-js | **NEW** |
| `apps/console/` | Admin / superadmin console | Vue 3 + Vite, supabase-js | **KEPT** (repointed) |
| `packages/shared/` | Domain types, xAPI schemas, Supabase DB types, tenant guard | TypeScript | **EXPANDED** |
| `packages/ui/` | Soteria Forge React Native UI kit (ember/spark) | TypeScript + React Native | **NEW** |
| `supabase/` | Supabase-as-code: schema, RLS, storage, seed (mirrors the live project) | SQL + TOML | **LIVE** |
| `docs/` | Rebuild plan, swarm guide, ADRs | — | — |
| `.claude/` | Agent-swarm definitions + guardrail hooks | — | — |

**Retired** (preserved in git history, not carried forward): `apps/lms` (Vue web LMS → replaced by
the mobile app), `apps/api` (Vercel/Express/Mongo API → replaced by Supabase), `backend/` (the
undeployed Amplify Gen 2 definition → replaced by `supabase/`), MongoDB, and the Vercel API hosting
config.

## Multi-tenancy & the #1 invariant

Supabase Auth with a 1:1 `profiles` row per user carrying `tenant_id` and `role` (`worker`,
`supervisor`, `tenant-admin`, `super-admin`). **Tenant isolation is non-negotiable**: a
worker/supervisor/tenant-admin can never read or write another tenant's data, enforced **in the
database by Postgres Row-Level Security** keyed on `public.current_tenant_id()` (which reads the
caller's profile from the verified session JWT). New rows are tenant-stamped by a `BEFORE INSERT`
trigger, so a client cannot choose another tenant's id — and clients must never send a `tenant_id`
for authorization. See [`supabase/README.md`](supabase/README.md),
[ADR-0007](docs/adr/0007-supabase-backend.md), and [`CLAUDE.md`](CLAUDE.md). Every phase is gated on
this invariant still holding.

## Offline (the hard part)

Offline is assembled from three parts: **WatermelonDB** (local SQLite), **NetInfo** (connectivity),
and an **event-sourced sync queue** of xAPI completion statements. Statements are **append-only** and
**idempotent by client-generated UUID**, so there are no merge conflicts to resolve; against Supabase
the drain is an `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` into
`completion_statements`. See [`docs/adr/0002-offline-event-sourcing.md`](docs/adr/0002-offline-event-sourcing.md).

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
> regenerates on the next `npm install`. The RN client workspaces are source-only until their
> toolchains are installed. The Supabase backend is already live and mirrored as code in
> [`supabase/`](supabase/) — see its README for the CLI workflow (link / `db push` / `gen types`).

## Documentation

- [`docs/SOTERIA_FORGE_REBUILD_PLAN.md`](docs/SOTERIA_FORGE_REBUILD_PLAN.md) — the phased plan.
- [`docs/CLAUDE_SWARM.md`](docs/CLAUDE_SWARM.md) — how the agent swarm builds this.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`CLAUDE.md`](CLAUDE.md) — the shared contract every package agrees on.
