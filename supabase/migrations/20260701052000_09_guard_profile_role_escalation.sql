-- SECURITY FIX (privilege escalation): the profiles_update RLS policy only pins
-- tenant_id in its WITH CHECK, so any caller able to update a profile row could
-- freely change `role` — a worker could self-promote to super-admin, and a
-- tenant-admin could mint a super-admin. Guard the role column with a BEFORE UPDATE
-- trigger. RLS still scopes WHICH rows are updatable (own tenant); this restricts
-- WHAT the role may become:
--   * service_role / trusted backend (auth.uid() null): trusted, unrestricted.
--   * super-admin: may set any role.
--   * tenant-admin: may set worker/supervisor/tenant-admin (RLS keeps it in-tenant),
--     but NEVER super-admin.
--   * worker/supervisor (or unknown): may not change ANY role (theirs or others').
create or replace function public.guard_profile_role() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    return new;                               -- service_role / seed / trusted backend
  end if;
  if new.role is distinct from old.role then
    caller_role := public.current_user_role();
    if caller_role = 'super-admin' then
      null;                                   -- may grant any role
    elsif caller_role = 'tenant-admin' then
      if new.role = 'super-admin' then
        raise exception 'tenant-admin may not grant super-admin' using errcode = '42501';
      end if;
    else
      raise exception 'insufficient privilege to change role' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_profile_role() from public, anon, authenticated;

create trigger guard_profile_role_upd
  before update on public.profiles
  for each row execute function public.guard_profile_role();
