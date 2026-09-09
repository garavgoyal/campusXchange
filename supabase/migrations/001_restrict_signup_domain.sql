

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Reject anything that isn't a Thapar address. Case-insensitive, and the
  -- '@' is part of the pattern so "notthapar.edu" can't sneak through.
  if lower(new.email) not like '%@thapar.edu' then
    raise exception 'Only @thapar.edu email addresses may register'
      using errcode = 'check_violation';
  end if;

  insert into public.users (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);

  return new;
end;
$$;
