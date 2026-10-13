-- ============================================================================
-- 004 — New transaction states  (run this ON ITS OWN, before 005)
-- ============================================================================
-- Postgres won't let a new enum value be used in the same transaction that
-- adds it, and 005 uses these in an index. So this file is kept separate.
--
--   in_use     A Lend deal after the handoff scan: the borrower has the item,
--              escrow is still held until it comes back.
--   cancelled  Called off before any money moved.
--              (Called off after paying uses the existing 'refunded'.)
-- ============================================================================

alter type transaction_status add value if not exists 'in_use';
alter type transaction_status add value if not exists 'cancelled';
