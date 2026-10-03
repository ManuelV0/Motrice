begin;

create table if not exists public.profile_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, image_path),
  constraint profile_moments_owned_path check (image_path like user_id::text || '/moments/%')
);

create index if not exists profile_moments_user_created_idx
  on public.profile_moments(user_id, created_at desc);

alter table public.profile_moments enable row level security;

drop policy if exists profile_moments_read on public.profile_moments;
create policy profile_moments_read
on public.profile_moments for select
to authenticated
using (true);

drop policy if exists profile_moments_insert_own on public.profile_moments;
create policy profile_moments_insert_own
on public.profile_moments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profile_moments_delete_own on public.profile_moments;
create policy profile_moments_delete_own
on public.profile_moments for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.profile_moments to authenticated;

commit;
