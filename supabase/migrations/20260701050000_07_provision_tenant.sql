-- Super-admin tenant provisioning + first-admin invite.
-- Super-admin is the cross-tenant operator, so the stamp triggers must let them set
-- tenant_id explicitly; non-super-admin callers are still pinned to their own tenant.

create or replace function public.stamp_tenant() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.current_user_role(), '') <> 'super-admin' then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end $$;
revoke all on function public.stamp_tenant() from public, anon, authenticated;

create or replace function public.stamp_invitation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.invited_by := auth.uid();
    if coalesce(public.current_user_role(), '') <> 'super-admin' then
      new.tenant_id := public.current_tenant_id();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_invitation() from public, anon, authenticated;

-- Provision a new tenant + invite its first tenant-admin. Super-admin ONLY.
-- Returns the new tenant + the invite token the first admin redeems on sign-up.
create or replace function public.provision_tenant(
  p_name text, p_slug text, p_admin_email text, p_mode text default 'dedicated'
) returns table (tenant_id uuid, tenant_slug text, invite_token uuid)
  language plpgsql security definer set search_path = public as $$
declare
  t   public.tenants;
  inv public.invitations;
begin
  if coalesce(public.current_user_role(), '') <> 'super-admin' then
    raise exception 'only super-admin may provision tenants' using errcode = '42501';
  end if;
  if p_admin_email is null or position('@' in p_admin_email) = 0 then
    raise exception 'a valid admin email is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'tenant slug already exists: %', p_slug using errcode = '23505';
  end if;

  insert into public.tenants (name, slug, mode)
  values (p_name, p_slug, coalesce(p_mode, 'dedicated'))
  returning * into t;

  insert into public.invitations (tenant_id, email, role)
  values (t.id, lower(p_admin_email), 'tenant-admin')
  returning * into inv;

  return query select t.id, t.slug, inv.token;
end $$;
revoke all on function public.provision_tenant(text, text, text, text) from public, anon;
grant execute on function public.provision_tenant(text, text, text, text) to authenticated;
