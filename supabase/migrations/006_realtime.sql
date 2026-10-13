-- ============================================================================
-- 006 — Realtime for chat, offers, deals and notifications
-- ============================================================================
-- Run after 003 and 005.
--
-- The app subscribes to row changes so a new message, offer, deal update or
-- notification shows up instantly instead of waiting for the next poll. When
-- the app gets a change event it simply re-fetches through the backend, so the
-- backend's rules still decide what the user actually sees.
--
-- Realtime respects RLS: a user only receives events for rows a SELECT policy
-- lets them read. Since 003 turned RLS on with no policies, we now add the
-- narrowest possible read policies — "only the people in this conversation /
-- deal / inbox" — for exactly the four tables the app listens to. There are
-- still NO insert/update/delete policies: all writes go through the backend.
-- ============================================================================

-- Helper: is the signed-in user one of the two people in this chat?
-- SECURITY DEFINER so it can look at `chats` (which has no read policy).
create or replace function public.is_chat_participant(target_chat uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chats c
    where c.id = target_chat
      and auth.uid() in (c.initiator_id, c.owner_id)
  );
$$;

revoke all on function public.is_chat_participant(uuid) from public, anon;
grant execute on function public.is_chat_participant(uuid) to authenticated;

-- ---- read policies (signed-in users only, own rows only) -------------------
drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages"
  on public.messages for select to authenticated
  using (public.is_chat_participant(chat_id));

drop policy if exists "participants can read offers" on public.offers;
create policy "participants can read offers"
  on public.offers for select to authenticated
  using (public.is_chat_participant(chat_id));

drop policy if exists "parties can read their transactions" on public.transactions;
create policy "parties can read their transactions"
  on public.transactions for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));

drop policy if exists "users can read their notifications" on public.notifications;
create policy "users can read their notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- ---- add the four tables to Supabase's realtime publication ----------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'offers', 'transactions', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
