-- ============================================================================
-- CampusXchange — Database Schema (PostgreSQL / Supabase, using Supabase Auth)
-- ============================================================================
-- This version assumes Supabase Auth handles signup/login/sessions/OTP --
-- NOT the "build your own JWT" version. Differences from the previous
-- (self-hosted-auth) schema, both in the USERS table below:
--
--   - users.password_hash is GONE. Supabase Auth stores and hashes the
--     password itself, in its own auth.users table, which you never touch
--     directly and never query from your app code.
--   - users.email_verified is GONE. Supabase Auth already tracks this
--     internally (auth.users.email_confirmed_at) -- no need to duplicate it.
--   - users.id is no longer self-generated. It's a foreign key straight to
--     auth.users(id) -- literally the same id Supabase created when the
--     account was made. This table is now a "profile" that extends that
--     identity, not the source of the identity itself.
--   - A new trigger (bottom of the USERS section) auto-inserts a matching
--     profile row into public.users the instant Supabase creates a new
--     auth.users row. Your backend never runs "insert into users" itself --
--     signup already does it, automatically, server-side.
--
-- Everything else -- listings, chats, messages, transactions, escrow, etc. --
-- is UNCHANGED from the previous version and still matches the proposal
-- cross-check at the bottom of this file.
--
-- Run this whole file once in the Supabase SQL editor (Project -> SQL Editor
-- -> New query). It depends on Supabase's built-in `auth` schema already
-- existing, so it will NOT run against a plain, non-Supabase Postgres
-- instance -- that's expected and fine.
-- ============================================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
create type user_role              as enum ('student', 'admin');
create type id_verification_status as enum ('pending', 'verified', 'rejected');
create type listing_type           as enum ('sell', 'lend', 'exchange');
create type rent_unit_type         as enum ('day', 'week');
create type listing_status         as enum ('draft', 'pending_review', 'live', 'reserved', 'completed', 'removed');
create type moderation_status      as enum ('pending', 'approved', 'rejected');
create type offer_status           as enum ('pending', 'accepted', 'rejected');
create type transaction_status     as enum ('pending_payment', 'escrow_held', 'qr_issued', 'completed', 'disputed', 'refunded');
create type escrow_status          as enum ('held', 'released', 'refunded');
create type photo_stage            as enum ('handoff', 'return');
create type dispute_status         as enum ('open', 'under_review', 'resolved');

-- ---------------------------------------------------------------------------
-- 1. USERS  (Level-1 DFD: D1)
-- ---------------------------------------------------------------------------
-- id is NOT generated here. It's the same id Supabase Auth already created
-- in auth.users the moment the student signed up (email + OTP, handled
-- entirely by Supabase). This table is a profile that extends that identity
-- with the app-specific stuff Supabase doesn't know about.
create table users (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text not null default '',
  email              text not null unique,

  -- Optional -- not collected/validated at signup. Fill in later if you
  -- decide you want it; fine to leave null for the whole pilot.
  roll_number        text,

  -- ID card verification: photo only, manually approved by an admin.
  id_card_image_url  text,
  id_verified        id_verification_status not null default 'pending',

  role               user_role not null default 'student',
  created_at         timestamptz not null default now()
);

-- Auto-create a matching profile row the instant Supabase Auth creates the
-- underlying account. Password hashing, OTP generation/verification, and
-- sessions are entirely Supabase's job -- this trigger just mirrors the new
-- user's id/email into your own table so the rest of your schema (which
-- foreign-keys to users.id) has something to point at.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. LISTINGS  (Level-1 DFD: D2)
-- ---------------------------------------------------------------------------
create table listings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references users(id) on delete cascade,
  type              listing_type not null,

  title             text not null,
  description       text,
  images            text[] not null default '{}',
  category          text not null,
  condition         text,

  -- Sell only
  price             numeric(10,2),

  -- Lend only (not wired up for the mid-sem demo, but the columns exist now
  -- so no migration is needed when Lend ships)
  rent_amount       numeric(10,2),
  rent_unit         rent_unit_type,

  -- Exchange only -- what the poster would accept in return, e.g.
  -- {'calculator','lab coat','headphones'}. Used to match against what a
  -- browsing student has to offer.
  want_tags         text[],

  -- Per-listing meetup point -- this is what powers "nearby" sorting.
  meeting_location  text,

  status            listing_status not null default 'draft',
  created_at        timestamptz not null default now()
);

