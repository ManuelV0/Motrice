begin;

-- L'orario pubblicato apre il check-in, ma la durata effettiva parte dalla
-- presenza verificata. Ogni partecipante usa il proprio check-in; la vista
-- organizer usa il primo check-in valido del gruppo.
create or replace function public.start_event_location_tracking(
  target_event_id uuid,
  verification_method_value text default 'gps',
  device_platform_value text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  role_value text;
  participant_checked_in_at timestamptz;
  first_group_check_in_at timestamptz;
  session_start timestamptz;
  planned_end timestamptz;
  expected_end timestamptz;
  session_row public.event_tracking_sessions%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.verification_mode not in ('geo', 'both') then
    raise exception 'Il monitoraggio GPS non e previsto per questo evento';
  end if;
  if target_event.lat is null or target_event.lng is null then
    raise exception 'Coordinate evento non configurate';
  end if;

  role_value := case when target_event.creator_id = actor_id then 'organizer' else 'participant' end;
  if role_value = 'participant' then
    select participant.checked_in_at
    into participant_checked_in_at
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed');

    if participant_checked_in_at is null then
      raise exception 'Verifica prima la presenza';
    end if;
    session_start := participant_checked_in_at;
  else
    select min(participant.checked_in_at)
    into first_group_check_in_at
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.checked_in_at is not null;
    session_start := coalesce(first_group_check_in_at, now());
  end if;

  planned_end := coalesce(
    target_event.ends_at,
    target_event.starts_at + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)))
  );
  expected_end := session_start
    + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)));

  if now() < coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes') then
    raise exception 'Il monitoraggio si attiva con l apertura del check-in';
  end if;
  if now() > expected_end + interval '5 minutes'
    or (role_value = 'organizer' and first_group_check_in_at is null and now() > planned_end + interval '5 minutes')
  then
    raise exception 'Evento terminato';
  end if;

  insert into public.event_tracking_sessions (
    event_id, user_id, role_key, status, verification_method,
    device_platform, expected_end_at, started_at, completed_at,
    interrupted_at, interruption_reason, updated_at
  ) values (
    target_event_id,
    actor_id,
    role_value,
    'active',
    case when verification_method_value = 'qr_gps' then 'qr_gps' else 'gps' end,
    left(coalesce(nullif(trim(device_platform_value), ''), 'web'), 40),
    expected_end,
    session_start,
    null,
    null,
    null,
    now()
  )
  on conflict (event_id, user_id) do update set
    role_key = excluded.role_key,
    status = 'active',
    verification_method = excluded.verification_method,
    device_platform = excluded.device_platform,
    expected_end_at = excluded.expected_end_at,
    started_at = excluded.started_at,
    completed_at = null,
    interrupted_at = null,
    interruption_reason = null,
    updated_at = now()
  returning * into session_row;

  return to_jsonb(session_row);
end;
$$;

revoke all on function public.start_event_location_tracking(uuid, text, text) from public, anon;
grant execute on function public.start_event_location_tracking(uuid, text, text) to authenticated;

-- Continua ad accettare campioni GPS per tutta la durata calcolata dal
-- check-in, anche quando l'utente è arrivato dentro la tolleranza.
create or replace function public.record_event_presence(
  target_event_id uuid,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision default null,
  sample_speed_mps double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant_checked_in_at timestamptz;
  first_group_check_in_at timestamptz;
  runtime_start timestamptz;
  proof jsonb;
  opens_at timestamptz;
  ends_at_value timestamptz;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  if target_event.creator_id = actor_id then
    select min(participant.checked_in_at)
    into first_group_check_in_at
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.checked_in_at is not null;
    runtime_start := first_group_check_in_at;
  else
    select participant.checked_in_at
    into participant_checked_in_at
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed');
    runtime_start := participant_checked_in_at;
  end if;

  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  ends_at_value := case
    when runtime_start is not null then
      runtime_start + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)))
    else coalesce(
      target_event.ends_at,
      target_event.starts_at + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)))
    )
  end;
  if clock_timestamp() < opens_at or clock_timestamp() > ends_at_value then
    raise exception 'Registrazione presenza fuori dalla finestra evento';
  end if;

  if target_event.verification_mode <> 'qr' then
    proof := public.evaluate_event_location_sample(
      sample_lat,
      sample_lng,
      sample_accuracy_m,
      target_event.lat,
      target_event.lng,
      target_event.geofence_radius_m
    );
    if not coalesce((proof ->> 'accuracy_valid')::boolean, false) then
      raise exception 'Segnale GPS poco preciso';
    end if;
    if not coalesce((proof ->> 'inside_radius')::boolean, false) then
      raise exception 'Sei fuori dall area dell evento';
    end if;
  end if;

  return public.record_event_presence_core_20260916(
    target_event_id,
    sample_lat,
    sample_lng,
    sample_accuracy_m,
    sample_speed_mps
  );
end;
$$;

revoke all on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision)
  to authenticated;

commit;
