begin;

-- Una sessione valida richiede due terzi della durata programmata.
-- Il calcolo resta sul server: cambiare l'orologio del telefono non lo aggira.
create or replace function public.event_workout_minimum_seconds(duration_minutes_value integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(
    60,
    ceil(greatest(1, coalesce(duration_minutes_value, 60))::numeric * 120 / 3)::integer
  );
$$;

revoke all on function public.event_workout_minimum_seconds(integer) from public, anon;

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
      verified_start_at := clock_timestamp();
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

create or replace function public.record_event_workout_progress(
  target_event_id uuid,
  progress_percent_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_workout_sessions%rowtype;
  checkin_source text;
  mot_awarded_value integer := 0;
  minimum_seconds integer;
  remaining_seconds integer;
  minimum_time_reached boolean;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  select * into session_row
  from public.event_workout_sessions
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;

  session_row.progress_percent := greatest(
    session_row.progress_percent,
    least(100, greatest(0, coalesce(progress_percent_value, 0)))
  );

  minimum_seconds := public.event_workout_minimum_seconds(target_event.duration_minutes::integer);
  remaining_seconds := greatest(
    0,
    ceil(extract(epoch from (session_row.started_at + make_interval(secs => minimum_seconds) - clock_timestamp())))::integer
  );
  minimum_time_reached := remaining_seconds = 0;

  select source into checkin_source
  from public.event_checkins
  where event_id = target_event_id and user_id = actor_id;

  if session_row.role_key = 'participant'
    and checkin_source = 'gps'
    and session_row.progress_percent >= 60
    and minimum_time_reached
    and not session_row.mot_sixty_awarded
  then
    insert into public.mot_logs (user_id, evento_id, mot, qr_verificato, motivo, ref_key)
    values (actor_id, target_event_id, 3, true, 'workout_66_percent', 'workout:60:' || target_event_id::text)
    on conflict (user_id, ref_key) do nothing;
    if found then mot_awarded_value := 3; end if;
    session_row.mot_sixty_awarded := true;
  end if;

  update public.event_workout_sessions
  set progress_percent = session_row.progress_percent,
      mot_sixty_awarded = session_row.mot_sixty_awarded
  where event_id = target_event_id and user_id = actor_id
  returning * into session_row;

  return jsonb_build_object(
    'progress_percent', session_row.progress_percent,
    'mot_sixty_awarded', session_row.mot_sixty_awarded,
    'mot_awarded', mot_awarded_value,
    'minimum_duration_seconds', minimum_seconds,
    'minimum_completion_at', session_row.started_at + make_interval(secs => minimum_seconds),
    'minimum_time_reached', minimum_time_reached,
    'remaining_seconds', remaining_seconds
  );
end;
$$;

create or replace function public.complete_event_workout(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_workout_sessions%rowtype;
  participant public.event_participants%rowtype;
  xp_awarded_value integer := 0;
  completed_at_value timestamptz := clock_timestamp();
  minimum_seconds integer;
  remaining_seconds integer;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  select * into session_row
  from public.event_workout_sessions
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;
  if session_row.progress_percent < 100 then
    raise exception 'Completa tutta la scheda prima di terminare';
  end if;

  minimum_seconds := public.event_workout_minimum_seconds(target_event.duration_minutes::integer);
  remaining_seconds := greatest(
    0,
    ceil(extract(epoch from (session_row.started_at + make_interval(secs => minimum_seconds) - completed_at_value)))::integer
  );
  if remaining_seconds > 0 then
    raise exception 'Allenamento troppo breve: attendi ancora % minuti', ceil(remaining_seconds::numeric / 60)::integer;
  end if;

  if session_row.role_key = 'participant' and not session_row.xp_completion_awarded then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key)
    values (actor_id, target_event_id, 25, 'Allenamento completato', 'workout:complete:' || target_event_id::text)
    on conflict (user_id, ref_key) do nothing;
    if found then xp_awarded_value := 25; end if;

    select * into participant
    from public.event_participants
    where event_id = target_event_id and user_id = actor_id
    for update;

    if found then
      update public.event_participants
      set status = 'completed',
          cashback_percent = 100,
          stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
          minimum_reached_at = coalesce(minimum_reached_at, completed_at_value),
          completed_at = coalesce(completed_at, completed_at_value),
          updated_at = now()
      where event_id = target_event_id and user_id = actor_id;

      if participant.stake_cents > 0 and participant.stake_status in ('locked', 'verified') then
        update public.wallet_accounts
        set available_cents = available_cents + participant.stake_cents,
            locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = actor_id;
      end if;
    end if;
  end if;

  update public.event_workout_sessions
  set progress_percent = 100,
      xp_completion_awarded = xp_completion_awarded or session_row.role_key = 'participant',
      completed_at = coalesce(completed_at, completed_at_value)
  where event_id = target_event_id and user_id = actor_id
  returning * into session_row;

  return jsonb_build_object(
    'completed_at', session_row.completed_at,
    'xp_completion_awarded', session_row.xp_completion_awarded,
    'xp_awarded', xp_awarded_value,
    'minimum_duration_seconds', minimum_seconds,
    'minimum_completion_at', session_row.started_at + make_interval(secs => minimum_seconds),
    'minimum_time_reached', true,
    'remaining_seconds', 0
  );
end;
$$;

-- Ogni nuova serie riceve l'orario del database e non quello inviato dal
-- dispositivo. La riga della sessione serializza anche tocchi concorrenti.
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
  normalized_exercise_id text;
  normalized_set_number integer;
  server_now timestamptz := clock_timestamp();
  last_completed_at timestamptz;
  already_exists boolean := false;
  cadence_remaining integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  -- Il lock impedisce due conferme simultanee della stessa sessione.
  perform 1
  from public.event_workout_sessions session
  where session.event_id = target_event_id and session.user_id = actor_id
  for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;

  normalized_exercise_id := left(coalesce(nullif(trim(exercise_id_value), ''), 'exercise'), 120);
  normalized_set_number := least(50, greatest(1, coalesce(set_number_value, 1)));

  select exists (
    select 1
    from public.workout_exercise_sets item
    where item.event_id = target_event_id
      and item.user_id = actor_id
      and item.exercise_id = normalized_exercise_id
      and item.set_number = normalized_set_number
  ) into already_exists;

  if not already_exists then
    select max(item.completed_at)
    into last_completed_at
    from public.workout_exercise_sets item
    where item.event_id = target_event_id
      and item.user_id = actor_id;

    cadence_remaining := greatest(
      0,
      ceil(extract(epoch from (last_completed_at + interval '20 seconds' - server_now)))::integer
    );
    if cadence_remaining > 0 then
      raise exception 'Attendi % secondi prima di registrare un altra serie', cadence_remaining;
    end if;
  end if;

  insert into public.workout_exercise_sets (
    event_id, user_id, exercise_id, exercise_key, exercise_name, set_number,
    weight_kg, reps, rir, equipment, completed_at
  ) values (
    target_event_id,
    actor_id,
    normalized_exercise_id,
    left(coalesce(nullif(trim(exercise_key_value), ''), 'exercise'), 120),
    left(coalesce(nullif(trim(exercise_name_value), ''), 'Esercizio'), 160),
    normalized_set_number,
    greatest(0, coalesce(weight_kg_value, 0)),
    greatest(0, coalesce(reps_value, 0)),
    least(10, greatest(0, coalesce(rir_value, 0))),
    left(coalesce(equipment_value, ''), 120),
    server_now
  )
  on conflict (event_id, user_id, exercise_id, set_number)
  do update set
    exercise_key = excluded.exercise_key,
    exercise_name = excluded.exercise_name,
    weight_kg = excluded.weight_kg,
    reps = excluded.reps,
    rir = excluded.rir,
    equipment = excluded.equipment,
    completed_at = workout_exercise_sets.completed_at
  returning * into saved;

  return to_jsonb(saved) - 'user_id';
end;
$$;

revoke all on function public.start_event_workout(uuid) from public, anon;
revoke all on function public.record_event_workout_progress(uuid, integer) from public, anon;
revoke all on function public.complete_event_workout(uuid) from public, anon;
revoke all on function public.upsert_my_workout_exercise_set(uuid, text, text, text, integer, numeric, numeric, integer, text, timestamptz) from public, anon;
grant execute on function public.start_event_workout(uuid) to authenticated;
grant execute on function public.record_event_workout_progress(uuid, integer) to authenticated;
grant execute on function public.complete_event_workout(uuid) to authenticated;
grant execute on function public.upsert_my_workout_exercise_set(uuid, text, text, text, integer, numeric, numeric, integer, text, timestamptz) to authenticated;

commit;
