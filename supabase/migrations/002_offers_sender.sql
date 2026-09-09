-- ============================================================================
-- Add offers.sender_id — required for real negotiation
-- ============================================================================
-- The original `offers` table records a price and a status but not WHO proposed
-- it. Without that, only one side could ever make an offer.
--
-- With sender_id, either party can propose a price and only the *other* party
-- can accept or reject it — which is what negotiation actually means, and what
-- proposal Section 4.5 describes.
--
-- Run once in Supabase -> SQL Editor.
-- ============================================================================

alter table offers
  add column if not exists sender_id uuid references users(id) on delete set null;

create index if not exists idx_offers_chat on offers (chat_id, created_at);
