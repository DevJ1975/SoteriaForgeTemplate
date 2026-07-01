-- Reflect append-only completion statements onto enrollment progress.
-- On each new 'completed' lesson statement (context carries course_id + lesson_id),
-- recompute the worker's enrollment progress for that course. SECURITY DEFINER so a
-- worker (who cannot directly UPDATE enrollments per RLS) still sees progress
-- reflected. Statements remain the source of truth; enrollment.progress is a cache.
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
     and (s.verb->>'id') like '%completed%';

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
revoke all on function public.sync_enrollment_progress() from public, anon, authenticated;

create trigger sync_enrollment_progress_ins
  after insert on public.completion_statements
  for each row execute function public.sync_enrollment_progress();
