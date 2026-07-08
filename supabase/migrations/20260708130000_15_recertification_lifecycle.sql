-- Migration 15 — Recertification lifecycle: certificates that EXPIRE, and a recert
-- loop that mints a fresh dated certificate each cycle. (Audit gap #3.)
--
-- WHY. Certificates (migration 11) were issued exactly ONCE per (user, course) and
-- lived forever: expires_at existed on the table but nothing ever set it, and a
-- unique(user_id, course_id) constraint plus `on conflict do nothing` made a second
-- issuance impossible. For regulated training that is wrong — most EHS/OSHA
-- qualifications (fall protection, respirator fit, forklift, first aid…) are valid
-- for a FIXED PERIOD and must be RE-EARNED. Without expiry, a worker certified once
-- reads as qualified indefinitely, which is a compliance defect, not a convenience.
--
-- DESIGN. A course declares how long its certificate is valid (courses.valid_for_days,
-- NULL = never expires). When an enrollment first reaches 'completed', issue_certificate()
-- stamps expires_at = now() + valid_for_days (or NULL). A daily scheduled sweep
-- (transition_expired_certifications) finds enrollments whose only certificate has
-- lapsed and flips them 'completed' -> 'expired', OPENING A FRESH CERTIFICATION CYCLE
-- (enrollments.cert_cycle_started_at := now(), progress := 0). The worker must then RE-COMPLETE
-- the course's required lessons — including its assessment — IN THE NEW CYCLE: the progress
-- engine (sync_enrollment_progress) counts only statements whose occurred_at is on/after
-- cert_cycle_started_at, so last cycle's (immutable, still-present) completions no longer count.
-- Once all required lessons are genuinely re-completed this cycle, progress >= 100 transitions
-- 'expired' -> 'completed', which RE-FIRES issue_certificate(); the old cert has expired so the
-- validity guard passes and a FRESH, newly-dated certificate is minted. A complete recert cycle
-- with ZERO mutation of the append-only completion_statements — the audit trail only ever grows,
-- and a renewed certificate always reflects a genuine new demonstration of mastery this cycle.
--
-- WHY THE CYCLE WINDOW (learning/compliance rigor). completion_statements is append-only and never
-- expires, so a worker's original completions live forever. Without a window, re-touching ANY one
-- lesson would recompute progress = 100 from stale history and renew a fall-protection/forklift cert
-- WITHOUT re-passing anything. cert_cycle_started_at scopes progress to the current period, closing
-- that hole while keeping every prior (expired) certificate as historical evidence.
--
-- INVARIANTS PRESERVED.
--   * completion_statements stays append-only (migration 12/13): nothing here touches it.
--   * certificates keep NO client insert/update/delete policy (migration 11): only the
--     SECURITY DEFINER trigger writes them; recert history accumulates as new rows.
--   * The sweep is tenant-AGNOSTIC and non-invokable by clients (execute revoked), exactly
--     like the overdue sweep (migration 14) — cron has no session/JWT, so current_tenant_id()
--     would be NULL; rows are still updated in place under their own tenant_id.
--
-- OPERATOR NOTE (mirrors migration 14). pg_cron must be available/enabled at the project
-- level. On the LIVE Supabase project the operator may need to enable pg_cron via the
-- dashboard (Database → Extensions → pg_cron) before `supabase db push` runs this
-- migration; locally `create extension if not exists pg_cron` is sufficient. Cron jobs run
-- in the database's own `postgres` role context, NOT as any end user.
--
-- OUT OF SCOPE (follow-up). Grace-period / renewal-window nuance (e.g. allowing recert to
-- START before expiry, or a soft "expiring soon" state distinct from hard 'expired') is a
-- notification/UX concern with its own basis; it is deliberately NOT implemented here.
-- Certificate revocation UX and expires_at back-dating for already-issued certs are also
-- follow-ups — this migration only forward-stamps newly issued certs.

-- ── 1. Per-course certificate validity window ────────────────────────────────
-- valid_for_days: NULL = certificate never expires (default, backward-compatible with
-- every course issued before this migration). A positive integer is the number of days a
-- freshly issued certificate remains valid. Guarded so a re-run is a no-op and the CHECK
-- is only added once.
alter table public.courses
  add column if not exists valid_for_days int;
comment on column public.courses.valid_for_days is
  'Certificate validity window in days. NULL = never expires. Drives certificates.expires_at at issuance and the recert sweep.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.courses'::regclass
       and conname  = 'courses_valid_for_days_positive'
  ) then
    alter table public.courses
      add constraint courses_valid_for_days_positive
      check (valid_for_days is null or valid_for_days > 0);
  end if;
end $$;

-- ── 1b. Certification-cycle window on enrollments ─────────────────────────────
-- cert_cycle_started_at marks when the CURRENT certification attempt began. Progress
-- (sync_enrollment_progress, replaced below) counts only completion_statements whose
-- occurred_at is on/after this instant, so a recert genuinely requires re-completing the
-- required lessons THIS cycle rather than inheriting last cycle's immutable history.
-- Backfill: existing enrollments get their created_at (their first/only cycle spans the whole
-- enrollment life, so every historical completion still counts — no regression). New rows
-- default now(); the recert sweep resets it to now() when a certification lapses.
alter table public.enrollments
  add column if not exists cert_cycle_started_at timestamptz;
