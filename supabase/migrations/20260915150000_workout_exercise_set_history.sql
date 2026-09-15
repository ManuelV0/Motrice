begin;

create table if not exists public.workout_exercise_sets (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  exercise_key text not null,
  exercise_name text not null,
  set_number smallint not null check (set_number between 1 and 50),
  weight_kg numeric(8, 2) not null default 0 check (weight_kg >= 0),
  reps numeric(8, 2) not null default 0 check (reps >= 0),
  rir smallint not null default 0 check (rir between 0 and 10),
  equipment text not null default '',
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id, exercise_id, set_number)
);

create index if not exists workout_exercise_sets_user_completed_idx
  on public.workout_exercise_sets (user_id, completed_at desc);

drop trigger if exists workout_exercise_sets_set_updated_at on public.workout_exercise_sets;
create trigger workout_exercise_sets_set_updated_at
before update on public.workout_exercise_sets
for each row execute function public.set_updated_at();

alter table public.workout_exercise_sets enable row level security;

drop policy if exists workout_exercise_sets_read_own on public.workout_exercise_sets;
create policy workout_exercise_sets_read_own
on public.workout_exercise_sets for select to authenticated
using (user_id = auth.uid());

drop policy if exists workout_exercise_sets_write_own on public.workout_exercise_sets;
create policy workout_exercise_sets_write_own
on public.workout_exercise_sets for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.list_my_workout_exercise_history()
returns table (
  event_id uuid,
  exercise_id text,
  exercise_key text,
  exercise_name text,
  set_number smallint,
  weight_kg numeric,
  reps numeric,
  rir smallint,
  equipment text,
  completed_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    item.event_id,
    item.exercise_id,
    item.exercise_key,
    item.exercise_name,
    item.set_number,
    item.weight_kg,
    item.reps,
    item.rir,
    item.equipment,
    item.completed_at
  from public.workout_exercise_sets item
  where item.user_id = auth.uid()
  order by item.completed_at asc
  limit 1500;
$$;

create or replace function public.upsert_my_workout_exercise_set(
  target_event_id uuid,
  exercise_id_value text,
  exercise_key_value text,
  exercise_name_value text,
  set_number_value integer,
  weight_kg_value numeric,
  reps_value numeric,
  rir_value integer,
  equipment_value text default '',
  completed_at_value timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  saved public.workout_exercise_sets%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if not exists (
    select 1 from public.event_workout_sessions session
    where session.event_id = target_event_id and session.user_id = actor_id
  ) then
    raise exception 'Avvia prima l allenamento';
  end if;

  insert into public.workout_exercise_sets (
    event_id, user_id, exercise_id, exercise_key, exercise_name, set_number,
    weight_kg, reps, rir, equipment, completed_at
  ) values (
    target_event_id,
    actor_id,
    left(coalesce(nullif(trim(exercise_id_value), ''), 'exercise'), 120),
    left(coalesce(nullif(trim(exercise_key_value), ''), 'exercise'), 120),
    left(coalesce(nullif(trim(exercise_name_value), ''), 'Esercizio'), 160),
    least(50, greatest(1, coalesce(set_number_value, 1))),
    greatest(0, coalesce(weight_kg_value, 0)),
    greatest(0, coalesce(reps_value, 0)),
    least(10, greatest(0, coalesce(rir_value, 0))),
    left(coalesce(equipment_value, ''), 120),
    coalesce(completed_at_value, now())
  )
  on conflict (event_id, user_id, exercise_id, set_number)
  do update set
    exercise_key = excluded.exercise_key,
    exercise_name = excluded.exercise_name,
    weight_kg = excluded.weight_kg,
    reps = excluded.reps,
    rir = excluded.rir,
    equipment = excluded.equipment,
    completed_at = excluded.completed_at
  returning * into saved;

  return to_jsonb(saved) - 'user_id';
end;
$$;

create or replace function public.delete_my_workout_exercise_set(
  target_event_id uuid,
  exercise_id_value text,
  set_number_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  deleted_count integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  delete from public.workout_exercise_sets
  where event_id = target_event_id
    and user_id = actor_id
    and exercise_id = exercise_id_value
    and set_number = set_number_value;
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('success', true, 'deleted', deleted_count);
end;
$$;

revoke all on function public.list_my_workout_exercise_history() from public, anon;
revoke all on function public.upsert_my_workout_exercise_set(uuid, text, text, text, integer, numeric, numeric, integer, text, timestamptz) from public, anon;
revoke all on function public.delete_my_workout_exercise_set(uuid, text, integer) from public, anon;
grant execute on function public.list_my_workout_exercise_history() to authenticated;
grant execute on function public.upsert_my_workout_exercise_set(uuid, text, text, text, integer, numeric, numeric, integer, text, timestamptz) to authenticated;
grant execute on function public.delete_my_workout_exercise_set(uuid, text, integer) to authenticated;

commit;
