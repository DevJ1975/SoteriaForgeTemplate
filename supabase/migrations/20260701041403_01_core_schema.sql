-- Soteria Forge — core relational schema for the multi-tenant training platform.
-- Postgres 17. Every domain row carries tenant_id; isolation via RLS (migration 02).
create extension if not exists pgcrypto;

-- ── Tenants ────────────────────────────────────────────────────────────────
create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  status     text not null default 'active' check (status in ('active','trial','suspended','archived')),
  mode       text not null default 'dedicated' check (mode in ('marketplace','dedicated')),
  branding   jsonb not null default '{}'::jsonb,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.tenants is 'Tenant registry — one row per customer org.';

-- ── Profiles (1:1 with auth.users; source of truth for tenant_id + role) ────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete restrict,
  email      text,
  full_name  text,
  role       text not null default 'worker' check (role in ('worker','supervisor','tenant-admin','super-admin')),
  job_title  text,
  department text,
  crew       text,
  site       text,
  created_at timestamptz not null default now()
);
create index profiles_tenant_idx on public.profiles(tenant_id);
comment on table public.profiles is 'App profile per auth user. tenant_id + role drive RLS.';

-- ── Courses / Modules / Lessons ─────────────────────────────────────────────
create table public.courses (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  slug                  text,
  title                 text not null,
  description           text,
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  category              text,
  topic                 text,
  role                  text,
  duration_minutes      int,
  tags                  text[] not null default '{}',
  field_readiness_score int  not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index courses_tenant_idx on public.courses(tenant_id);

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  description text,
  sequence    int  not null default 0,
  created_at  timestamptz not null default now()
);
create index modules_course_idx on public.modules(course_id);
create index modules_tenant_idx on public.modules(tenant_id);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  module_id        uuid not null references public.modules(id) on delete cascade,
  kind             text not null default 'video' check (kind in ('video','quiz','game','scorm','document','reflection','practical-signoff')),
  title            text not null,
  description      text,
  duration_minutes int  not null default 0,
  required         boolean not null default true,
  sequence         int  not null default 0,
  passing_score    int,
  content          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index lessons_module_idx on public.lessons(module_id);
create index lessons_tenant_idx on public.lessons(tenant_id);

-- ── Enrollments ─────────────────────────────────────────────────────────────
create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  status       text not null default 'assigned' check (status in ('assigned','in-progress','completed','overdue','expired')),
  progress     int  not null default 0,
  due_at       timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, course_id)
);
create index enrollments_user_idx on public.enrollments(user_id);
create index enrollments_tenant_idx on public.enrollments(tenant_id);
create index enrollments_course_idx on public.enrollments(course_id);

-- ── Completion statements (xAPI; APPEND-ONLY; idempotent by client UUID) ────
create table public.completion_statements (
  id          uuid primary key,                 -- CLIENT-generated UUID == idempotency key
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor       jsonb not null,
  verb        jsonb not null,
  object      jsonb not null,
  result      jsonb,
  context     jsonb,
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);
create index statements_user_idx on public.completion_statements(user_id);
create index statements_tenant_idx on public.completion_statements(tenant_id);
comment on table public.completion_statements is 'xAPI completion statements. Append-only, idempotent by client-supplied id (PK). No updates or deletes.';

-- ── Video assets (METADATA ONLY — never bytes) ──────────────────────────────
create table public.video_assets (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  course_id        uuid references public.courses(id) on delete set null,
  lesson_id        uuid references public.lessons(id) on delete set null,
  provider         text not null default 'cloudflare-stream',
  playback_id      text not null,
  download_url     text,
  duration_seconds int,
  created_at       timestamptz not null default now()
);
create index video_tenant_idx on public.video_assets(tenant_id);
comment on table public.video_assets is 'Video METADATA only (Cloudflare Stream playback id). Never stores bytes.';

-- ── Caller identity helpers (SECURITY DEFINER: read the caller''s own profile,
--    bypassing RLS, so policies can key off tenant/role without recursion) ────
create or replace function public.current_tenant_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_tenant_id() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
