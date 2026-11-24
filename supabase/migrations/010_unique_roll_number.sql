-- ============================================================================
-- 010 — One account per roll number
-- ============================================================================
-- Run after 009. Safe to re-run.
--
-- Two accounts could previously save the same roll number. This adds a unique
-- index so the database refuses a second one (the backend turns that into
-- "This roll number is already registered").
--
-- If duplicates ALREADY exist, the index can't be created. Instead of failing,
-- this lists them (see the NOTICE / the query at the bottom) and skips the
-- index. Fix those rows (Table Editor → users → clear or correct roll_number),
-- then run this file again. The backend also checks before saving, so no NEW
-- duplicates can be added in the meantime.
-- ============================================================================

-- Store roll numbers without stray spaces, so " 102103452" and "102103452" are the same.
update public.users
   set roll_number = nullif(trim(roll_number), '')
 where roll_number is distinct from nullif(trim(roll_number), '');

do $$
declare
  dupes text;
begin
  select string_agg(format('%s (%s accounts)', roll_number, n), ', ')
    into dupes
    from (
      select roll_number, count(*) as n
        from public.users
       where roll_number is not null
       group by roll_number
      having count(*) > 1
    ) d;

  if dupes is not null then
    raise notice 'Unique roll numbers NOT enforced yet. Duplicates to fix first: %', dupes;
  else
    create unique index if not exists uniq_users_roll_number
      on public.users (roll_number)
      where roll_number is not null;
    raise notice 'Roll numbers are now unique.';
  end if;
end $$;

-- Which accounts share a roll number (empty = all good):
select u.roll_number, u.email, u.name, u.created_at
  from public.users u
  join (
    select roll_number from public.users
     where roll_number is not null
     group by roll_number having count(*) > 1
  ) d using (roll_number)
 order by u.roll_number, u.created_at;
