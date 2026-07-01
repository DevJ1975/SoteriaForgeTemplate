# `@soteria-forge/shared` — the domain contract

This package is the **single source of truth** for the domain model, the single-table key
design, the tenant-isolation guard, the xAPI statement contract, and the role bridge. Mobile,
console, backend, video, and offline-sync all depend on what this package exports — so treat
every export as a **public contract**. Additive changes are cheap; breaking changes ripple
everywhere and must be called out.

Owned primarily by the **api-data** agent. See root `../../CLAUDE.md` for the shared contract.

## Modules

| File | Owns |
|------|------|
| `src/domain.ts` | Domain records/DTOs (Course/Module/Lesson/User/Enrollment, `UserRole`). |
| `src/keys.ts` | Single-table PK/SK builders + `skPrefixes` + `parseSk`. **The only way keys are made.** |
| `src/tenant.ts` | `isSameTenant` / `assertTenantMatch` / `TenantIsolationError`. **The isolation guard.** |
| `src/xapi.ts` | xAPI statement types + `generateStatementId` / `createCompletionStatement`. |
| `src/roles.ts` | Cognito-group ⇄ legacy-`UserRole` bridge. |
| `src/index.ts` | The public barrel — everything consumers import. |
| `src/__tests__/` | `node --test` unit tests (run via `npm run test`). |

## Key design (do not drift)

- `PK = TENANT#<tenantId>`; SK vocabulary and GSIs are documented in `keys.ts` and the root
  `CLAUDE.md`. Every builder round-trips with `parseSk` — if you add an entity, add its builder,
  its `skPrefixes` entry, and its `parseSk` case **together**, with a round-trip test.
- `assertSegment` rejects empty ids and any id containing the `#` delimiter. Never relax this: a
  raw `#` inside an id would corrupt parsing and could forge a key that crosses an entity
  boundary. Fail loud.

## Tenant guard (do not weaken)

`isSameTenant`/`assertTenantMatch` use **strict verbatim equality**, return/deny on any
empty/nullish input, and contain **no normalization, no wildcard, no super-admin bypass**.
`claimTenantId` is ALWAYS the verified token claim; `targetTenantId` is derived from the key or
the loaded record — never from request input. The Lambda authorizer
(`backend/functions/tenant-authorizer/handler.ts`) inlines a byte-for-byte-equivalent mirror; if
you change the guard here, the mirror MUST change identically — flag it to security-reviewer.

## xAPI (append-only, idempotent)

- `id` is a **client-generated UUID** and the idempotency key — never the timestamp or a payload
  hash (`statementIdempotencyKey` returns the id to make that unspellable).
- `generateStatementId` prefers the platform crypto RNG and **throws** rather than emit a weak,
  collision-prone id. `createCompletionStatement` validates a supplied `id` as a UUID and fails
  fast on a malformed one.
- Never add a mutation, merge, or conflict-resolution path for statements. `createXapiStatement`
  is retained only for legacy callers; new code uses `createCompletionStatement`.

## Roles

Cognito groups (`worker/supervisor/tenant-admin/super-admin`) are the edge source of truth;
`UserRole` (`learner/manager/admin/superadmin`) is the stored vocabulary. `GROUP_TO_USER_ROLE` /
`USER_ROLE_TO_GROUP` are the canonical bridge. `normalizeGroups` drops unknown group strings —
never trust an unrecognized group. `hasRequiredGroup`/`hasMinimumGroup` are tier checks ONLY;
they say nothing about WHICH tenant — that is always `assertTenantMatch`'s job.

## Local workflow

```bash
npm run build      --workspace @soteria-forge/shared   # tsc → dist/ (consumers need these decls)
npm run typecheck  --workspace @soteria-forge/shared
npm run test       --workspace @soteria-forge/shared   # compiles then `node --test dist/**/*.test.js`
```

Build this package **before** type-checking any consumer (mobile/console/backend) — their
type-checks read this package's `dist/` declarations. Ship tests for every new key builder,
parse round-trip, tenant-guard edge case, and UUID validation. No secrets in fixtures — use
placeholder ids.
