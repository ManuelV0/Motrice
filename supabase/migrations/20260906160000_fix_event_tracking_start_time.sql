begin;

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

revoke all on function public.start_event_location_tracking(uuid, text, text) from public;
grant execute on function public.start_event_location_tracking(uuid, text, text) to authenticated;

commit;
