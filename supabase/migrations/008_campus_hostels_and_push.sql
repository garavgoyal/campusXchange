-- ============================================================================
-- 008 — Campus places, the student's hostel, nearest-first feed, push tokens
-- ============================================================================
-- Run after 007. Additive and safe to re-run (places are upserted by name).
--
-- CAMPUS PLACES
--   Every hostel and campus spot with its map position, taken from the TIET
--   campus navigation site (loc8tiet.netlify.app). Positions are given to 4
--   decimals (about 10 m), and a few buildings that sit together share one
--   point. That is plenty for "which meeting point is nearest my hostel".
--   kind = 'hostel' — a student can choose it as where they live, and it is
--                     also a meeting point (hostel reception)
--   kind = 'spot'   — any other meeting point
--   aliases         — older names, so listings that used the app's previous
--                     list ("Hostel Block A", "Library Foyer", …) still match
--
-- NEAREST-FIRST FEED
--   users.hostel is chosen by the student on their profile. No GPS, no live
--   location: the feed is ordered by the straight-line distance between the
--   student's hostel and each listing's meeting point.
--
-- PUSH TOKENS
--   One row per phone that allowed notifications. A token moves to whoever
--   signed in on that phone last.
-- ============================================================================

create table if not exists public.campus_locations (
  name        text primary key,
  kind        text not null check (kind in ('hostel', 'spot')),
  category    text,
  old_name    text,
  description text,
  lat         double precision,
  lng         double precision,
  aliases     text[] not null default '{}',
  sort_order  int not null default 100
);

alter table public.campus_locations enable row level security;

insert into public.campus_locations (name, kind, category, old_name, description, lat, lng, aliases, sort_order) values
  -- Hostels (Residential on loc8tiet)
  ('Agira Hall',              'hostel', 'Residential', 'Hostel-A', 'Boys',            30.3566, 76.3610, '{"Hostel A","Hostel-A","Hostel Block A"}', 10),
  ('Amritam Hall',            'hostel', 'Residential', 'Hostel-B', 'Boys',            30.3568, 76.3609, '{"Hostel B","Hostel-B","Hostel Block B"}', 10),
  ('Prithvi Hall',            'hostel', 'Residential', 'Hostel-C', 'Boys',            30.3570, 76.3611, '{"Hostel C","Hostel-C","Hostel Block C"}', 10),
  ('Neeram Hall',             'hostel', 'Residential', 'Hostel-D', 'Boys',            30.3572, 76.3607, '{"Hostel D","Hostel-D","Hostel Block D"}', 10),
  ('Vasudha Hall (E)',        'hostel', 'Residential', null,       'Girls',           30.3585, 76.3594, '{}', 10),
  ('Vasudha Hall (G)',        'hostel', 'Residential', 'Hostel-G', 'Girls',           30.3587, 76.3592, '{"Hostel G","Hostel-G"}', 10),
  ('Vyan Hall',               'hostel', 'Residential', 'Hostel-H', 'Boys',            30.3574, 76.3606, '{"Hostel H","Hostel-H"}', 10),
  ('Ira Hall',                'hostel', 'Residential', 'Hostel-I', 'Girls',           30.3589, 76.3590, '{"Hostel I","Hostel-I"}', 10),
  ('Tejas Hall',              'hostel', 'Residential', null,       'Boys',            30.3575, 76.3604, '{}', 10),
  ('Ambaram Hall',            'hostel', 'Residential', 'Hostel-K', 'Boys',            30.3577, 76.3602, '{"Hostel K","Hostel-K"}', 10),
  ('Viyat Hall',              'hostel', 'Residential', 'Hostel-L', 'Boys',            30.3579, 76.3600, '{"Hostel L","Hostel-L"}', 10),
  ('Anantam Hall',            'hostel', 'Residential', 'Hostel-M', null,              30.3581, 76.3598, '{"Hostel M","Hostel-M"}', 10),
  ('Ananta Hall',             'hostel', 'Residential', 'Hostel-N', null,              30.3591, 76.3588, '{"Hostel N","Hostel-N"}', 10),
  ('Vyom Hall',               'hostel', 'Residential', 'Hostel-O', 'Boys',            30.3583, 76.3596, '{"Hostel O","Hostel-O"}', 10),
  ('Vahni Hall',              'hostel', 'Residential', 'Hostel-Q', 'Girls',           30.3595, 76.3584, '{"Hostel Q","Hostel-Q"}', 10),
  ('Dhriti Hall (PG Hostel)', 'hostel', 'Residential', null,       'Girls, PG',       30.3593, 76.3586, '{"Dhriti Hall"}', 10),
  ('Hostel FRF',              'hostel', 'Residential', null,       'Girls, UG and PG', 30.3597, 76.3582, '{"FRF"}', 10),
  ('Hostel FRG',              'hostel', 'Residential', null,       'Girls, UG and PG', 30.3597, 76.3582, '{"FRG"}', 10),
  -- Meeting spots (everything else on loc8tiet that makes sense for a handoff)
  ('Library',          'spot', 'Academic',    null, null, 30.3564, 76.3639, '{"Library Foyer","Central Library"}', 20),
  ('Main Gate',        'spot', 'Access',      null, null, 30.3574, 76.3649, '{}', 20),
  ('Cos Complex',      'spot', 'Commercial',  null, null, 30.3576, 76.3651, '{"COS"}', 20),
  ('G-Block Canteen',  'spot', 'Commercial',  null, null, 30.3576, 76.3651, '{}', 20),
  ('Street',           'spot', 'Dining',      null, 'Sodexo food court', 30.3578, 76.3653, '{"Cafeteria"}', 20),
  ('KRAVINGS',         'spot', 'Dining',      null, 'Food court',        30.3578, 76.3653, '{"Kravings"}', 20),
  ('LT & LP',          'spot', 'Academic',    null, 'Lecture halls',     30.3558, 76.3633, '{}', 30),
  ('C-Block',          'spot', 'Academic',    null, null, 30.3558, 76.3633, '{}', 30),
  ('E-Block',          'spot', 'Academic',    null, null, 30.3550, 76.3625, '{}', 30),
  ('F-Block',          'spot', 'Academic',    null, null, 30.3556, 76.3631, '{}', 30),
  ('G-Block',          'spot', 'Academic',    null, null, 30.3558, 76.3633, '{}', 30),
  ('H-Block',          'spot', 'Academic',    null, null, 30.3562, 76.3637, '{}', 30),
  ('CSED',             'spot', 'Academic',    null, 'Computer Science Dept.', 30.3570, 76.3645, '{"CSED - Computer Science and Engineering Department"}', 30),
  ('Mechanical Department', 'spot', 'Academic', null, null, 30.3562, 76.3637, '{"MECHANICAL Department"}', 30),
  ('TSLAS',            'spot', 'Academic',    null, 'School of Liberal Arts and Sciences', 30.3562, 76.3637, '{}', 30),
  ('ELC',              'spot', 'Innovation',  null, 'Experiential Learning Centre', 30.3554, 76.3629, '{}', 30),
  ('TAN Building',     'spot', 'Innovation',  null, null, 30.3572, 76.3647, '{}', 30),
  ('Venture Lab',      'spot', 'Innovation',  null, null, 30.3568, 76.3643, '{}', 30),
  ('Auditorium',       'spot', 'Event Space', null, null, 30.3548, 76.3623, '{}', 40),
  ('C-hall',           'spot', 'Event Space', null, null, 30.3548, 76.3623, '{}', 40),
  ('Open Air Theatre (OAT)', 'spot', 'Event Space', null, null, 30.3580, 76.3655, '{"OAT"}', 40),
  ('Health Centre',    'spot', 'Health',      null, null, 30.3566, 76.3641, '{}', 40),
  ('SBI Bank',         'spot', 'Bank',        null, null, 30.3558, 76.3633, '{}', 40),
  ('Directorate',      'spot', 'Administration', null, null, 30.3545, 76.3621, '{}', 40),
  -- Used by the app before, but not on loc8tiet: kept as a meeting point with no
  -- position, so its listings sort after the ones we can measure. Add lat/lng
  -- here when you have them.
  ('Sports Complex',   'spot', 'Sports',      null, 'Position not on the campus map yet', null, null, '{}', 50)
