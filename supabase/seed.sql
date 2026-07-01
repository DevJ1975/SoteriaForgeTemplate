-- Soteria Forge — seed data. IDEMPOTENT: safe to run repeatedly (upserts by id).
-- Mirrors what was seeded into the live project (ref bgnadngztngkwzneknhd):
--   • two tenants: atl-curb-to-cabin (dedicated/active), demo (marketplace/trial)
--   • one published course under atl-curb-to-cabin: "Confined Space Entry"
--
-- Fixed UUIDs (not gen_random_uuid()) so a fresh `supabase db reset` reproduces the
-- exact ids the live project uses — deterministic across environments.
--
-- NOTE: no profiles/enrollments/statements/videos are seeded. profiles are 1:1 with
-- auth.users, so real users must be created through Supabase Auth first; those (and
-- the rows that reference them) are provisioned by the app / an admin, not this seed.
-- Seed rows are inserted with auth.uid() = null, so the BEFORE INSERT stamping
-- triggers trust the explicit tenant_id here (see migration 05).

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
