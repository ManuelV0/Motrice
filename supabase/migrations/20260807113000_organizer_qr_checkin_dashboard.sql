-- Organizer-first participant QR validation.
-- Keeps validation, attendance and XP assignment in one atomic transaction.

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
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  qr_row public.event_participant_qr_tokens%rowtype;
  participant public.event_participants%rowtype;
  participant_name text := 'Partecipante';
  normalized_token text := trim(coalesce(submitted_token, ''));
  valid_from timestamptz;
  valid_until timestamptz;
  existing_checkin_at timestamptz;
  distance_from_event double precision := 0;
  xp_result jsonb := '{}'::jsonb;
  xp_awarded integer := 0;
begin
  if actor_id is null then
    raise exception 'Devi accedere per scansionare';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then
    raise exception 'Evento non trovato';
  end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo scansionare i partecipanti';
  end if;
  if normalized_token = '' then
    raise exception 'QR non valido';
  end if;

  -- Search globally first so the UI can distinguish an unknown token from a
  -- perfectly valid token issued for another event.
  select * into qr_row
  from public.event_participant_qr_tokens qr
  where qr.token = normalized_token;

  if not found then
    raise exception 'QR non valido';
  end if;
  if qr_row.event_id <> target_event_id then
    raise exception 'QR appartenente ad un altro evento';
  end if;

  valid_from := target_event.starts_at - interval '30 minutes';
  valid_until := target_event.starts_at
    + make_interval(mins => target_event.duration_minutes::integer)
    + interval '30 minutes';

  if qr_row.expires_at <= now() or now() < valid_from or now() > valid_until then
    raise exception 'QR scaduto';
  end if;
  if qr_row.user_id = actor_id then
    raise exception 'Non puoi scansionare il tuo QR';
  end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id
    and user_id = qr_row.user_id
  for update;

  if not found or participant.status not in ('going', 'completed') then
    raise exception 'QR non valido';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Partecipante')
  into participant_name
  from public.profiles profile
  where profile.id = qr_row.user_id;

  participant_name := coalesce(participant_name, 'Partecipante');

  select checkin.checked_in_at
  into existing_checkin_at
  from public.event_checkins checkin
  where checkin.event_id = target_event_id
    and checkin.user_id = qr_row.user_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_checked',
      'already_checked', true,
      'participant_id', qr_row.user_id,
      'participant_name', participant_name,
      'checked_in_at', existing_checkin_at,
      'xp_awarded', 0,
      'valid_from', valid_from,
      'valid_until', valid_until
    );
  end if;

  if target_event.verification_mode in ('geo', 'both') then
    if organizer_lat is null or organizer_lng is null then
      raise exception 'Posizione organizzatore necessaria per la scansione';
    end if;
    if target_event.lat is null or target_event.lng is null then
      raise exception 'Coordinate evento non configurate';
    end if;

    distance_from_event := public.event_distance_m(
      organizer_lat,
      organizer_lng,
      target_event.lat,
      target_event.lng
    );
    if distance_from_event > target_event.geofence_radius_m then
      raise exception 'Sei fuori dall area dell evento';
    end if;
  end if;

  insert into public.event_checkins (event_id, user_id, checked_in_at, source)
  values (target_event_id, qr_row.user_id, now(), 'organizer');

  update public.event_participants
  set
    checked_in_at = coalesce(checked_in_at, now()),
    checked_in_by = actor_id,
    checkin_lat = organizer_lat,
    checkin_lng = organizer_lng,
    cashback_percent = greatest(cashback_percent, 60),
    stake_status = case
      when stake_status = 'locked' then 'verified'
      else stake_status
    end,
    updated_at = now()
  where event_id = target_event_id
    and user_id = qr_row.user_id;

  xp_result := public.apply_xp_reward(
    qr_row.user_id,
    'event_checkin',
    20,
    0,
    coalesce(target_event.sport_id::text, 'generic'),
    'event_checkin:' || target_event_id::text || ':' || qr_row.user_id::text,
    jsonb_build_object(
      'eventId', target_event_id,
      'organizerUserId', actor_id,
      'source', 'organizer_qr_scan'
    )
  );
  xp_awarded := coalesce((xp_result ->> 'points')::integer, 0);

  if organizer_lat is not null and organizer_lng is not null then
    insert into public.event_presence_samples (
      event_id,
      user_id,
      sample_role,
      lat,
      lng,
      accuracy_m,
      speed_mps,
      distance_m,
      is_in_radius
    )
    values (
      target_event_id,
      actor_id,
      'organizer',
      organizer_lat,
      organizer_lng,
      organizer_accuracy_m,
      null,
      coalesce(distance_from_event, 0),
      target_event.verification_mode = 'qr'
        or coalesce(distance_from_event, 0) <= target_event.geofence_radius_m
    );
  end if;

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    qr_row.user_id,
    actor_id,
    target_event_id,
    'event_checkin_verified',
    'Presenza verificata',
    'Check-in completato: cashback al 60% e +' || xp_awarded::text || ' XP.',
    jsonb_build_object('cashback_percent', 60, 'xp_awarded', xp_awarded)
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'checked_in',
    'already_checked', false,
    'participant_id', qr_row.user_id,
    'participant_name', participant_name,
    'cashback_percent', 60,
    'checked_in_at', now(),
    'xp_awarded', xp_awarded,
    'distance_m', round(coalesce(distance_from_event, 0)::numeric, 1),
    'valid_from', valid_from,
    'valid_until', valid_until
  );
end;
$$;

revoke all on function public.scan_event_participant_qr(
  uuid,
  text,
  double precision,
  double precision,
  double precision
) from public, anon;

grant execute on function public.scan_event_participant_qr(
  uuid,
  text,
  double precision,
  double precision,
  double precision
) to authenticated;
