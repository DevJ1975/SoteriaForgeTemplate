-- Soteria Forge — Row-Level Security. THE tenant-isolation gate.
-- Every domain row is readable/writable only within the caller's own tenant
-- (current_tenant_id()); completion_statements are append-only; super-admin is
-- the one cross-tenant role (still read-only on completion_statements).

-- Privileges: RLS restricts, GRANTs enable. Authenticated-only; anon gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

alter table public.tenants               enable row level security;
alter table public.profiles              enable row level security;
alter table public.courses               enable row level security;
alter table public.modules               enable row level security;
alter table public.lessons               enable row level security;
alter table public.enrollments           enable row level security;
alter table public.completion_statements enable row level security;
alter table public.video_assets          enable row level security;

-- ── Server-side stamping (never trust a client-supplied tenant_id/user_id) ──
create or replace function public.stamp_tenant() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.tenant_id := public.current_tenant_id();
  return new;
end $$;

create or replace function public.stamp_statement() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.tenant_id := public.current_tenant_id();
  new.user_id   := auth.uid();
  return new;
end $$;

create trigger stamp_tenant_courses     before insert on public.courses      for each row execute function public.stamp_tenant();
create trigger stamp_tenant_modules     before insert on public.modules      for each row execute function public.stamp_tenant();
create trigger stamp_tenant_lessons     before insert on public.lessons      for each row execute function public.stamp_tenant();
create trigger stamp_tenant_enrollments before insert on public.enrollments  for each row execute function public.stamp_tenant();
create trigger stamp_tenant_videos      before insert on public.video_assets for each row execute function public.stamp_tenant();
create trigger stamp_statement_ins      before insert on public.completion_statements for each row execute function public.stamp_statement();

-- ── tenants: read own; super-admin manages ──────────────────────────────────
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.current_tenant_id() or public.current_user_role() = 'super-admin');
create policy tenants_write on public.tenants for all to authenticated
  using (public.current_user_role() = 'super-admin')
  with check (public.current_user_role() = 'super-admin');

-- ── profiles: read within tenant; self/tenant-admin write ───────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.current_user_role() = 'super-admin');
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.current_user_role() in ('tenant-admin','super-admin')
              and (tenant_id = public.current_tenant_id() or public.current_user_role() = 'super-admin'));
create policy profiles_update on public.profiles for update to authenticated
  using (tenant_id = public.current_tenant_id()
         and (id = auth.uid() or public.current_user_role() in ('tenant-admin','super-admin')))
  with check (tenant_id = public.current_tenant_id());

-- ── Content (courses/modules/lessons/video_assets): read same-tenant, admin write ──
-- SELECT: same tenant (super-admin sees all). INSERT: tenant-admin (tenant_id stamped
-- by trigger). UPDATE/DELETE: tenant-admin within tenant.
do $$
declare t text;
begin
  foreach t in array array['courses','modules','lessons','video_assets'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (tenant_id = public.current_tenant_id() or public.current_user_role() = ''super-admin'');', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.current_user_role() in (''tenant-admin'',''super-admin''));', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (tenant_id = public.current_tenant_id() and public.current_user_role() in (''tenant-admin'',''super-admin'')) with check (tenant_id = public.current_tenant_id());', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (tenant_id = public.current_tenant_id() and public.current_user_role() in (''tenant-admin'',''super-admin''));', t);
  end loop;
end $$;

-- ── enrollments: worker sees own; supervisor/admin see tenant; admins write ──
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.current_user_role() = 'super-admin'
         or (tenant_id = public.current_tenant_id()
             and (user_id = auth.uid() or public.current_user_role() in ('supervisor','tenant-admin'))));
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (public.current_user_role() in ('supervisor','tenant-admin','super-admin'));
create policy enrollments_update on public.enrollments for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_user_role() in ('supervisor','tenant-admin','super-admin'))
  with check (tenant_id = public.current_tenant_id());

-- ── completion_statements: APPEND-ONLY. Insert own; read own/tenant-staff. ──
-- NO update or delete policy exists ⇒ updates/deletes are denied for everyone.
create policy statements_select on public.completion_statements for select to authenticated
  using (public.current_user_role() = 'super-admin'
         or (tenant_id = public.current_tenant_id()
             and (user_id = auth.uid() or public.current_user_role() in ('supervisor','tenant-admin'))));
create policy statements_insert on public.completion_statements for insert to authenticated
  with check (user_id = auth.uid());
