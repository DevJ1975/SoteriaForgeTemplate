-- Migration 12 — fixes found in a live end-to-end debug pass of the learning loop.
--
-- 1. BUSINESS LOGIC — progress counts the canonical completion verbs EXACTLY.
--    A completion statement's verb may be `completed`, `passed`, or `failed`
--    (see @soteria-forge/shared xapi.ts). The old trigger matched
--    `verb->>'id' like '%completed%'`, which (a) NEVER counted a `passed`
--    assessment lesson toward progress — a latent gap — and (b) would
--    substring-match a non-canonical verb like `.../uncompleted`. Now a required
--    lesson counts as done for the canonical `completed` OR `passed` verb, matched
--    exactly; `failed` is correctly excluded. Verified live: the mobile/web flow
--    emits `completed`, so existing behavior is preserved; `passed` now also counts.
--
-- 2. PERFORMANCE — wrap auth.uid()/current_tenant_id()/current_user_role() in a
--    scalar subquery in the flagged RLS policies so they evaluate ONCE per query
--    instead of once per row (Supabase advisor 0003 auth_rls_initplan). The
--    security semantics are byte-for-byte identical — only the query plan changes.
--
-- 3. PERFORMANCE — covering indexes for foreign keys (advisor 0001).
--
-- 4. SECURITY HYGIENE — the pre-existing event-trigger function `rls_auto_enable()`
--    is granted to PUBLIC/anon/authenticated (advisor 0028/0029). It only works
--    inside a DDL event (a direct RPC call errors), but least-privilege says an
--    event-trigger function should not be RPC-executable — revoke it. Migrations
--    run as `postgres`, which retains EXECUTE, so the event trigger still fires.

-- ── 1. Progress: exact verb-set match (completed OR passed) ───────────────────
create or replace function public.sync_enrollment_progress() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_course   uuid;
  v_required int;
  v_done     int;
  v_progress int;
begin
  begin
    v_course := (new.context->>'course_id')::uuid;
  exception when others then
    return new;   -- no / invalid course context → nothing to sync
  end;
  if v_course is null then
    return new;
  end if;

  select count(*) into v_required
    from public.lessons where course_id = v_course and required = true;

  select count(distinct l.id) into v_done
    from public.completion_statements s
    join public.lessons l
      on l.course_id = v_course and l.required = true
     and l.id::text = (s.context->>'lesson_id')
   where s.user_id = new.user_id
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

-- ── 2. RLS init-plan perf (SELECT/INSERT/UPDATE; security semantics unchanged) ─
drop policy if exists statements_insert on public.completion_statements;
create policy statements_insert on public.completion_statements
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists statements_select on public.completion_statements;
create policy statements_select on public.completion_statements
  for select to authenticated
  using (
    (select public.current_user_role()) = 'super-admin'
    or (tenant_id = (select public.current_tenant_id())
        and (user_id = (select auth.uid())
             or (select public.current_user_role()) = any (array['supervisor','tenant-admin'])))
  );

drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (
    (select public.current_user_role()) = 'super-admin'
    or (tenant_id = (select public.current_tenant_id())
        and (user_id = (select auth.uid())
             or (select public.current_user_role()) = any (array['supervisor','tenant-admin'])))
  );

drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates
  for select to authenticated
  using (
    (select public.current_user_role()) = 'super-admin'
    or (tenant_id = (select public.current_tenant_id())
        and (user_id = (select auth.uid())
             or (select public.current_user_role()) = any (array['supervisor','tenant-admin'])))
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (id = (select auth.uid())
         or (select public.current_user_role()) = any (array['tenant-admin','super-admin']))
  )
  with check (tenant_id = (select public.current_tenant_id()));

-- ── 3. Covering indexes for foreign keys (advisor 0001) ──────────────────────
create index if not exists certificates_course_idx   on public.certificates(course_id);
create index if not exists lessons_course_idx         on public.lessons(course_id);
create index if not exists video_assets_course_idx    on public.video_assets(course_id);
create index if not exists video_assets_lesson_idx    on public.video_assets(lesson_id);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);

-- ── 4. Least-privilege: rls_auto_enable() is an event-trigger fn, never an RPC ─
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
