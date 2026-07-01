-- Stamp tenant/user from the verified claim ONLY for authenticated end-users
-- (anti-spoofing). When auth.uid() is null (service_role / trusted backend / seed),
-- trust the explicitly-provided values. Grants from migration 04 are preserved by
-- CREATE OR REPLACE; re-revoked here for certainty.
create or replace function public.stamp_tenant() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end $$;

create or replace function public.stamp_statement() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.tenant_id := public.current_tenant_id();
    new.user_id   := auth.uid();
  end if;
  return new;
end $$;

revoke all on function public.stamp_tenant()   from public, anon, authenticated;
revoke all on function public.stamp_statement() from public, anon, authenticated;
