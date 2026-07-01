# `@soteria-forge/console` — Vue admin console conventions

The superadmin / course-creator control plane: Vue 3 + Vite. This app is **KEPT** through the
Supabase re-platform. Prime directive: **it must not break.** Cross-cutting changes (shared types,
auth model, data source) must land here in a way that keeps it building and coherent.

Owned by the **console-web** agent. See root `../../CLAUDE.md` for the shared contract.

## Layout

```
index.html               Vite entry
vite.config.ts           dev on :5181, preview on :4181 (host 0.0.0.0)
src/
  main.ts                createApp(App) + imports theme/tokens.css, soteria-forge.css, styles.css
  App.vue                root component
  services/api.ts        the data/service layer (repointed as the backend migrates)
  theme/                 tokens.css (--sf-* custom properties) + soteria-forge.css
  styles.css, assets/    global styles + assets
vercel.json              SPA rewrite (all routes → /index.html)
```

## Design tokens (canonical + shared)

`src/theme/tokens.css` holds the `--sf-*` custom properties and is the CANONICAL scale, mirrored
1:1 by `packages/ui` (`tokens.ts` + `tokens.css`). Ink/Bone/Cobalt: ink `#0E1A2E`, blue
`#3DA9FC`, orange `#FF6B1F`, paper `#F5F4EF`. All CSS references the `--sf-*` vars — never fork a
brand value into a component or a second stylesheet. If a token changes, `apps/console/src/theme`
and `packages/ui` move together.

## Shared contract

- Import domain types and roles from `@soteria-forge/shared` — never redeclare them locally. When
  `api-data` evolves the contract, repoint `src/services/api.ts` to match (additively where
  possible) and keep `vue-tsc` green.
- Roles bridge: the console speaks legacy `UserRole` (`learner/manager/admin/superadmin`); the
  backend stores the canonical roles (`worker/supervisor/tenant-admin/super-admin`) on the
  `profiles` row. Use `roles.ts` (`GROUP_TO_USER_ROLE` / `USER_ROLE_TO_GROUP`) — never hardcode a
  mapping.

## Tenant isolation still holds — enforced by Postgres RLS

Reads/writes are scoped to the caller's own tenant by `public.current_tenant_id()`; the console
sends **no** `tenant_id` for authorization. `super-admin` is the one cross-tenant role, expressed
by RLS policy — the console never assumes a bypass. Inserts omit `tenant_id` (the `ServerStamped<>`
pattern) so the stamp trigger owns it; the console never sends a tenantId sourced from anything but
the authenticated session.

## Repoint-without-breaking discipline

The console's data source is now **Supabase** (`@supabase/supabase-js`, RLS-scoped) — the legacy
Express/Mongo and interim AWS/Amplify layers are retired. Keep `src/services/api.ts`'s PUBLIC shape
stable when it is repointed or extended so views don't churn; prefer small typed adapters over
sweeping rewrites. A green console after every change beats a clever refactor that redlines
type-check.

## Local workflow

```bash
npm run dev        --workspace @soteria-forge/console   # vite dev  (http://localhost:5181)
npm run typecheck  --workspace @soteria-forge/console   # vue-tsc --noEmit
npm run build      --workspace @soteria-forge/console   # vue-tsc --noEmit && vite build
```

Build `@soteria-forge/shared` (and `@soteria-forge/ui`) first so their `dist/` declarations
exist. Do NOT `npm install` or deploy. No secrets — config via `.env.example` placeholders. Fix
console breakage IN `apps/console`; don't edit other packages or root wiring to paper over it —
raise a real contract gap to the orchestrator / api-data. Changes to how the console authorizes
or scopes tenant data go through **security-reviewer**.
