-- Certificates: issued automatically when an enrollment first reaches 'completed'.
-- System-issued + immutable to clients (no insert/update/delete policy); a
-- SECURITY DEFINER trigger mints exactly one per (user, course).
create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  course_id          uuid not null references public.courses(id) on delete cascade,
  certificate_number text not null unique,
  score              int,
  issued_at          timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  unique (user_id, course_id)
);
create index certificates_tenant_idx on public.certificates(tenant_id);
create index certificates_user_idx   on public.certificates(user_id);
comment on table public.certificates is 'Course-completion certificates. System-issued (trigger), immutable to clients.';

alter table public.certificates enable row level security;
grant select on public.certificates to authenticated;   -- read-only; NO client insert/update/delete

-- read: own certs, same-tenant staff, or super-admin (all tenant-scoped)
create policy certificates_select on public.certificates for select to authenticated
  using (
    public.current_user_role() = 'super-admin'
    or (tenant_id = public.current_tenant_id()
        and (user_id = auth.uid() or public.current_user_role() in ('supervisor','tenant-admin')))
  );
-- NO insert/update/delete policy → clients cannot create or mutate certificates.

create or replace function public.issue_certificate() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  cert_no text;
  slug4   text;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select upper(left(regexp_replace(coalesce(slug,''), '[^a-z0-9]', '', 'g'), 4))
      into slug4 from public.tenants where id = new.tenant_id;
    cert_no := 'SF-' || coalesce(nullif(slug4, ''), 'GEN') || '-' || to_char(now(), 'YYYY')
               || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    insert into public.certificates (tenant_id, user_id, course_id, certificate_number)
    values (new.tenant_id, new.user_id, new.course_id, cert_no)
    on conflict (user_id, course_id) do nothing;   -- idempotent: one per user+course
  end if;
  return new;
end $$;
revoke all on function public.issue_certificate() from public, anon, authenticated;

create trigger issue_certificate_on_complete
  after update on public.enrollments
  for each row execute function public.issue_certificate();
