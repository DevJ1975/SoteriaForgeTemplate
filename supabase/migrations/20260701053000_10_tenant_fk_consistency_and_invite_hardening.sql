-- SECURITY FIX (independent review, Finding 1): child/reference INSERT policies gated
-- on ROLE only; the stamp trigger set tenant_id but nothing checked that the referenced
-- FK parents/subjects live in the same tenant. A privileged caller who knows a
-- cross-tenant UUID could create a row referencing another tenant's entity (confirmed
-- live for enrollments). Add tenant-consistency EXISTS checks: the referenced
-- parent/subject must be in the ROW's own (stamped) tenant. (The EXISTS subqueries are
-- ALSO RLS-scoped to what the caller can see, so this is doubly enforced.)

drop policy enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (
    public.current_user_role() in ('supervisor','tenant-admin','super-admin')
    and exists (select 1 from public.courses  c where c.id = course_id and c.tenant_id = tenant_id)
    and exists (select 1 from public.profiles p where p.id = user_id   and p.tenant_id = tenant_id)
  );

drop policy modules_insert on public.modules;
create policy modules_insert on public.modules for insert to authenticated
  with check (
    public.current_user_role() in ('tenant-admin','super-admin')
    and exists (select 1 from public.courses c where c.id = course_id and c.tenant_id = tenant_id)
  );

drop policy lessons_insert on public.lessons;
create policy lessons_insert on public.lessons for insert to authenticated
  with check (
    public.current_user_role() in ('tenant-admin','super-admin')
    and exists (select 1 from public.courses c where c.id = course_id and c.tenant_id = tenant_id)
    and exists (select 1 from public.modules m where m.id = module_id and m.tenant_id = tenant_id and m.course_id = course_id)
  );

drop policy video_assets_insert on public.video_assets;
create policy video_assets_insert on public.video_assets for insert to authenticated
  with check (
    public.current_user_role() in ('tenant-admin','super-admin')
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.tenant_id = tenant_id))
    and (lesson_id is null or exists (select 1 from public.lessons l where l.id = lesson_id and l.tenant_id = tenant_id))
  );

-- Finding 3: shorten the default invite lifetime; deny a null/empty caller email in
-- redeem (rather than coalescing to '' and risking a match against a malformed invite).
alter table public.invitations alter column expires_at set default (now() + interval '7 days');

create or replace function public.redeem_invitation(invite_token uuid)
  returns public.profiles
  language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  myemail text;
  inv     public.invitations;
  prof    public.profiles;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into prof from public.profiles where id = me;
  if found then
    return prof;                                   -- idempotent: already provisioned
  end if;

  select email into myemail from auth.users where id = me;
  if myemail is null or length(trim(myemail)) = 0 then
    raise exception 'no email on the session' using errcode = '22023';
  end if;

  select * into inv from public.invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now()
      and lower(email) = lower(myemail)
    for update;

  if not found then
    raise exception 'invalid, expired, or mismatched invitation' using errcode = '22023';
  end if;

  insert into public.profiles (id, tenant_id, email, full_name, role)
  values (me, inv.tenant_id, myemail, null, inv.role)
  returning * into prof;

  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  return prof;
end $$;
revoke all on function public.redeem_invitation(uuid) from public, anon;
grant execute on function public.redeem_invitation(uuid) to authenticated;
