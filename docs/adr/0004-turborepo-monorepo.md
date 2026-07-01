# ADR-0004: Turborepo over plain npm workspaces

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform
- **Related:** [ADR-0001](./0001-backend-amplify-gen2.md), [ADR-0003](./0003-single-pool-multitenancy.md)

## Context

The rebuild changes the shape of the repo, not just its contents. The old
template was three Vercel apps (`apps/lms`, `apps/console`), an Express API
(`api/`), and `packages/shared`, wired with plain npm workspaces. The AWS-era
layout is:

```
apps/mobile/      React Native + Expo learner app   (NEW)
apps/console/     Vue admin                          (KEPT — must not break)
packages/shared/  domain types, xAPI schemas, key + tenant helpers
packages/ui/      design tokens                      (NEW)
backend/          Amplify Gen 2 backend definition   (NEW)
docs/  .claude/
```

Two things are retired and two are added. The old **`apps/lms`** learner app is
replaced by **`apps/mobile`**, and the old **`api/`** (Express + MongoDB) is
replaced by the Amplify Gen 2 **`backend/`** ([ADR-0001](./0001-backend-amplify-gen2.md)).
The Vue **console is kept** and must not regress. `packages/ui` (design tokens)
is added and shared with mobile.

The workspaces now span very different toolchains — a Vue/Vite web app, an
Expo/Metro native app, a TypeScript Amplify backend, and two libraries — but they
**must share one contract**: `packages/shared` defines the domain types, the
single-table key builders (`keys.ts`), the tenant guard (`tenant.ts`), the xAPI
schema (`xapi.ts`), and roles (`roles.ts`). If mobile, console, and backend
don't agree on those, the tenant-isolation invariant ([ADR-0003](./0003-single-pool-multitenancy.md))
can't hold across the system.

The question: keep coordinating these with plain npm workspaces, or adopt a
build orchestrator (Turborepo)?

## Decision

**We use Turborepo over the monorepo** (plain npm workspaces still provide the
package linking underneath; Turborepo adds the task graph on top).

- **Retire** `apps/lms` and the old `api/`.
- **Keep** `apps/console` (Vue admin) — it must continue to build and run.
- **Add** `apps/mobile`, `backend`, and `packages/ui`.
- **`packages/shared` is the single source of truth** for domain types, xAPI
  schemas, and the single-table key + tenant helpers, consumed by every app and
  the backend.
- Turborepo's pipeline expresses the real dependency edges — e.g. `shared` and
  `ui` must build before `mobile` or `console` can typecheck against their
  emitted `dist/` type declarations — and caches task results so unaffected
  workspaces are skipped.

Root wiring (root `package.json`, `turbo.json`, root `README`) is owned
elsewhere and is out of scope for the subtrees this ADR governs.

## Alternatives considered

- **Plain npm workspaces only (status quo) — rejected.** Workspaces link
  packages but have **no task graph and no caching**. Build ordering (shared/ui
  before consumers) has to be hand-sequenced in scripts, and every CI run rebuilds
  everything. As the repo grew from "web apps + one lib" to "web + native +
  backend + two libs," that manual coordination became the bottleneck Turborepo
  removes.
- **Nx — rejected.** More capable, but heavier: generators, plugins, and an
  opinionated project model that is more than a small template needs. Turborepo's
  thin task-runner-over-workspaces model is a better fit and a smaller thing to
  learn and maintain.
- **Splitting into multiple repos (polyrepo) — rejected.** Separate repos for
  mobile, console, backend, and shared would fracture the **shared contract**
  that makes tenant isolation coherent. Cross-cutting changes (a new field on a
  model, a change to the key design) would become multi-repo, multi-PR
  coordination. One repo keeps `packages/shared` atomically consistent with its
  consumers.

## Consequences

**Easier**

- One `packages/shared` change lands atomically with every consumer in a single
  PR, keeping the domain/key/tenant/xAPI contract consistent across mobile,
  console, and backend.
- Turborepo caches and prunes the task graph, so touching the console doesn't
  rebuild the backend or mobile, and CI only redoes affected work.
- Correct build ordering (shared/ui → apps) is declared once in the pipeline
  rather than re-encoded in ad-hoc scripts.

**Harder / ongoing cost**

- Turborepo is another tool in the chain, with its own config and cache
  semantics to understand; a mis-declared pipeline input can produce stale-cache
  surprises.
- Wildly different toolchains (Vite, Metro/Expo, Amplify) share one root; version
  and peer-dependency management across them needs care.
- **Retiring `apps/lms` and `api/` is a migration, not just a delete.** Behavior
  those provided (learner delivery, tenancy, completions) must be fully covered
  by `apps/mobile` + `backend`, and the **kept console must not break** — a
  standing regression constraint for anything touching shared packages.
- Contributors must learn the workspace boundaries so changes land in the right
  subtree and honor the ownership split (root wiring is owned separately).
