begin;

create table if not exists public.personal_event_series (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  timezone text not null default 'Europe/Rome' check (char_length(timezone) between 3 and 80),
  weekly_schedule jsonb not null check (jsonb_typeof(weekly_schedule) = 'object'),
  event_template jsonb not null check (jsonb_typeof(event_template) = 'object'),
  generated_until date,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events
  add column if not exists personal_series_id uuid
    references public.personal_event_series(id) on delete set null,
  add column if not exists personal_occurrence_date date,
  add column if not exists personal_available_from timestamptz,
  add column if not exists personal_available_until timestamptz,
  add column if not exists personal_arrival_enabled boolean not null default false;

alter table public.events
  drop constraint if exists events_personal_availability_check,
  add constraint events_personal_availability_check check (
    personal_available_from is null
    or personal_available_until is null
    or personal_available_until > personal_available_from
  );

create unique index if not exists events_personal_series_occurrence_unique
  on public.events(personal_series_id, personal_occurrence_date)
  where personal_series_id is not null and personal_occurrence_date is not null;

create index if not exists personal_event_series_creator_status_idx
  on public.personal_event_series(creator_id, status, start_date);

drop trigger if exists personal_event_series_set_updated_at on public.personal_event_series;
create trigger personal_event_series_set_updated_at
before update on public.personal_event_series
for each row execute function public.set_updated_at();

alter table public.personal_event_series enable row level security;
grant select, insert, update, delete on table public.personal_event_series to authenticated;

drop policy if exists personal_event_series_read_own on public.personal_event_series;
create policy personal_event_series_read_own
on public.personal_event_series for select
to authenticated
using (creator_id = (select auth.uid()));

drop policy if exists personal_event_series_insert_own on public.personal_event_series;
create policy personal_event_series_insert_own
on public.personal_event_series for insert
to authenticated
with check (creator_id = (select auth.uid()));

drop policy if exists personal_event_series_update_own on public.personal_event_series;
create policy personal_event_series_update_own
on public.personal_event_series for update
to authenticated
using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

drop policy if exists personal_event_series_delete_own on public.personal_event_series;
create policy personal_event_series_delete_own
on public.personal_event_series for delete
to authenticated
using (creator_id = (select auth.uid()));

create or replace function public.sync_event_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_grace integer;
begin
  effective_grace := case
    when coalesce(new.is_personal, false) then 0
    else least(30, greatest(15, coalesce(new.checkin_grace_minutes, 15)::integer))
  end;

  if coalesce(new.is_personal, false)
    and new.personal_available_from is not null
    and new.personal_available_until is not null
  then
    new.starts_at := new.personal_available_from;
    new.checkin_opens_at := new.personal_available_from;
    new.checkin_closes_at := new.personal_available_until;
    new.ends_at := new.personal_available_until;
  else
    new.checkin_opens_at := new.starts_at - interval '30 minutes';
    new.checkin_closes_at := new.starts_at + make_interval(mins => effective_grace);
    new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes::integer);
  end if;

  if new.archived_at is not null then
    new.lifecycle_state := 'archived';
  elsif new.status = 'cancelled' then
    new.lifecycle_state := 'cancelled';
  elsif new.status = 'completed' then
    new.lifecycle_state := 'completed';
  end if;

  if tg_op = 'INSERT' then
    new.lifecycle_version := greatest(1, coalesce(new.lifecycle_version, 0));
    new.lifecycle_updated_at := now();
  elsif new.lifecycle_state is distinct from old.lifecycle_state then
    new.lifecycle_version := old.lifecycle_version + 1;
    new.lifecycle_updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists events_lifecycle_10_sync_fields on public.events;
create trigger events_lifecycle_10_sync_fields
before insert or update of
  starts_at,
  duration_minutes,
  minimum_presence_minutes,
  checkin_grace_minutes,
  status,
  lifecycle_state,
  archived_at,
  is_personal,
  personal_available_from,
  personal_available_until
on public.events
for each row execute function public.sync_event_lifecycle_fields();

