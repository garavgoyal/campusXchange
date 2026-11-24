-- ============================================================================
-- 011 — Reporting and admin takedown
-- ============================================================================
-- Run after 010. Safe to re-run.
--
--  * Students can report a listing or another student (table `reports`).
--  * Admins can take down a listing that is already live. A taken-down listing
--    stays off the feed for good: a trigger refuses to put it back to live,
--    whatever code path tries (re-approval, a cancelled or finished deal).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Takedown record on the listing
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists taken_down_at     timestamptz,
  add column if not exists taken_down_reason text,
  add column if not exists taken_down_by     uuid references public.users(id) on delete set null;

create or replace function public.cx_keep_taken_down()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.taken_down_at is not null and new.status in ('live', 'pending_review', 'reserved') then
    new.status := 'removed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_taken_down on public.listings;
create trigger trg_keep_taken_down
  before update of status on public.listings
  for each row execute function public.cx_keep_taken_down();

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users(id) on delete cascade,
  -- Exactly one of these is set when the report is made. A listing the owner
  -- later deletes leaves listing_id null; listing_title keeps what it was.
  listing_id       uuid references public.listings(id) on delete set null,
  listing_title    text,
  reported_user_id uuid references public.users(id) on delete cascade,
  reason           text not null
                   check (reason in ('prohibited', 'scam', 'fake', 'wrong_info', 'offensive', 'other')),
  details          text check (details is null or char_length(details) <= 1000),
  status           text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  admin_id         uuid references public.users(id) on delete set null,
  admin_note       text,
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  constraint report_has_one_target check (not (listing_id is not null and reported_user_id is not null))
);

-- One open report per student per listing / per person.
create unique index if not exists uniq_open_listing_report
  on public.reports (reporter_id, listing_id) where status = 'open' and listing_id is not null;
create unique index if not exists uniq_open_user_report
  on public.reports (reporter_id, reported_user_id) where status = 'open' and reported_user_id is not null;
create index if not exists idx_reports_status on public.reports (status, created_at);

-- Only the backend (service role) reads or writes reports.
alter table public.reports enable row level security;
