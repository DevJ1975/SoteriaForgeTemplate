-- Soteria Forge — seed data. IDEMPOTENT: safe to run repeatedly (upserts by id).
-- Mirrors what was seeded into the live project (ref bgnadngztngkwzneknhd):
--   • two tenants: atl-curb-to-cabin (dedicated/active), demo (marketplace/trial)
--   • one published course under atl-curb-to-cabin: "Confined Space Entry"
--
-- Fixed UUIDs (not gen_random_uuid()) so a fresh `supabase db reset` reproduces the
-- exact ids the live project uses — deterministic across environments.
--
-- Also seeds three DEMO auth users (+ their profiles + one enrollment) so you can
-- sign in and see tenant-scoped data immediately — see the block at the bottom. No
-- modules/lessons/statements/videos are seeded. Seed rows are inserted with
-- auth.uid() = null, so the BEFORE INSERT stamping triggers trust the explicit
-- tenant_id here (see migration 05).

-- ── Tenants ─────────────────────────────────────────────────────────────────
insert into public.tenants (id, slug, name, status, mode, branding, settings) values
  ('84f67b88-a161-49cc-95a8-2a3814f0d574', 'atl-curb-to-cabin', 'ATL Curb-to-Cabin', 'active', 'dedicated', '{}'::jsonb, '{}'::jsonb),
  ('3cd601b9-38a4-4285-b7da-36abc9a66d95', 'demo',              'Soteria Forge Demo', 'trial',  'marketplace', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do update set
  slug     = excluded.slug,
  name     = excluded.name,
  status   = excluded.status,
  mode     = excluded.mode,
  branding = excluded.branding,
  settings = excluded.settings;

-- ── Demo course (under atl-curb-to-cabin) ───────────────────────────────────
insert into public.courses
  (id, tenant_id, slug, title, description, status, category, topic, role, duration_minutes, tags, field_readiness_score) values
  ('033361e5-b6bf-4266-b70b-539d9953ac5d',
   '84f67b88-a161-49cc-95a8-2a3814f0d574',
   'confined-space-entry',
   'Confined Space Entry',
   'OSHA-aligned confined space entry & rescue awareness for ramp and facilities crews.',
   'published',
   'safety',
   null,
   null,
   45,
   array['confined-space','osha','field'],
   82)
on conflict (id) do update set
  tenant_id             = excluded.tenant_id,
  slug                  = excluded.slug,
  title                 = excluded.title,
  description           = excluded.description,
  status                = excluded.status,
  category              = excluded.category,
  topic                 = excluded.topic,
  role                  = excluded.role,
  duration_minutes      = excluded.duration_minutes,
  tags                  = excluded.tags,
  field_readiness_score = excluded.field_readiness_score;

-- ── Demo auth users + profiles (+ one enrollment) ───────────────────────────
-- Password for ALL demo accounts: SoteriaForge!2026
-- Idempotent by email. Seeds auth.users directly (the standard Supabase seed
-- pattern): a confirmed email/password user + its email identity, then the
-- app-level profile carrying tenant_id + role. On a fresh `db reset` these are
-- recreated with new ids (profiles.id must equal auth.users.id).
--   admin@atl.test    tenant-admin  ATL Curb-to-Cabin
--   worker@atl.test   worker        ATL Curb-to-Cabin  (enrolled in Confined Space Entry)
--   worker@demo.test  worker        Soteria Forge Demo (different tenant — proves isolation)
do $$
declare
  atl uuid := (select id from public.tenants where slug = 'atl-curb-to-cabin');
  dmo uuid := (select id from public.tenants where slug = 'demo');
  demo_course uuid := (select id from public.courses where slug = 'confined-space-entry');
  u   record;
  uid uuid;
begin
  for u in
    select * from (values
      ('admin@atl.test',   'ATL Tenant Admin', 'tenant-admin', atl),
      ('worker@atl.test',  'ATL Worker',       'worker',       atl),
      ('worker@demo.test', 'Demo Worker',      'worker',       dmo)
    ) as t(email, full_name, role, tenant_id)
  loop
    if not exists (select 1 from auth.users where email = u.email) then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, crypt('SoteriaForge!2026', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
        '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
      ) values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now()
      );
      insert into public.profiles (id, tenant_id, email, full_name, role)
      values (uid, u.tenant_id, u.email, u.full_name, u.role);
    end if;
  end loop;

  -- Enroll the ATL worker in the demo course (idempotent).
  insert into public.enrollments (tenant_id, user_id, course_id, status, progress)
  select atl, p.id, demo_course, 'assigned', 0
  from public.profiles p
  where p.email = 'worker@atl.test' and demo_course is not null
  on conflict (user_id, course_id) do nothing;
end $$;
