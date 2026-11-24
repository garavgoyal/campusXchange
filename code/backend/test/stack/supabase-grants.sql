-- Run AFTER the migrations. Supabase grants the API roles full table access
-- by default and relies on Row-Level Security to decide what each user can
-- see. Doing the same here means the tests check the real RLS policies, not a
-- missing grant.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
