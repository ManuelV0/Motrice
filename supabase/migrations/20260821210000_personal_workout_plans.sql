begin;

create table if not exists public.personal_workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text not null,
  title text not null,
  sport_id text not null,
  workout_type text not null,
  duration_minutes integer not null default 60,
  level text not null default 'mid',
  equipment jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_workout_plans_user_client_unique unique (user_id, client_id),
  constraint personal_workout_plans_client_id_check check (char_length(client_id) between 1 and 120),
  constraint personal_workout_plans_title_check check (char_length(title) between 3 and 70),
  constraint personal_workout_plans_sport_check check (char_length(sport_id) between 2 and 40),
  constraint personal_workout_plans_type_check check (char_length(workout_type) between 2 and 60),
  constraint personal_workout_plans_duration_check check (duration_minutes between 5 and 360),
  constraint personal_workout_plans_level_check check (level in ('base', 'mid', 'pro')),
  constraint personal_workout_plans_equipment_check check (jsonb_typeof(equipment) = 'array'),
  constraint personal_workout_plans_exercises_check check (
    jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 100
  )
);

create index if not exists personal_workout_plans_user_updated_idx
  on public.personal_workout_plans(user_id, updated_at desc);

drop trigger if exists personal_workout_plans_set_updated_at on public.personal_workout_plans;
create trigger personal_workout_plans_set_updated_at
before update on public.personal_workout_plans
for each row execute function public.set_updated_at();

alter table public.personal_workout_plans enable row level security;

drop policy if exists personal_workout_plans_select_own on public.personal_workout_plans;
create policy personal_workout_plans_select_own
on public.personal_workout_plans
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists personal_workout_plans_insert_own on public.personal_workout_plans;
create policy personal_workout_plans_insert_own
on public.personal_workout_plans
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists personal_workout_plans_update_own on public.personal_workout_plans;
create policy personal_workout_plans_update_own
on public.personal_workout_plans
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists personal_workout_plans_delete_own on public.personal_workout_plans;
create policy personal_workout_plans_delete_own
on public.personal_workout_plans
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.personal_workout_plans from anon;
grant select, insert, update, delete on table public.personal_workout_plans to authenticated;

comment on table public.personal_workout_plans is
  'Schede di allenamento personali sincronizzate per proprietario; non contiene schede consegnate dai coach.';

commit;
