-- ============================================================================
-- 005 — Columns and tables for the transaction core, disputes and alerts
-- ============================================================================
-- Run after 004. Everything is additive (no data is dropped) and safe to re-run.
--
-- Payments are SIMULATED for the pilot: escrow_holds records what would be
-- held / released / refunded, but no real money moves.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- transactions: link back to the negotiation that produced the deal
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists chat_id      uuid references public.chats(id)  on delete set null,
  add column if not exists offer_id     uuid references public.offers(id) on delete set null,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

-- A listing can have at most one deal in progress at a time. The backend checks
-- this too; the index makes it impossible even under a race.
create unique index if not exists uniq_active_transaction_per_listing
  on public.transactions (listing_id)
  where status in ('pending_payment', 'escrow_held', 'qr_issued', 'in_use', 'disputed');

create index if not exists idx_transactions_buyer  on public.transactions (buyer_id);
create index if not exists idx_transactions_seller on public.transactions (seller_id);

-- ---------------------------------------------------------------------------
-- escrow_holds: record where the money went when the hold closes
-- ---------------------------------------------------------------------------
alter table public.escrow_holds
  add column if not exists released_to_seller numeric(10,2),
  add column if not exists refunded_to_buyer  numeric(10,2);

-- ---------------------------------------------------------------------------
-- qr_tokens: a Lend deal needs two QR scans — one at handoff, one at return
-- ---------------------------------------------------------------------------
alter table public.qr_tokens
  add column if not exists purpose photo_stage not null default 'handoff';

create index if not exists idx_qr_tokens_tx on public.qr_tokens (transaction_id, purpose);

-- ---------------------------------------------------------------------------
-- disputes: what the admin decided, and on whom any penalty fell
-- ---------------------------------------------------------------------------
alter table public.disputes
  add column if not exists created_at              timestamptz not null default now(),
  add column if not exists transaction_status_before text,
  add column if not exists admin_note              text,
  add column if not exists outcome                 text check (outcome in ('release', 'refund')),
  add column if not exists penalty_user_id         uuid references public.users(id);

create index if not exists idx_disputes_status on public.disputes (status);

-- ---------------------------------------------------------------------------
-- users: running total of penalties applied by admins
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists penalty_total numeric(10,2) not null default 0;

-- ---------------------------------------------------------------------------
-- category_subscriptions: "Get matched" — alert me when a listing in this
-- category goes live (use case diagram, proposal Section 4.1)
-- ---------------------------------------------------------------------------
create table if not exists public.category_subscriptions (
  user_id    uuid not null references public.users(id) on delete cascade,
  category   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists idx_category_subscriptions_category
  on public.category_subscriptions (category);

-- New table, so it gets the same lock-down as the other 13 (see 003).
alter table public.category_subscriptions enable row level security;