create or replace function public.generate_personal_event_series_occurrences(
  target_series_id uuid,
  horizon_date date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  series_row public.personal_event_series%rowtype;
  occurrence_date date;
  day_key text;
  day_config jsonb;
  available_time time;
  available_from_value timestamptz;
  available_until_value timestamptz;
  plan_id_value uuid;
  inserted_count integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into series_row
  from public.personal_event_series
  where id = target_series_id and creator_id = actor_id
  for update;

  if not found then raise exception 'Programma personale non trovato'; end if;
  if series_row.status <> 'active' then return 0; end if;

  for occurrence_date in
    select generate_series(
      series_row.start_date::timestamp,
      greatest(series_row.start_date, horizon_date)::timestamp,
      interval '1 day'
    )::date
  loop
    day_key := case extract(dow from occurrence_date)::integer
      when 0 then 'sunday'
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      else 'saturday'
    end;
    day_config := series_row.weekly_schedule -> day_key;
    if day_config is null or not coalesce((day_config ->> 'enabled')::boolean, false) then
      continue;
    end if;

    begin
      available_time := coalesce(nullif(day_config ->> 'time', ''), '18:00')::time;
    exception when others then
      raise exception 'Orario non valido per %', day_key;
    end;

    begin
      plan_id_value := nullif(day_config ->> 'planId', '')::uuid;
    exception when others then
      raise exception 'Scheda non valida per %', day_key;
    end;
    if plan_id_value is null or not exists (
      select 1 from public.personal_workout_plans plan
      where plan.id = plan_id_value and plan.user_id = actor_id and plan.deleted_at is null
    ) then
      raise exception 'Scheda personale non disponibile per %', day_key;
    end if;

    available_from_value := (occurrence_date + available_time) at time zone series_row.timezone;
    available_until_value := ((occurrence_date + 1)::timestamp at time zone series_row.timezone) - interval '1 millisecond';

    insert into public.events (
      creator_id,
      sport_id,
      title,
      description,
      city,
      location_name,
      lat,
      lng,
      starts_at,
      duration_minutes,
      max_participants,
      required_level,
      route_info,
      deposit_cents,
      audience,
      min_age,
      max_age,
      venue_type,
      gym_access_policy,
      gym_venue_key,
      participation_protection,
      visibility,
      join_policy,
      is_personal,
      scheda_id,
      personal_series_id,
      personal_occurrence_date,
      personal_available_from,
      personal_available_until,
      personal_arrival_enabled
    ) values (
      actor_id,
      (series_row.event_template ->> 'sport_id')::smallint,
      left(series_row.event_template ->> 'title', 100),
      left(coalesce(series_row.event_template ->> 'description', ''), 2000),
      left(coalesce(series_row.event_template ->> 'city', ''), 80),
      left(series_row.event_template ->> 'location_name', 180),
      (series_row.event_template ->> 'lat')::double precision,
      (series_row.event_template ->> 'lng')::double precision,
      available_from_value,
      least(360, greatest(15, coalesce((series_row.event_template ->> 'duration_minutes')::integer, 60))),
      1,
      coalesce(nullif(series_row.event_template ->> 'level', ''), 'beginner'),
      series_row.event_template -> 'route_info',
      0,
      'mixed',
      18,
      99,
      coalesce(nullif(series_row.event_template ->> 'venue_type', ''), 'standard'),
      nullif(series_row.event_template ->> 'gym_access_policy', ''),
      nullif(series_row.event_template ->> 'gym_venue_key', ''),
      false,
      'private',
      'open',
      true,
      plan_id_value,
      series_row.id,
      occurrence_date,
      available_from_value,
      available_until_value,
      true
    )
    on conflict (personal_series_id, personal_occurrence_date)
      where personal_series_id is not null and personal_occurrence_date is not null
    do nothing;

    if found then inserted_count := inserted_count + 1; end if;
  end loop;

  update public.personal_event_series
  set generated_until = greatest(coalesce(generated_until, start_date), horizon_date)
  where id = series_row.id;

  return inserted_count;
end;
$$;

create or replace function public.create_personal_event_series(series_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  new_series public.personal_event_series%rowtype;
  start_date_value date;
  weeks_value integer;
  inserted_count integer;
  first_event_id uuid;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if series_payload is null or jsonb_typeof(series_payload) <> 'object' then
    raise exception 'Programma personale non valido';
  end if;

  start_date_value := (series_payload ->> 'start_date')::date;
  if start_date_value < current_date then raise exception 'La data di inizio è già trascorsa'; end if;
  weeks_value := least(12, greatest(4, coalesce((series_payload ->> 'weeks')::integer, 4)));

  if not exists (
    select 1
    from jsonb_each(coalesce(series_payload -> 'weekly_schedule', '{}'::jsonb)) day
    where coalesce((day.value ->> 'enabled')::boolean, false)
  ) then
    raise exception 'Seleziona almeno un giorno di allenamento';
  end if;

  insert into public.personal_event_series (
    creator_id,
    start_date,
    timezone,
    weekly_schedule,
    event_template
  ) values (
    actor_id,
    start_date_value,
    coalesce(nullif(series_payload ->> 'timezone', ''), 'Europe/Rome'),
    coalesce(series_payload -> 'weekly_schedule', '{}'::jsonb),
    coalesce(series_payload -> 'event', '{}'::jsonb)
  ) returning * into new_series;

  inserted_count := public.generate_personal_event_series_occurrences(
    new_series.id,
    start_date_value + (weeks_value * 7 - 1)
  );

  select event.id into first_event_id
  from public.events event
  where event.personal_series_id = new_series.id
  order by event.personal_occurrence_date, event.starts_at
  limit 1;

  return jsonb_build_object(
    'id', new_series.id,
    'occurrences_created', inserted_count,
    'generated_until', new_series.start_date + (weeks_value * 7 - 1),
    'first_event_id', first_event_id
  );
end;
$$;

create or replace function public.ensure_personal_event_occurrences(weeks_ahead_value integer default 8)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  series_row record;
  inserted_count integer := 0;
begin
  if actor_id is null then return 0; end if;

  for series_row in
    select id, start_date
    from public.personal_event_series
    where creator_id = actor_id and status = 'active'
  loop
    inserted_count := inserted_count + public.generate_personal_event_series_occurrences(
      series_row.id,
      greatest(current_date, series_row.start_date) + (least(12, greatest(4, weeks_ahead_value)) * 7 - 1)
    );
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.start_event_workout(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  role_value text;
  verified_start_at timestamptz;
  session_row public.event_workout_sessions%rowtype;
  organizer_gps_verified boolean := false;
  minimum_seconds integer;
  remaining_seconds integer;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if target_event.is_personal and (
    clock_timestamp() < coalesce(target_event.personal_available_from, target_event.starts_at)
    or clock_timestamp() > coalesce(target_event.personal_available_until, target_event.ends_at)
  ) then
    raise exception 'L allenamento personale non è disponibile in questo momento';
  end if;

  if target_event.creator_id = actor_id then
    role_value := 'organizer';

    select max(sample.recorded_at)
    into verified_start_at
    from public.event_presence_samples sample
    where sample.event_id = target_event_id
      and sample.user_id = actor_id
      and sample.sample_role = 'organizer'
      and sample.is_in_radius
      and sample.recorded_at >= now() - interval '10 minutes';

    organizer_gps_verified := verified_start_at is not null;

    if target_event.is_personal then
      if not organizer_gps_verified then
        raise exception 'Raggiungi il punto di allenamento e conferma la posizione';
      end if;
    else
      select min(checkin.checked_in_at)
      into verified_start_at
      from public.event_checkins checkin
      where checkin.event_id = target_event_id;

      if verified_start_at is null and organizer_gps_verified then
        select max(sample.recorded_at)
        into verified_start_at
        from public.event_presence_samples sample
        where sample.event_id = target_event_id
          and sample.user_id = actor_id
          and sample.sample_role = 'organizer'
          and sample.is_in_radius
          and sample.recorded_at >= now() - interval '10 minutes';
      end if;

      if verified_start_at is null then
        raise exception 'Scannerizza il QR di un partecipante oppure conferma la geolocalizzazione';
      end if;
    end if;
  else
    role_value := 'participant';

    select * into participant
    from public.event_participants
    where event_id = target_event_id
      and user_id = actor_id;

    if not found
      or participant.status not in ('going', 'completed')
      or participant.checked_in_at is null
    then
      raise exception 'Verifica prima la presenza';
    end if;

    verified_start_at := participant.checked_in_at;
  end if;

  insert into public.event_workout_sessions (event_id, user_id, role_key, started_at)
  values (target_event_id, actor_id, role_value, verified_start_at)
  on conflict (event_id, user_id) do update
  set role_key = excluded.role_key,
      updated_at = now()
  returning * into session_row;

  minimum_seconds := public.event_workout_minimum_seconds(target_event.duration_minutes::integer);
  remaining_seconds := greatest(
    0,
    ceil(extract(epoch from (session_row.started_at + make_interval(secs => minimum_seconds) - clock_timestamp())))::integer
  );

  return to_jsonb(session_row) || jsonb_build_object(
    'minimum_duration_seconds', minimum_seconds,
    'minimum_completion_at', session_row.started_at + make_interval(secs => minimum_seconds),
    'minimum_time_reached', remaining_seconds = 0,
    'remaining_seconds', remaining_seconds
  );
end;
$$;

revoke all on function public.generate_personal_event_series_occurrences(uuid, date) from public, anon;
revoke all on function public.create_personal_event_series(jsonb) from public, anon;
revoke all on function public.ensure_personal_event_occurrences(integer) from public, anon;
grant execute on function public.generate_personal_event_series_occurrences(uuid, date) to authenticated;
grant execute on function public.create_personal_event_series(jsonb) to authenticated;
grant execute on function public.ensure_personal_event_occurrences(integer) to authenticated;

comment on table public.personal_event_series is
  'Programmi personali ricorrenti; le singole sessioni vengono materializzate progressivamente negli eventi.';
comment on column public.events.personal_available_from is
  'Istante dal quale una sessione personale può essere sbloccata con GPS.';
comment on column public.events.personal_available_until is
  'Limite giornaliero per lo sblocco; non rappresenta l avvio del timer.';

commit;