update public.enrollments
   set cert_cycle_started_at = created_at
 where cert_cycle_started_at is null;
alter table public.enrollments
  alter column cert_cycle_started_at set default now();
alter table public.enrollments
  alter column cert_cycle_started_at set not null;
comment on column public.enrollments.cert_cycle_started_at is
  'Start of the current certification cycle. sync_enrollment_progress counts only statements occurring on/after it; the recert sweep resets it to now() on expiry so recertification requires genuine re-completion this cycle.';

-- ── 2. Relax certificate uniqueness so recert history can accumulate ──────────
-- Migration 11 declared unique(user_id, course_id): one certificate per user+course,
-- forever. Recertification produces a NEW dated certificate each cycle, so that
-- constraint is now wrong — it would block every re-issuance. Drop it (discovering its
-- actual name from pg_constraint rather than trusting a default name), and KEEP the
-- primary key (id) and the certificate_number unique constraint. Idempotency of the
-- CURRENT valid period is instead enforced in issue_certificate()'s validity guard
-- (below), not by a table constraint.
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.certificates'::regclass
     and con.contype  = 'u'
     and con.conkey = array[
       (select attnum from pg_attribute
         where attrelid = 'public.certificates'::regclass
           and attname = 'user_id' and not attisdropped),
       (select attnum from pg_attribute
         where attrelid = 'public.certificates'::regclass
           and attname = 'course_id' and not attisdropped)
     ]::smallint[];
  if v_name is not null then
    execute format('alter table public.certificates drop constraint %I', v_name);
  end if;
end $$;

-- ── 3. Re-issue certificates with an expiry, idempotent per valid period ──────
-- Replaces migration 11's issue_certificate(); the existing trigger
-- (issue_certificate_on_complete AFTER UPDATE ON enrollments) stays bound to this new body.
-- Still gated to the transition INTO 'completed'. Two behavioral changes:
--   (a) VALIDITY GUARD — if a still-valid certificate already exists for this (user, course)
--       [not revoked AND (no expiry OR expiry in the future)], do nothing and return. This
--       replaces the old `on conflict (user_id, course_id) do nothing`: it makes issuance
--       idempotent for the CURRENT valid period (a duplicate completion within the window
--       mints no second cert) while still ALLOWING a fresh cert once the prior one lapses.
--   (b) EXPIRY STAMP — read courses.valid_for_days and set expires_at = now() + that many
--       days, or NULL when the course never expires. No on-conflict clause (the unique is
--       gone); a new row is what a recert cycle is supposed to create.
create or replace function public.issue_certificate() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  cert_no  text;
  slug4    text;
  v_days   int;
  v_expires timestamptz;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    -- (a) validity guard: a currently-valid cert already covers this period → idempotent no-op.
    if exists (
      select 1 from public.certificates c
       where c.user_id = new.user_id
         and c.course_id = new.course_id
         and c.revoked_at is null
         and (c.expires_at is null or c.expires_at > now())
    ) then
      return new;
    end if;

    -- (b) compute this cycle's expiry from the course's validity window.
    select valid_for_days into v_days from public.courses where id = new.course_id;
    v_expires := case
                   when v_days is not null then now() + make_interval(days => v_days)
                   else null
                 end;

    -- fresh, uniquely-numbered certificate for this recert cycle (SF-<slug4>-YYYY-<rand6>).
    select upper(left(regexp_replace(coalesce(slug,''), '[^a-z0-9]', '', 'g'), 4))
      into slug4 from public.tenants where id = new.tenant_id;
    cert_no := 'SF-' || coalesce(nullif(slug4, ''), 'GEN') || '-' || to_char(now(), 'YYYY')
               || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    insert into public.certificates (tenant_id, user_id, course_id, certificate_number, expires_at)
    values (new.tenant_id, new.user_id, new.course_id, cert_no, v_expires);
  end if;
  return new;
end $$;
revoke all on function public.issue_certificate() from public, anon, authenticated;
comment on function public.issue_certificate() is
  'Trigger (AFTER UPDATE ON enrollments): on transition INTO completed, mints a certificate with a per-course expiry. Idempotent for the current valid period; issues a fresh dated cert once the prior one has expired (recert).';

-- ── 3b. Progress engine scoped to the current certification cycle ─────────────
-- Replaces migration 12's sync_enrollment_progress(): identical behavior EXCEPT that the
-- "distinct required lessons completed" count now considers ONLY statements whose occurred_at
-- is on/after the enrollment's cert_cycle_started_at. This is the fix that makes recertification
-- mean something: after the sweep opens a new cycle (cert_cycle_started_at := now()), last cycle's
-- immutable completions fall outside the window, so the worker must re-complete every required
-- lesson (assessment included) THIS cycle to reach 100% again. First-time enrollments are
-- unaffected — their window is the enrollment's own start, and all their completions occur after it.
create or replace function public.sync_enrollment_progress() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_course      uuid;
  v_required    int;
  v_done        int;
  v_progress    int;
  v_cycle_start timestamptz;
