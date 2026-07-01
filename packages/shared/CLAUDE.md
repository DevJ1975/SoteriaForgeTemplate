# `@soteria-forge/shared` — the domain contract

This package is the **single source of truth** for the domain model, the tenant-isolation guard,
the xAPI statement contract, the role bridge, and the Supabase DB types (under the `./supabase`
subpath). Mobile, console, video, and offline-sync all depend on what this package exports — so
treat every export as a **public contract**. Additive changes are cheap; breaking changes ripple
everywhere and must be called out.

Owned primarily by the **api-data** agent. See root `../../CLAUDE.md` for the shared contract.

## Modules

| File | Owns |
|------|------|
| `src/domain.ts` | Domain records/DTOs (Course/Module/Lesson/User/Enrollment, `UserRole`). |
| `src/tenant.ts` | `isSameTenant` / `assertTenantMatch` / `TenantIsolationError`. **The isolation guard.** |
| `src/xapi.ts` | xAPI statement types + `generateStatementId` / `createCompletionStatement`. |
| `src/roles.ts` | Role-group ⇄ legacy-`UserRole` bridge. |
| `src/supabase/` | Generated Supabase DB types + row/insert/update aliases (`./supabase` subpath). |
| `src/index.ts` | The public barrel — everything consumers import. |
| `src/__tests__/` | `node --test` unit tests (run via `npm run test`). |

> **Pruned (ADR-0007):** `src/keys.ts` (the AWS single-table PK/SK builders) and the Cognito
> `adminGroup` stamp (`stampTenantOwnership` et al. in `tenant.ts`) were superseded by Postgres RLS
> and **removed** once no client referenced them. Do not reintroduce hand-rolled keys — tenant
> scoping and insert-stamping are the database's job now.

## Tenant guard (do not weaken)

`isSameTenant`/`assertTenantMatch` use **strict verbatim equality**, return/deny on any
empty/nullish input, and contain **no normalization, no wildcard, no super-admin bypass**.
`claimTenantId` is ALWAYS the verified session tenant (`profiles.tenant_id`); `targetTenantId` is
derived from the loaded record — never from request input. **Primary isolation is Postgres RLS**
(see root `CLAUDE.md`); this guard is a retained defensive utility, not the enforcement point. Any
change to it still goes through security-reviewer.

## xAPI (append-only, idempotent)

- `id` is a **client-generated UUID** and the idempotency key — never the timestamp or a payload
  hash (`statementIdempotencyKey` returns the id to make that unspellable).
- `generateStatementId` prefers the platform crypto RNG and **throws** rather than emit a weak,
  collision-prone id. `createCompletionStatement` validates a supplied `id` as a UUID and fails
  fast on a malformed one.
- Never add a mutation, merge, or conflict-resolution path for statements. `createXapiStatement`
  is retained only for legacy callers; new code uses `createCompletionStatement`.

## Roles

The canonical roles (`worker/supervisor/tenant-admin/super-admin`) are stored on the `profiles`
row and are the source of truth; `UserRole` (`learner/manager/admin/superadmin`) is the legacy
stored vocabulary. `GROUP_TO_USER_ROLE` / `USER_ROLE_TO_GROUP` are the canonical bridge.
`normalizeGroups` drops unknown group strings —
never trust an unrecognized group. `hasRequiredGroup`/`hasMinimumGroup` are tier checks ONLY;
they say nothing about WHICH tenant — that is always `assertTenantMatch`'s job.

## Local workflow

```bash
npm run build      --workspace @soteria-forge/shared   # tsc → dist/ (consumers need these decls)
npm run typecheck  --workspace @soteria-forge/shared
npm run test       --workspace @soteria-forge/shared   # compiles then `node --test dist/**/*.test.js`
```

Build this package **before** type-checking any consumer (mobile/console) — their type-checks read
this package's `dist/` declarations. Ship tests for every new domain helper, tenant-guard edge
case, and UUID validation. No secrets in fixtures — use placeholder ids.
