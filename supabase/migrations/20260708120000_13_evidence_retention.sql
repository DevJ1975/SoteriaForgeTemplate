-- Migration 13 — Evidence retention: the append-only training record must survive
-- ordinary admin lifecycle. (Audit gap #5.)
--
-- WHY. Completion statements and certificates are legal EVIDENCE — the audit trail
-- proving a worker was trained/qualified for regulated (OSHA/EHS) work. In the core
-- schema (migration 01) and certificates (migration 11), the tenant_id / user_id /
-- course_id foreign keys were declared ON DELETE CASCADE. That means a routine admin
-- action — hard-deleting a departed worker, retiring a course, or removing a tenant —
-- would SILENTLY and IRRECOVERABLY destroy the completion_statements and certificates
-- that prove past training ever happened. For a compliance system that is a data-loss
-- and liability defect, not a convenience.
--
-- FIX. Convert those evidence-bearing FKs from ON DELETE CASCADE to ON DELETE RESTRICT,
-- and give profiles a soft-delete column so the app can DEACTIVATE a worker instead of
-- deleting the row. After this migration:
--   * Deleting a profile / course / tenant that still has statements or certificates
--     will correctly RAISE a foreign-key violation instead of cascading the evidence
--     away. The application must ARCHIVE / DEACTIVATE instead of hard-deleting.
--   * courses and tenants already model soft-delete via status = 'archived'
--     (see migration 01 CHECK constraints) — that IS their soft-delete; we deliberately
--     add no new column to them. profiles had no such affordance, so we add
--     deactivated_at here.
--
-- DELIBERATELY UNTOUCHED. profiles.id -> auth.users(id) ON DELETE CASCADE stays as-is.
-- Full auth-user / account deletion WITH evidence retention (e.g. detaching statements
-- to a tombstone, or an anonymized retention copy) is a distinct, compliance-basis
-- workflow that belongs to a later phase — we do NOT change it here. NOTE the direct
-- consequence: because completion_statements.user_id -> profiles(id) is now RESTRICT,
-- deleting an auth.users row whose profile still owns statements will FAIL (the cascade
-- into profiles is blocked by the RESTRICT from statements). That is the correct,
-- safe default until the retention path exists — evidence never vanishes by accident.
--
-- RLS / append-only semantics are UNCHANGED. completion_statements remains insert-only,
-- own-rows (migration 02/12): we add NO update or delete policy here. This migration
-- only alters referential actions and adds a nullable column + index.

-- ── 1. Re-point evidence FKs to ON DELETE RESTRICT ───────────────────────────
-- Each DO block discovers the ACTUAL foreign-key constraint on (table, column) from
-- pg_constraint (rather than trusting the default <table>_<col>_fkey name), drops it
-- if present, then re-adds the same single-column FK with ON DELETE RESTRICT under the
-- canonical name. Re-runnable: a second run finds the RESTRICT constraint, drops and
-- recreates it identically.

-- completion_statements.user_id -> profiles(id)
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.completion_statements'::regclass
     and con.contype  = 'f'
     and con.confrelid = 'public.profiles'::regclass
     and con.conkey = array[(
       select attnum from pg_attribute
        where attrelid = 'public.completion_statements'::regclass
          and attname  = 'user_id' and not attisdropped
     )]::smallint[];
  if v_name is not null then
    execute format('alter table public.completion_statements drop constraint %I', v_name);
  end if;
  alter table public.completion_statements
    add constraint completion_statements_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete restrict;
end $$;

-- completion_statements.tenant_id -> tenants(id)
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.completion_statements'::regclass
     and con.contype  = 'f'
     and con.confrelid = 'public.tenants'::regclass
     and con.conkey = array[(
       select attnum from pg_attribute
        where attrelid = 'public.completion_statements'::regclass
          and attname  = 'tenant_id' and not attisdropped
     )]::smallint[];
  if v_name is not null then
    execute format('alter table public.completion_statements drop constraint %I', v_name);
  end if;
  alter table public.completion_statements
    add constraint completion_statements_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete restrict;
end $$;

-- certificates.user_id -> profiles(id)
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.certificates'::regclass
     and con.contype  = 'f'
     and con.confrelid = 'public.profiles'::regclass
     and con.conkey = array[(
       select attnum from pg_attribute
        where attrelid = 'public.certificates'::regclass
          and attname  = 'user_id' and not attisdropped
     )]::smallint[];
  if v_name is not null then
    execute format('alter table public.certificates drop constraint %I', v_name);
  end if;
  alter table public.certificates
    add constraint certificates_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete restrict;
end $$;

-- certificates.course_id -> courses(id)
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.certificates'::regclass
     and con.contype  = 'f'
     and con.confrelid = 'public.courses'::regclass
     and con.conkey = array[(
       select attnum from pg_attribute
        where attrelid = 'public.certificates'::regclass
          and attname  = 'course_id' and not attisdropped
     )]::smallint[];
  if v_name is not null then
    execute format('alter table public.certificates drop constraint %I', v_name);
  end if;
  alter table public.certificates
    add constraint certificates_course_id_fkey
    foreign key (course_id) references public.courses(id) on delete restrict;
end $$;

-- certificates.tenant_id -> tenants(id)
do $$
declare
  v_name text;
begin
  select con.conname into v_name
    from pg_constraint con
   where con.conrelid = 'public.certificates'::regclass
     and con.contype  = 'f'
     and con.confrelid = 'public.tenants'::regclass
     and con.conkey = array[(
       select attnum from pg_attribute
        where attrelid = 'public.certificates'::regclass
          and attname  = 'tenant_id' and not attisdropped
     )]::smallint[];
  if v_name is not null then
    execute format('alter table public.certificates drop constraint %I', v_name);
  end if;
  alter table public.certificates
    add constraint certificates_tenant_id_fkey
    foreign key (tenant_id) references public.tenants(id) on delete restrict;
end $$;

-- ── 2. Soft-delete affordance for profiles ───────────────────────────────────
-- A worker who leaves must be DEACTIVATED, not hard-deleted, so their evidence FKs
-- (now RESTRICT) stay intact. deactivated_at is a nullable timestamp: NULL = active,
-- set = deactivated at that instant. This is metadata only; enforcement of what a
-- deactivated user may do (e.g. blocking sign-in) is an auth/app-layer concern layered
-- on later — the column is the durable record the rest of the system keys off.
alter table public.profiles add column if not exists deactivated_at timestamptz;
comment on column public.profiles.deactivated_at is
  'Soft-delete: NULL = active. Deactivate departed workers instead of hard-deleting (evidence FKs are ON DELETE RESTRICT).';

-- Partial index over ACTIVE profiles only: the hot path (staff rosters, assignment
-- pickers) filters deactivated_at is null; a partial index keeps that lookup lean and
-- excludes the deactivated tail.
create index if not exists profiles_active_tenant_idx
  on public.profiles(tenant_id)
  where deactivated_at is null;
