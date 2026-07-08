-- Migration 14 — Due-date transitions: activate the dormant 'overdue' pipeline and
-- land the scheduled-job primitive the recert / compliance / notification phases reuse.
-- (Audit gap #2.)
--
-- WHY. enrollments already carries due_at (nullable) and a status CHECK that includes
-- 'overdue' (migration 01), but NOTHING ever moves an assignment into that state — a
-- past-due training silently stays 'assigned'/'in-progress' forever, so no report,
-- badge, or reminder can distinguish on-time from overdue work. This migration adds a
-- system maintenance job that performs that transition on a schedule, and establishes
-- the pg_cron pattern (a stable, idempotently-scheduled job) that later phases
-- (cert expiry #3, notifications) will copy.
--
-- OPERATOR NOTE (mirrors the enable_confirmations precedent in config.toml). pg_cron is
-- a Postgres extension that must be available/enabled at the project level. On the LIVE
-- Supabase project the operator may first need to enable pg_cron via the dashboard
-- (Database → Extensions → pg_cron) before `supabase db push` runs this migration;
-- locally `create extension if not exists pg_cron` is sufficient. cron jobs run in the
-- database's own `postgres` role context, NOT as any end user.

-- ── 1. Ensure pg_cron is available ───────────────────────────────────────────
create extension if not exists pg_cron;

-- ── 2. The overdue sweep (system maintenance job) ────────────────────────────
-- Tenant-AGNOSTIC by design: this is not a user-facing query but a maintenance sweep
-- run by cron across the whole database, so it deliberately does NOT filter by
-- current_tenant_id() (there is no session/JWT in a cron context — current_tenant_id()
-- would be NULL). It is SECURITY DEFINER with a pinned search_path and is executable
-- ONLY by the job scheduler (execute is revoked from public/anon/authenticated below),
-- so no end user can invoke it. Rows are still updated in place under their own
-- tenant_id — no cross-tenant data moves.
--
-- It flips assignments that are genuinely past due and not yet finished:
--   due_at is set AND due_at < now() AND status in ('assigned','in-progress')
--   AND progress < 100.
-- It NEVER writes status = 'completed', so it cannot mis-fire issue_certificate()
-- (migration 11), which only issues on a transition INTO 'completed'. The progress < 100
-- guard is belt-and-suspenders: an enrollment at 100% is on its way to 'completed' via
-- sync_enrollment_progress() and must not be re-labeled overdue.
--
-- It does NOT implement 'expired'. Expiry is a certificate-lifecycle concern (recert /
-- cert-expiry, audit gap #3, a later phase) with its own basis (cert expires_at, not
-- enrollment due_at); conflating the two here would be wrong. Left for that phase.
create or replace function public.transition_overdue_enrollments() returns void
  language sql security definer set search_path = public as $$
  update public.enrollments
     set status = 'overdue'
   where due_at is not null
     and due_at < now()
     and status in ('assigned','in-progress')
     and progress < 100;
$$;

revoke all on function public.transition_overdue_enrollments() from public, anon, authenticated;
comment on function public.transition_overdue_enrollments() is
  'System maintenance sweep (pg_cron): marks past-due, unfinished enrollments overdue. Tenant-agnostic; never sets completed; never fires cert issuance.';

-- ── 3. Schedule it hourly, idempotently ──────────────────────────────────────
-- Unschedule-if-exists then (re)schedule under a stable jobname, so re-running the
-- migration replaces the job cleanly instead of stacking duplicates. Hourly at minute 0
-- is fine granularity for a due-date rollover (overdue is a day-scale signal).
do $$
begin
  perform cron.unschedule('sf-overdue-enrollment-sweep')
    where exists (select 1 from cron.job where jobname = 'sf-overdue-enrollment-sweep');
  perform cron.schedule(
    'sf-overdue-enrollment-sweep',
    '0 * * * *',
    $job$ select public.transition_overdue_enrollments(); $job$
  );
end $$;
