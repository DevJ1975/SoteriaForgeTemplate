# Security review — Supabase backend (tenant isolation)

**Date:** 2026-07-01 · **Target:** the LIVE Supabase project `bgnadngztngkwzneknhd` and the repo
(`supabase/migrations/*`, `apps/mobile`, `apps/console`). **Method:** adversarial **live probing** —
impersonating each role's JWT against the real database to attempt actual attacks (all in rolled-back
transactions) — plus Supabase security advisors and an independent read-only code review.

This review supersedes the AWS/Amplify-era review in git history (that backend was retired; isolation
is now enforced by **Postgres RLS**, not AppSync).

## Verdict

Tenant isolation **holds** after remediation. Live probing found **one critical** privilege-escalation
bug (profile `role` self-promotion); it was fixed (migration `09`) and re-verified closed. Every other
attack attempted was correctly blocked. Residual items below are advisory (an Auth config toggle and a
pre-existing function that predates this work).

## Finding — CRITICAL (FIXED): profile role self-escalation

**Exploit:** the `profiles` UPDATE policy's `WITH CHECK` pinned only `tenant_id`, not `role`. Any caller
able to update a profile row could rewrite the `role` column freely:
- a **worker** could `UPDATE profiles SET role='super-admin' WHERE id = auth.uid()` → become a global
  cross-tenant super-admin;
- a **tenant-admin** could set their own — or any same-tenant member's — role to `super-admin`.

Both were **confirmed live** (each returned SUCCEEDED before the fix).

**Fix (migration `09_guard_profile_role_escalation.sql`):** a `BEFORE UPDATE` trigger
(`guard_profile_role`) that gates the `role` column — service_role/seed (no `auth.uid()`) is trusted;
super-admin may grant any role; tenant-admin may set worker/supervisor/tenant-admin (RLS keeps it
in-tenant) but **never** super-admin; workers/supervisors may not change any role. RLS still governs
*which* rows are updatable; this governs *what* the role may become.

**Re-verified live (post-fix):** worker self-escalate → blocked `42501`; tenant-admin self-escalate →
blocked; tenant-admin mint-super-admin-on-worker → blocked. Not over-blocked: a worker editing their own
`full_name` and a tenant-admin promoting a worker to `supervisor` both still succeed.

## Probe matrix (live, on `bgnadngztngkwzneknhd`)

| Attack | Result |
|---|---|
| Worker / tenant-admin set own `role` = super-admin | 🔴 VULN → **FIXED**, re-verified blocked `42501` |
| Tenant-admin mint super-admin on another member | 🔴 VULN → **FIXED**, blocked `42501` |
| Cross-tenant READ (demo worker → ATL courses/modules/lessons/enrollments/invitations) | ✅ 0 rows |
| Worker changes own `tenant_id` | ✅ blocked `42501` (WITH CHECK) |
| Tenant-admin writes another tenant's profile | ✅ 0 rows (RLS-scoped) |
| Worker authors a course / issues an invitation (even with explicit tenant_id) | ✅ blocked `42501` |
| `completion_statements` UPDATE / DELETE (append-only) | ✅ no policy → immutable |
| Worker self-marks own enrollment complete | ✅ blocked (RLS: writes are supervisor/admin only) |
| `provision_tenant()` by a non-super-admin | ✅ blocked `42501` (internal guard) |
| `redeem_invitation()` with an invite issued to a different email | ✅ blocked (email must match verified `auth.users.email`) |
| Re-tenant an already-provisioned user via redeem | ✅ idempotent no-op (returns existing profile) |

## Supabase security advisors — disposition

- `current_tenant_id` / `current_user_role` (authenticated-executable, `0029`): **accepted.** They return
  only the *caller's own* tenant/role and are required inside RLS policies; moving them to a private
  schema would clear the lint but adds no real protection. No `anon` access.
- `provision_tenant` / `redeem_invitation` (authenticated-executable, `0029`): **accepted by design.**
  These are RPCs meant to be called by signed-in users; their **internal** authorization (super-admin
  check; token + verified-email match) is the gate — both proven live. No `anon` access.
- `guard_profile_role` / `stamp_*` / `sync_enrollment_progress`: trigger-only, `revoke`d from
  public/anon/authenticated → **not** on the RPC surface. Clean.
- **`rls_auto_enable()`** (anon + authenticated executable): **pre-existing** in the project — NOT created
  by this work. Flagged for the owner to review/revoke.
- **Leaked-password protection disabled** (`auth_leaked_password_protection`): recommend enabling
  HaveIBeenPwned checks in the Auth settings (dashboard toggle; not a code change).

## Client posture (mobile + console)

- No client sends or trusts a client-chosen `tenant_id`/`role` for authorization: inserts use a
  `ServerStamped<Omit<T,'tenant_id'>>`-style shape and rely on the BEFORE INSERT stamp + RLS; the
  learner app derives `tenantId`/`userId` only from the verified session (`useAuth`).
- No secrets committed — only the public project URL and the client-safe **publishable/anon** key in
  `.env.example`; the service-role key is never in source.
- Offline sync (`apps/mobile/src/offline`) is append-only and idempotent by the client UUID
  (`upsert(onConflict:'id', ignoreDuplicates:true)`); statements carry `context.{course_id,lesson_id}`
  read by the server progress trigger.

## Recommendations / residuals

1. Enable **leaked-password protection** (Auth dashboard).
2. Review the pre-existing **`rls_auto_enable()`** function (unknown provenance; anon-executable).
3. Consider giving `super-admin` a dedicated platform tenant rather than a home tenant of `demo`, so a
   demo-tenant member's roster view doesn't list the super-admin (cosmetic, not a leak).
4. When enterprise SSO lands, re-run this probe matrix against federated identities.

## Definition of done (per the rebuild plan)

- [x] Tenant isolation invariant holds for every surface (proven live, post-fix).
- [x] The critical finding is fixed and re-verified; fix mirrored as migration `09`.
- [x] No secrets committed; append-only + idempotent sync intact.
- [x] Advisors triaged; residuals recorded.
