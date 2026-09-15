begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_name text;
  profile_avatar text;
begin
  profile_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Atleta'
  );
  profile_name := left(profile_name, 40);
  if char_length(profile_name) < 2 then
    profile_name := 'Atleta';
  end if;

  profile_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, profile_name, profile_avatar)
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
