-- ============================================================================
-- 003 — Turn on Row-Level Security for every table
-- ============================================================================
-- WHY
--   The mobile app ships with the Supabase *anon* key. That key is public by
--   design: anyone can pull it out of the app bundle. With RLS disabled, that
--   key could read and write every table straight through Supabase's REST API
--   (e.g. GET /rest/v1/users?select=* returns every student's email, roll
--   number and ID-card path, and PATCH could set your own role to 'admin').
--
-- WHAT THIS DOES
--   Enables RLS on all 13 tables and adds NO policies. With RLS on and no
--   policy, the anon and authenticated roles can read/write nothing.
--
-- WHY NOTHING BREAKS
--   * The app only calls supabase.auth (OTP sign-in). Auth is not affected.
--   * The backend uses the service_role key, which bypasses RLS entirely, so
--     every API route behaves exactly as before.
--
--   The only direct-from-app reads (realtime chat and notifications) get their
--   own narrow, participant-only policies in 006_realtime.sql.
--
-- Safe to run more than once.
-- ============================================================================

alter table public.users            enable row level security;
alter table public.listings         enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.chats            enable row level security;
alter table public.messages         enable row level security;
alter table public.offers           enable row level security;
alter table public.transactions     enable row level security;
alter table public.escrow_holds     enable row level security;
alter table public.qr_tokens        enable row level security;
alter table public.lend_details     enable row level security;
alter table public.condition_photos enable row level security;
alter table public.disputes         enable row level security;
alter table public.notifications    enable row level security;

-- Quick self-check: every row below should say rls_enabled = true.
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by tablename;