create index idx_listings_status_category on listings (status, category);
create index idx_listings_owner on listings (owner_id);

-- ---------------------------------------------------------------------------
-- 3. MODERATION QUEUE  (Level-1 DFD: D3)
-- ---------------------------------------------------------------------------
create table moderation_queue (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references listings(id) on delete cascade,
  ai_flag_score  numeric(4,3),                 -- 0.000-1.000, from the moderation API
  status         moderation_status not null default 'pending',
  reviewed_by    uuid references users(id),    -- admin who made the call
  reason         text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index idx_moderation_status on moderation_queue (status);

-- ---------------------------------------------------------------------------
-- 4. CHAT & MESSAGES  (Level-1 DFD: D4)
-- ---------------------------------------------------------------------------
create table chats (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  initiator_id  uuid not null references users(id),
  owner_id      uuid not null references users(id),
  created_at    timestamptz not null default now(),
  unique (listing_id, initiator_id)  -- one chat thread per buyer per listing
);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references chats(id) on delete cascade,
  sender_id  uuid not null references users(id),
  content    text not null,
  sent_at    timestamptz not null default now()
);

create table offers (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references chats(id) on delete cascade,
  offered_price  numeric(10,2) not null,
  status         offer_status not null default 'pending',
  created_at     timestamptz not null default now()
);

create index idx_messages_chat on messages (chat_id, sent_at);

-- ---------------------------------------------------------------------------
-- 5. TRANSACTIONS & ESCROW  (Level-1 DFD: D5)
-- ---------------------------------------------------------------------------
create table transactions (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings(id),
  type              listing_type not null,
  buyer_id          uuid not null references users(id),
  seller_id         uuid not null references users(id),
  agreed_price      numeric(10,2) not null,
  status            transaction_status not null default 'pending_payment',
  meeting_location  text,
  created_at        timestamptz not null default now()
);

create table escrow_holds (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null unique references transactions(id) on delete cascade,
  amount          numeric(10,2) not null,
  status          escrow_status not null default 'held',
  held_at         timestamptz not null default now(),
  released_at     timestamptz
);

create table qr_tokens (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  token           text not null unique,   -- signed, single-use
  expires_at      timestamptz not null,
  used            boolean not null default false,
  used_at         timestamptz
);

-- 1:1 with transactions, only populated for Lend deals
create table lend_details (
  transaction_id  uuid primary key references transactions(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  deposit_amount  numeric(10,2),
  rent_per_day    numeric(10,2)
);

create table condition_photos (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  stage           photo_stage not null,   -- 'handoff' or 'return'
  image_url       text not null,
  uploaded_by     uuid not null references users(id),
  uploaded_at     timestamptz not null default now()
);

create index idx_transactions_status on transactions (status);

-- ---------------------------------------------------------------------------
-- 6. DISPUTES  (Level-1 DFD: D6)
-- ---------------------------------------------------------------------------
create table disputes (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null unique references transactions(id) on delete cascade,
  raised_by       uuid not null references users(id),
  reason          text not null,
  status          dispute_status not null default 'open',
  admin_id        uuid references users(id),
  resolution      text,
  penalty_amount  numeric(10,2),
  resolved_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- 7. NOTIFICATIONS  (Level-1 DFD: D7)
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,     -- e.g. 'otp', 'listing_approved', 'new_message', 'dispute_update'
  payload     jsonb not null default '{}',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user_unread on notifications (user_id, read);

-- ============================================================================
-- End of schema. 13 tables total (same as before) + 1 trigger function that
-- bridges Supabase's auth.users to this schema's users table.
--
-- Proposal cross-check (Section 4.1 "Proposed Solution" overview):
--   Verified access             -> users (id_verified, roll_number) +
--                                   Supabase Auth (email/OTP, replacing the
--                                   email_verified/password_hash columns)
--   Sell / Lend / Exchange      -> listings.type + the type-specific columns
--   In-app chat & negotiation   -> chats, messages, offers
--   In-app payments (escrow)    -> transactions, escrow_holds
--   QR-verified handoff         -> qr_tokens, condition_photos
--   Trust & safety layer        -> moderation_queue, disputes
--   (implicit) notifications    -> notifications
-- ============================================================================
