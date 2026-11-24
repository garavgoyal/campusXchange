-- ============================================================================
-- 007 — Exchange item offers, who pays, listing edits, atomic penalties
-- ============================================================================
-- Run after 006. Additive and safe to re-run.
--
-- EXCHANGE OFFERS
--   On an Exchange listing the person asking to swap now offers an actual item:
--   a title, optional description and at least one photo, plus an optional
--   cash top-up when the two items are not worth the same. The top-up can flow
--   either way, so the offer records who pays it.
--
--   offers.offered_price  = the top-up amount (0 = straight swap)
--   offers.topup_payer    = 'initiator' (the person who opened the chat)
--                           'owner'     (the person who listed the item)
--                           null        (no top-up)
--
-- WHO PAYS INTO ESCROW
--   For Sell and Lend it is always the buyer/borrower. For Exchange it is
--   whoever owes the top-up, so transactions.payer_id records it explicitly.
--   A null payer_id means "the buyer", so existing rows keep working.
--
--   escrow_holds.released_to_seller / refunded_to_buyer keep their meaning as
--   "amount that ended up with the seller side / the buyer side".
-- ============================================================================

alter table public.offers
  add column if not exists item_title       text,
  add column if not exists item_description text,
  add column if not exists item_images      text[] not null default '{}',
  add column if not exists topup_payer      text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'offers_topup_payer_check'
  ) then
    alter table public.offers
      add constraint offers_topup_payer_check
      check (topup_payer is null or topup_payer in ('initiator', 'owner'));
  end if;
end $$;

alter table public.transactions
  add column if not exists payer_id uuid references public.users(id);

-- ---------------------------------------------------------------------------
-- listings: remember when the owner last edited it (edits go back to review)
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists updated_at timestamptz;

-- Admin analytics reads clearance times from here.
create index if not exists idx_moderation_queue_reviewed
  on public.moderation_queue (reviewed_at);

-- ---------------------------------------------------------------------------
-- Penalties: one atomic UPDATE instead of read-then-write, so two admins
-- penalising the same student at the same moment can't lose one.
-- Only the backend (service_role) may call it.
-- ---------------------------------------------------------------------------
create or replace function public.add_penalty(p_user uuid, p_amount numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  update users
     set penalty_total = penalty_total + p_amount
   where id = p_user
  returning penalty_total;
$$;

revoke all on function public.add_penalty(uuid, numeric) from public, anon, authenticated;
grant execute on function public.add_penalty(uuid, numeric) to service_role;