begin
  begin
    v_course := (new.context->>'course_id')::uuid;
  exception when others then
    return new;   -- no / invalid course context → nothing to sync
  end;
  if v_course is null then
    return new;
  end if;

  -- Window: the current certification cycle for this enrollment (NULL when no enrollment
  -- row exists yet → -infinity, i.e. count everything, matching pre-window behavior).
  select cert_cycle_started_at into v_cycle_start
    from public.enrollments
   where user_id = new.user_id and course_id = v_course;

  select count(*) into v_required
    from public.lessons where course_id = v_course and required = true;

  select count(distinct l.id) into v_done
    from public.completion_statements s
    join public.lessons l
      on l.course_id = v_course and l.required = true
     and l.id::text = (s.context->>'lesson_id')
   where s.user_id = new.user_id
     and s.occurred_at >= coalesce(v_cycle_start, '-infinity'::timestamptz)
     and (s.verb->>'id') in (
       'http://adlnet.gov/expapi/verbs/completed',
       'http://adlnet.gov/expapi/verbs/passed'
     );

  v_progress := case when v_required > 0
                     then least(100, floor(100.0 * v_done / v_required)::int)
                     else 0 end;

  update public.enrollments
     set progress     = v_progress,
         status       = case when v_progress >= 100 then 'completed'
                             when v_progress > 0    then 'in-progress'
                             else status end,
         completed_at = case when v_progress >= 100 then now() else completed_at end
   where user_id = new.user_id and course_id = v_course;

  return new;
end $$;

-- ── 4. The recertification sweep (system maintenance job) ─────────────────────
-- Flips an enrollment from 'completed' to 'expired' when its certification has lapsed:
-- the (user, course) HAS at least one certificate (it genuinely completed at some point)
-- but has NO currently-valid one (all its certs are revoked or past expires_at).
--
-- WHY THIS IS SAFE. It touches ONLY the enrollments row — never the append-only
-- completion_statements and never a certificate row. It writes 'expired', never 'completed',
-- so it cannot mis-fire issue_certificate(). Beyond the status flip it OPENS A NEW CERTIFICATION
-- CYCLE — cert_cycle_started_at := now(), progress := 0, completed_at := null — so the windowed
-- sync_enrollment_progress() (section 3b) now counts nothing until the worker re-completes the
-- required lessons THIS cycle. Only when they genuinely re-complete all of them (assessment
-- included) does progress reach 100 and transition 'expired' -> 'completed', re-firing
-- issue_certificate() (validity guard passes: old cert expired) to mint a FRESH cert. Full recert
-- cycle, zero statement mutation, evidence trail intact, and no renewal without re-demonstration.
--
-- Tenant-AGNOSTIC and SECURITY DEFINER with a pinned search_path, invokable ONLY by the
-- scheduler (execute revoked below) — same posture as the overdue sweep (migration 14).
create or replace function public.transition_expired_certifications() returns void
  language sql security definer set search_path = public as $$
  update public.enrollments e
     set status                = 'expired',
         cert_cycle_started_at = now(),
         progress              = 0,
         completed_at          = null
   where e.status = 'completed'
     and exists (
       select 1 from public.certificates c
        where c.user_id = e.user_id
          and c.course_id = e.course_id
     )
     and not exists (
       select 1 from public.certificates c
        where c.user_id = e.user_id
          and c.course_id = e.course_id
          and c.revoked_at is null
          and (c.expires_at is null or c.expires_at > now())
     );
$$;

revoke all on function public.transition_expired_certifications() from public, anon, authenticated;
comment on function public.transition_expired_certifications() is
  'System maintenance sweep (pg_cron): marks completed enrollments expired when their certification has lapsed and opens a fresh certification cycle (resets cert_cycle_started_at/progress/completed_at). Tenant-agnostic; touches only the enrollment row; never writes completed or mutates statements/certificates. Recert then requires genuine re-completion this cycle via the windowed sync_enrollment_progress + issue_certificate.';

-- ── 5. Schedule the sweep daily, idempotently ────────────────────────────────
-- Unschedule-if-exists then (re)schedule under a stable jobname, mirroring migration 14,
-- so re-running the migration replaces the job cleanly instead of stacking duplicates.
-- Expiry is a day-scale signal, so daily (00:15, offset from the overdue sweep at 00:00)
-- is ample granularity.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('sf-recert-expiry-sweep')
    where exists (select 1 from cron.job where jobname = 'sf-recert-expiry-sweep');
  perform cron.schedule(
    'sf-recert-expiry-sweep',
    '15 0 * * *',
    $job$ select public.transition_expired_certifications(); $job$
  );
end $$;