on conflict (name) do update set
  kind = excluded.kind, category = excluded.category, old_name = excluded.old_name,
  description = excluded.description, lat = excluded.lat, lng = excluded.lng,
  aliases = excluded.aliases, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- The student's hostel (chosen on their profile; can be changed any time)
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists hostel text references public.campus_locations(name) on update cascade on delete set null;

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  token        text primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  platform     text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Distance in metres between two points (haversine)
-- ---------------------------------------------------------------------------
create or replace function public.cx_distance_m(lat1 double precision, lng1 double precision,
                                                lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end
$$;

-- ---------------------------------------------------------------------------
-- The feed, nearest meeting point first. Same filters as the normal feed.
-- Listings whose meeting point has no known position come last (newest first).
-- Returns ids and distances; the backend loads the listing rows.
-- ---------------------------------------------------------------------------
create or replace function public.cx_feed_nearest(
  p_hostel   text,
  p_type     text,
  p_category text default null,
  p_search   text default null,
  p_limit    int  default 20,
  p_offset   int  default 0
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
     and (p_category is null or l.category = p_category)
     and (p_search is null
          or l.title ilike '%' || p_search || '%'
          or l.description ilike '%' || p_search || '%')
   order by distance_m asc nulls last, l.created_at desc, l.id desc
   limit greatest(1, least(p_limit, 50))
  offset greatest(0, p_offset);
$$;

revoke all on function public.cx_feed_nearest(text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.cx_feed_nearest(text, text, text, text, int, int) to service_role;
grant execute on function public.cx_distance_m(double precision, double precision, double precision, double precision) to service_role;
