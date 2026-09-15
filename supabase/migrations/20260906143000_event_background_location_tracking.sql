begin;

create table if not exists public.event_tracking_sessions (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in ('participant', 'organizer')),
  status text not null default 'active' check (status in ('active', 'completed', 'interrupted', 'expired')),
  verification_method text not null default 'gps' check (verification_method in ('gps', 'qr_gps')),
  device_platform text not null default 'web',
  expected_end_at timestamptz not null,
  started_at timestamptz not null default now(),
  last_ping_at timestamptz,
  completed_at timestamptz,
  interrupted_at timestamptz,
  interruption_reason text,
  valid_ping_count integer not null default 0 check (valid_ping_count >= 0),
  outside_ping_count integer not null default 0 check (outside_ping_count >= 0),
  last_distance_m numeric(10,2),
  last_accuracy_m numeric(8,2),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.event_location_pings (
  id bigint generated always as identity primary key,
  client_ping_id text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in ('participant', 'organizer')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m numeric(8,2),
  speed_mps numeric(8,2),
  distance_m numeric(10,2) not null,
  is_in_radius boolean not null,
  sample_source text not null default 'foreground'
    check (sample_source in ('foreground', 'background', 'resume', 'offline')),
  client_recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (user_id, client_ping_id)
);

create index if not exists event_tracking_sessions_active_idx
  on public.event_tracking_sessions(user_id, status, expected_end_at desc);
create index if not exists event_location_pings_event_user_time_idx
  on public.event_location_pings(event_id, user_id, client_recorded_at desc);

alter table public.event_tracking_sessions enable row level security;
alter table public.event_location_pings enable row level security;

drop policy if exists event_tracking_sessions_read_own on public.event_tracking_sessions;
create policy event_tracking_sessions_read_own
on public.event_tracking_sessions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists event_location_pings_read_own on public.event_location_pings;
create policy event_location_pings_read_own
on public.event_location_pings for select
to authenticated
using (user_id = auth.uid());

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
  if role_value = 'participant' and not exists (
    select 1 from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed')
      and participant.checked_in_at is not null
  ) then
    raise exception 'Verifica prima la presenza';
  end if;

  expected_end := coalesce(
    target_event.ends_at,
    target_event.starts_at + make_interval(mins => greatest(1, coalesce(target_event.duration_minutes, 120)))
  );
  if now() < coalesce(target_event.checkin_opens_at, target_event.starts_at - interval '30 minutes') then
    raise exception 'Il monitoraggio si attiva con l apertura del check-in';
  end if;
  if now() > expected_end + interval '5 minutes' then
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
    now(),
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
    completed_at = null,
    interrupted_at = null,
    interruption_reason = null,
    updated_at = now()
  returning * into session_row;

  return to_jsonb(session_row);
end;
$$;

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
  inserted_count integer := 0;
  presence_result jsonb := '{}'::jsonb;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if nullif(trim(client_ping_id_value), '') is null then raise exception 'Identificativo campione non valido'; end if;
  if sample_lat is null or sample_lng is null or sample_lat not between -90 and 90 or sample_lng not between -180 and 180 then
    raise exception 'Coordinate non valide';
  end if;

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

  distance_value := public.event_distance_m(sample_lat, sample_lng, target_event.lat, target_event.lng);
  inside_value := distance_value is not null
    and distance_value <= target_event.geofence_radius_m
    and (sample_accuracy_m is null or sample_accuracy_m <= greatest(100, target_event.geofence_radius_m));

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

    -- I campioni accodati offline conservano la copertura temporale reale, ma
    -- non devono essere scambiati per una prova di presenza "adesso". Solo un
    -- fix recente puo quindi far avanzare cashback e stato dell'evento.
    if effective_recorded_at >= now() - interval '2 minutes' then
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
    'expected_end_at', session_row.expected_end_at
  ) || presence_result;
end;
$$;

create or replace function public.stop_event_location_tracking(
  target_event_id uuid,
  final_status_value text default 'interrupted',
  reason_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.event_tracking_sessions%rowtype;
  status_value text;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  status_value := case when final_status_value in ('completed', 'expired') then final_status_value else 'interrupted' end;

  update public.event_tracking_sessions set
    status = status_value,
    completed_at = case when status_value = 'completed' then coalesce(completed_at, now()) else completed_at end,
    interrupted_at = case when status_value = 'interrupted' then now() else interrupted_at end,
    interruption_reason = case when status_value = 'interrupted' then left(coalesce(reason_value, 'interrotto_dal_client'), 160) else null end,
    updated_at = now()
  where event_id = target_event_id and user_id = actor_id
  returning * into session_row;

  if not found then return jsonb_build_object('ok', true, 'tracking_status', 'not_started'); end if;
  return jsonb_build_object('ok', true, 'tracking_status', session_row.status, 'updated_at', session_row.updated_at);
end;
$$;

revoke all on function public.start_event_location_tracking(uuid, text, text) from public, anon;
revoke all on function public.record_event_tracking_ping(uuid, text, double precision, double precision, double precision, double precision, timestamptz, text) from public, anon;
revoke all on function public.stop_event_location_tracking(uuid, text, text) from public, anon;
grant execute on function public.start_event_location_tracking(uuid, text, text) to authenticated;
grant execute on function public.record_event_tracking_ping(uuid, text, double precision, double precision, double precision, double precision, timestamptz, text) to authenticated;
grant execute on function public.stop_event_location_tracking(uuid, text, text) to authenticated;

commit;
