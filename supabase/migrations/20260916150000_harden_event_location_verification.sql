begin;

-- Return one canonical, conservative interpretation of a GPS sample.  The
-- margin of error is part of the geofence calculation: a fix near the border
-- is valid only when its whole uncertainty radius remains inside the event.
create or replace function public.evaluate_event_location_sample(
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision,
  target_lat double precision,
  target_lng double precision,
  target_radius_m double precision
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  normalized_radius_m double precision := greatest(50, coalesce(target_radius_m, 250));
  maximum_accuracy_m double precision;
  distance_value double precision;
  accuracy_valid boolean;
  inside_value boolean;
begin
  if sample_lat is null or sample_lng is null
    or sample_lat not between -90 and 90
    or sample_lng not between -180 and 180
  then
    raise exception 'Coordinate GPS non valide';
  end if;
  if target_lat is null or target_lng is null
    or target_lat not between -90 and 90
    or target_lng not between -180 and 180
  then
    raise exception 'Coordinate evento non configurate';
  end if;

  maximum_accuracy_m := least(100, greatest(35, normalized_radius_m / 2.0));
  accuracy_valid := sample_accuracy_m is not null
    and sample_accuracy_m >= 0
    and sample_accuracy_m <= maximum_accuracy_m;
  distance_value := public.event_distance_m(sample_lat, sample_lng, target_lat, target_lng);
  inside_value := accuracy_valid
    and distance_value is not null
    and distance_value + sample_accuracy_m <= normalized_radius_m;

  return jsonb_build_object(
    'distance_m', distance_value,
    'accuracy_m', sample_accuracy_m,
    'maximum_accuracy_m', maximum_accuracy_m,
    'radius_m', normalized_radius_m,
    'accuracy_valid', accuracy_valid,
    'inside_radius', inside_value,
    'verified_distance_m', case
      when accuracy_valid and distance_value is not null then distance_value + sample_accuracy_m
      else null
    end
  );
end;
$$;

revoke all on function public.evaluate_event_location_sample(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) from public, anon, authenticated;

-- Preserve the established reward and accounting implementations behind
-- server-side validation wrappers.  The core functions are no longer callable
-- by app clients directly.
alter function public.start_event_gps_checkin(uuid, double precision, double precision, double precision)
  rename to start_event_gps_checkin_core_20260916;
alter function public.record_event_presence(uuid, double precision, double precision, double precision, double precision)
  rename to record_event_presence_core_20260916;
alter function public.scan_event_participant_qr(uuid, text, double precision, double precision, double precision)
  rename to scan_event_participant_qr_core_20260916;
alter function public.issue_event_host_qr(uuid)
  rename to issue_event_host_qr_core_20260916;
alter function public.scan_event_host_qr(uuid, text)
  rename to scan_event_host_qr_core_20260916;

revoke all on function public.start_event_gps_checkin_core_20260916(uuid, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.record_event_presence_core_20260916(uuid, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.scan_event_participant_qr_core_20260916(uuid, text, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.issue_event_host_qr_core_20260916(uuid)
  from public, anon, authenticated;
revoke all on function public.scan_event_host_qr_core_20260916(uuid, text)
  from public, anon, authenticated;

create or replace function public.start_event_gps_checkin(
  target_event_id uuid,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  proof jsonb;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  closes_at := coalesce(
    target_event.checkin_closes_at,
    target_event.starts_at + make_interval(mins => greatest(15, coalesce(target_event.checkin_grace_minutes, 15)))
  );
  if clock_timestamp() < opens_at or clock_timestamp() > closes_at then
    raise exception 'La finestra di check-in non e aperta';
  end if;

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

  return public.start_event_gps_checkin_core_20260916(
    target_event_id,
    sample_lat,
    sample_lng,
    sample_accuracy_m
  );
end;
$$;

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
  target_event public.events%rowtype;
  proof jsonb;
  opens_at timestamptz;
  ends_at_value timestamptz;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  ends_at_value := coalesce(
    target_event.ends_at,
    target_event.starts_at + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)))
  );
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

create or replace function public.scan_event_participant_qr(
  target_event_id uuid,
  submitted_token text,
  organizer_lat double precision default null,
  organizer_lng double precision default null,
  organizer_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  proof jsonb;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  closes_at := coalesce(
    target_event.checkin_closes_at,
    target_event.starts_at + make_interval(mins => greatest(15, coalesce(target_event.checkin_grace_minutes, 15)))
  );
  if clock_timestamp() < opens_at or clock_timestamp() > closes_at then
    raise exception 'Scansione disponibile soltanto durante la finestra check-in';
  end if;

  if target_event.verification_mode in ('geo', 'both') then
    proof := public.evaluate_event_location_sample(
      organizer_lat,
      organizer_lng,
      organizer_accuracy_m,
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

  return public.scan_event_participant_qr_core_20260916(
    target_event_id,
    submitted_token,
    organizer_lat,
    organizer_lng,
    organizer_accuracy_m
  );
end;
$$;

create or replace function public.issue_event_host_qr(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;
  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  closes_at := coalesce(
    target_event.checkin_closes_at,
    target_event.starts_at + make_interval(mins => greatest(15, coalesce(target_event.checkin_grace_minutes, 15)))
  );
  if clock_timestamp() < opens_at or clock_timestamp() > closes_at then
    raise exception 'QR disponibile soltanto durante la finestra check-in';
  end if;
  return public.issue_event_host_qr_core_20260916(target_event_id);
end;
$$;

create or replace function public.scan_event_host_qr(
  target_event_id uuid,
  submitted_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  opens_at timestamptz;
  closes_at timestamptz;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;
  opens_at := coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes');
  closes_at := coalesce(
    target_event.checkin_closes_at,
    target_event.starts_at + make_interval(mins => greatest(15, coalesce(target_event.checkin_grace_minutes, 15)))
  );
  if clock_timestamp() < opens_at or clock_timestamp() > closes_at then
    raise exception 'QR disponibile soltanto durante la finestra check-in';
  end if;
  return public.scan_event_host_qr_core_20260916(target_event_id, submitted_token);
end;
$$;

revoke all on function public.start_event_gps_checkin(uuid, double precision, double precision, double precision)
  from public, anon;
revoke all on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision)
  from public, anon;
revoke all on function public.scan_event_participant_qr(uuid, text, double precision, double precision, double precision)
  from public, anon;
revoke all on function public.issue_event_host_qr(uuid) from public, anon;
revoke all on function public.scan_event_host_qr(uuid, text) from public, anon;

grant execute on function public.start_event_gps_checkin(uuid, double precision, double precision, double precision)
  to authenticated;
grant execute on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision)
  to authenticated;
grant execute on function public.scan_event_participant_qr(uuid, text, double precision, double precision, double precision)
  to authenticated;
grant execute on function public.issue_event_host_qr(uuid) to authenticated;
grant execute on function public.scan_event_host_qr(uuid, text) to authenticated;

-- Background samples remain observable when the signal is weak or the user is
-- outside, but only unambiguously accurate samples can advance attendance.
create or replace function public.record_event_tracking_ping(
  target_event_id uuid,
  client_ping_id_value text,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision default null,
  sample_speed_mps double precision default null,
  client_recorded_at_value timestamptz default now(),
  sample_source_value text default 'foreground'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_tracking_sessions%rowtype;
  effective_recorded_at timestamptz;
  distance_value double precision;
  inside_value boolean;
  location_proof jsonb;
  inserted_count integer := 0;
  presence_result jsonb := '{}'::jsonb;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if nullif(trim(client_ping_id_value), '') is null then raise exception 'Identificativo campione non valido'; end if;

  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  select * into session_row
  from public.event_tracking_sessions
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found or session_row.status <> 'active' then
    raise exception 'Monitoraggio evento non attivo';
  end if;

  effective_recorded_at := coalesce(client_recorded_at_value, now());
  if effective_recorded_at > now() + interval '2 minutes' then
    raise exception 'Data del campione non valida';
  end if;
  if effective_recorded_at < session_row.started_at - interval '5 minutes'
    or effective_recorded_at > session_row.expected_end_at + interval '5 minutes'
  then
    raise exception 'Campione fuori dalla finestra evento';
  end if;

  location_proof := public.evaluate_event_location_sample(
    sample_lat,
    sample_lng,
    sample_accuracy_m,
    target_event.lat,
    target_event.lng,
    target_event.geofence_radius_m
  );
  distance_value := (location_proof ->> 'distance_m')::double precision;
  inside_value := coalesce((location_proof ->> 'inside_radius')::boolean, false);

  insert into public.event_location_pings (
    client_ping_id, event_id, user_id, role_key, lat, lng,
    accuracy_m, speed_mps, distance_m, is_in_radius, sample_source, client_recorded_at
  ) values (
    left(trim(client_ping_id_value), 120), target_event_id, actor_id, session_row.role_key,
    sample_lat, sample_lng, sample_accuracy_m, sample_speed_mps,
    coalesce(distance_value, 0), inside_value,
    case when sample_source_value in ('foreground', 'background', 'resume', 'offline')
      then sample_source_value else 'background' end,
    effective_recorded_at
  )
  on conflict (user_id, client_ping_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    insert into public.event_presence_samples (
      event_id, user_id, sample_role, lat, lng, accuracy_m,
      speed_mps, distance_m, is_in_radius, recorded_at
    ) values (
      target_event_id, actor_id, session_row.role_key, sample_lat, sample_lng,
      sample_accuracy_m, sample_speed_mps, coalesce(distance_value, 0),
      inside_value, effective_recorded_at
    );

    update public.event_tracking_sessions set
      last_ping_at = effective_recorded_at,
      valid_ping_count = valid_ping_count + case when inside_value then 1 else 0 end,
      outside_ping_count = outside_ping_count + case when inside_value then 0 else 1 end,
      last_distance_m = distance_value,
      last_accuracy_m = sample_accuracy_m,
      updated_at = now()
    where event_id = target_event_id and user_id = actor_id
    returning * into session_row;

    if inside_value and effective_recorded_at >= now() - interval '2 minutes' then
      begin
        presence_result := public.record_event_presence(
          target_event_id,
          sample_lat,
          sample_lng,
          sample_accuracy_m,
          sample_speed_mps
        );
      exception when others then
        presence_result := jsonb_build_object('presence_warning', sqlerrm);
      end;
    end if;
  end if;

  if now() >= session_row.expected_end_at then
    update public.event_tracking_sessions set
      status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where event_id = target_event_id and user_id = actor_id
    returning * into session_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', inserted_count = 0,
    'tracking_status', session_row.status,
    'last_ping_at', session_row.last_ping_at,
    'valid_ping_count', session_row.valid_ping_count,
    'outside_ping_count', session_row.outside_ping_count,
    'inside_radius', inside_value,
    'distance_m', round(coalesce(distance_value, 0)::numeric, 1),
    'maximum_accuracy_m', (location_proof ->> 'maximum_accuracy_m')::double precision,
    'expected_end_at', session_row.expected_end_at
  ) || presence_result;
end;
$$;

revoke all on function public.record_event_tracking_ping(
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  timestamptz,
  text
) from public, anon;
grant execute on function public.record_event_tracking_ping(
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  timestamptz,
  text
) to authenticated;

commit;
