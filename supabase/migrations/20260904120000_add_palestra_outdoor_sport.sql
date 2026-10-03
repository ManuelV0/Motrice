insert into public.sports (slug, name)
values ('palestra-outdoor', 'Palestra outdoor')
on conflict (slug) do update
set name = excluded.name;
