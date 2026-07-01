# Security review — Supabase backend (tenant isolation)

**Date:** 2026-07-01 · **Target:** the LIVE Supabase project `bgnadngztngkwzneknhd` and the repo
(`supabase/migrations/*`, `apps/mobile`, `apps/console`). **Method:** adversarial **live probing** —
impersonating each role's JWT against the real database to attempt actual attacks (all in rolled-back
transactions) — plus Supabase security advisors and an independent read-only code review.

This review supersedes the AWS/Amplify-era review in git history (that backend was retired; isolation
is now enforced by **Postgres RLS**, not AppSync).

## Verdict

Tenant isolation **holds** after remediation. Live probing found **one critical** privilege-escalation
bug (profile `role` self-promotion); it was fixed (migration `09`) and re-verified closed. An
independent code review then surfaced **write-side integrity** gaps a read-focused probe missed — a
privileged caller could create rows referencing another tenant's entities (Finding 1, confirmed live,
**fixed** migration `10`) and the invite email-match is only a true second factor with email
confirmation enabled (Finding 3, hardened + `config.toml` updated). All confirmed findings are fixed
and re-verified. Residual items below are advisory (an Auth dashboard toggle, a pre-existing function,
and a documented compliance-integrity property of self-reported completion).

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

## Independent code review — additional findings

A read-only reviewer audited all migrations, the seed, and the mobile/console clients (a fresh-eyes
pass, since the live probing above was run by the same agent that built the system).

- **Finding 1 — MEDIUM (FIXED, migration `10`): cross-tenant FK references on INSERT.** The
  `enrollments` / `modules` / `lessons` / `video_assets` insert policies gated on **role only**; the
  stamp trigger set `tenant_id` but nothing validated that the referenced `course_id` / `module_id` /
  `user_id` belonged to the caller's tenant. **Confirmed live:** an ATL admin who knows a demo-tenant
  user's UUID could enroll them into an ATL course. (Discovery-gated — RLS hides other tenants' UUIDs
  — so not a read leak, but a real write-side invariant break.) **Fix:** each insert policy now
  requires the referenced parent/subject to be in the row's own (stamped) tenant via `EXISTS` checks.
  Re-verified: cross-tenant enroll → blocked `42501`; same-tenant author+enroll → still allowed.
- **Finding 2 — MEDIUM (DOCUMENTED, by design): self-reported completion.** A worker can insert
  `completed` statements for the (real) lessons of a course they are **enrolled in**, driving their own
  enrollment to 100% without the system proving they consumed the content. This is inherent to
  client-authored xAPI (the device self-reports completion — the whole point of offline-first). The
  progress trigger already only updates an **existing** enrollment (a non-enrolled worker cannot create
  a phantom completion), so the boundary holds; what's unproven is "did they really learn it." For
  high-stakes compliance, gate completion on **assessment results** (quiz passing scores / proctoring)
  at the content layer — a product feature, not an RLS fix. Recorded as a known limitation.
- **Finding 3 — MEDIUM (FIXED/hardened): invite email-match depends on email confirmation.** With
  `enable_confirmations = false`, a signup's email is attacker-chosen, so `redeem_invitation`'s
  email-match isn't a real second factor — the token is the sole gate. **Fix:** `config.toml` now sets
  `enable_confirmations = true` (the live project's dashboard must be toggled to match); the default
  invite lifetime is shortened to 7 days; `redeem_invitation` now denies a null/empty session email
  instead of coalescing to `''`. Invites are already single-use (status flips to `accepted`).
- **Finding 5 — INFO (WON'T FIX, with reason): no `FORCE ROW LEVEL SECURITY`.** Deliberately not
  applied: `FORCE RLS` subjects the table **owner** to RLS, which would break the `SECURITY DEFINER`
  tenant helpers (`current_tenant_id()` reads `profiles` precisely by bypassing RLS as the owner).
  Not exploitable by `anon`/`authenticated` (API callers are never the owner), so no action — matching
  the reviewer's own "no action for this threat model" note.
- **Findings 4 & 6 — LOW/INFO (noted):** `redeem_invitation`'s idempotent return is a minor
  response-differential oracle (not a boundary break); the seeded demo password + the super-admin's
  `demo` home tenant are intentional dev artifacts (never run the seed against production).

The reviewer confirmed as **sound**: no client sources tenant/role from input for authz; no committed
secrets; offline sync stays append-only + idempotent; `completion_statements` immutable;
`provision_tenant` super-admin-gated; the migration-09 role guard intact.

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

1. Enable **email confirmation** on the live project (Auth → Providers → Email → *Confirm email*) so
   `config.toml`'s `enable_confirmations = true` is actually in effect (Finding 3).
2. Enable **leaked-password protection** (Auth dashboard).
3. Review the pre-existing **`rls_auto_enable()`** function (unknown provenance; anon-executable).
4. For high-stakes/regulatory course completion, gate on **assessment results** at the content layer
   (quiz passing scores), since self-reported xAPI statements alone can't prove a worker did the work
   (Finding 2).
3. Consider giving `super-admin` a dedicated platform tenant rather than a home tenant of `demo`, so a
   demo-tenant member's roster view doesn't list the super-admin (cosmetic, not a leak).
4. When enterprise SSO lands, re-run this probe matrix against federated identities.

## Definition of done (per the rebuild plan)

- [x] Tenant isolation invariant holds for every surface (proven live, post-fix).
- [x] The critical finding is fixed and re-verified; fix mirrored as migration `09`.
- [x] No secrets committed; append-only + idempotent sync intact.
- [x] Advisors triaged; residuals recorded.
