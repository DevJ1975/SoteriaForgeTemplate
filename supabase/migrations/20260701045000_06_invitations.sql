-- Invitations + redemption: how a user joins a tenant.
-- A tenant-admin issues an invite (RLS-scoped to their own tenant); the invitee
-- redeems it after signing in, and their profile is created SERVER-SIDE from the
-- invite (never a client-chosen tenant). Authorization to redeem = token + a
-- verified email match.

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  role        text not null default 'worker' check (role in ('worker','supervisor','tenant-admin')),
  token       uuid not null default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by  uuid references public.profiles(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (tenant_id, email)
);
create index invitations_token_idx  on public.invitations(token);
create index invitations_email_idx  on public.invitations(lower(email));
create index invitations_tenant_idx on public.invitations(tenant_id);
comment on table public.invitations is 'Pending tenant memberships. Redeemed via public.redeem_invitation(token).';

alter table public.invitations enable row level security;
grant select, insert, update, delete on public.invitations to authenticated;

-- Stamp tenant_id + invited_by from the admin's verified context (never client input).
create or replace function public.stamp_invitation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.tenant_id  := public.current_tenant_id();
    new.invited_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function public.stamp_invitation() from public, anon, authenticated;
create trigger stamp_invitation_ins before insert on public.invitations
  for each row execute function public.stamp_invitation();

-- Only tenant-admins (and super-admin) manage invites, scoped to their tenant.
create policy invitations_select on public.invitations for select to authenticated
  using (public.current_user_role() = 'super-admin'
         or (tenant_id = public.current_tenant_id() and public.current_user_role() = 'tenant-admin'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.current_user_role() in ('tenant-admin','super-admin'));
create policy invitations_update on public.invitations for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('tenant-admin','super-admin'))
  with check (tenant_id = public.current_tenant_id());

-- Redeem: a signed-in user exchanges a token for a profile in the invite's tenant.
-- SECURITY DEFINER because a not-yet-provisioned user has no tenant, so RLS would
-- otherwise block the profile insert. Authorization is the token + verified email.
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

  select * into inv from public.invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now()
      and lower(email) = lower(coalesce(myemail, ''))
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
