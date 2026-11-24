-- ============================================================================
-- Test-only stand-in for what a hosted Supabase project already has, so the
-- project's real migrations (supabase/migrations) run on a plain Postgres.
-- Used by the automated tests (npm run test:e2e) and CI. NEVER run this on the
-- real Supabase project — it already has all of this.
-- ============================================================================

-- The API roles (anon, authenticated, service_role, authenticator) are
-- cluster-wide, so setup-db.sh creates them before running this file.

-- Supabase Auth's user table (only the columns the migrations use).
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Same definition as Supabase's: the signed-in user's id from the JWT.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase Realtime's publication (migration 006 adds tables to it).
create publication supabase_realtime;
