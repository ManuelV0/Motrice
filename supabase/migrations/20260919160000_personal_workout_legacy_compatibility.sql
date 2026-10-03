begin;

-- Le sessioni personali ricorrenti usano il nuovo sblocco GPS. Gli eventi
-- personali creati prima dell'introduzione del programma restano utilizzabili.
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

  if target_event.is_personal
    and target_event.personal_arrival_enabled
    and (
      clock_timestamp() < coalesce(target_event.personal_available_from, target_event.starts_at)
      or clock_timestamp() > coalesce(target_event.personal_available_until, target_event.ends_at)
    )
  then
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

    if target_event.is_personal and target_event.personal_arrival_enabled then
      if not organizer_gps_verified then
        raise exception 'Raggiungi il punto di allenamento e conferma la posizione';
      end if;
    elsif target_event.is_personal then
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

commit;
