-- ============================================================================
-- 009 — Your own listings leave your Home feed; dispute penalty tiers
-- ============================================================================
-- Run after 008. Safe to re-run.
--
-- OWN LISTINGS
--   The Home feed is for finding other students' items; your own are under the
--   "My listings" tab. The normal feed filters them in the backend; this
--   replaces cx_feed_nearest with a version that does the same, so paging
--   through "Nearest" isn't thrown off by rows that would be hidden afterwards.
--
-- PENALTY TIERS
--   Admins pick a fixed tier instead of typing any amount (proposal §10:
--   "define clear escalation and penalty tiers"). The amounts live in the
--   backend (disputes.service.ts → PENALTY_TIERS); this records which tier
--   was applied next to the amount.
-- ============================================================================

drop function if exists public.cx_feed_nearest(text, text, text, text, int, int);

create or replace function public.cx_feed_nearest(
  p_hostel   text,
  p_type     text,
  p_category text default null,
  p_search   text default null,
  p_limit    int  default 20,
  p_offset   int  default 0,
  p_viewer   uuid default null
)
returns table (id uuid, distance_m double precision)
language sql
stable
as $$
  with home as (
    select lat, lng from public.campus_locations where name = p_hostel
  )
  select l.id,
         public.cx_distance_m(home.lat, home.lng, place.lat, place.lng) as distance_m
    from public.listings l
    cross join home
    left join lateral (
      select c.lat, c.lng
        from public.campus_locations c
       where lower(c.name) = lower(trim(l.meeting_location))
          or lower(trim(l.meeting_location)) = any (select lower(a) from unnest(c.aliases) a)
       limit 1
    ) place on true
   where l.status = 'live'
     and l.type::text = p_type
     and (p_viewer is null or l.owner_id <> p_viewer)
     and (p_category is null or l.category = p_category)
     and (p_search is null
          or l.title ilike '%' || p_search || '%'
          or l.description ilike '%' || p_search || '%')
   order by distance_m asc nulls last, l.created_at desc, l.id desc
   limit greatest(1, least(p_limit, 50))
  offset greatest(0, p_offset);
$$;

revoke all on function public.cx_feed_nearest(text, text, text, text, int, int, uuid) from public, anon, authenticated;
grant execute on function public.cx_feed_nearest(text, text, text, text, int, int, uuid) to service_role;

alter table public.disputes
  add column if not exists penalty_tier text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'disputes_penalty_tier_check') then
    alter table public.disputes
      add constraint disputes_penalty_tier_check
      check (penalty_tier is null or penalty_tier in ('minor', 'moderate', 'severe'));
  end if;
end $$;
