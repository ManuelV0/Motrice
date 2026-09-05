begin;

create or replace function public.start_event_checkin(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  fresh_token text := encode(extensions.gen_random_bytes(24), 'hex');
  start_window timestamptz;
  end_window timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per avviare il check-in';
  end if;

  select *
  into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then
    raise exception 'Evento non trovato';
  end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo avviare il check-in';
  end if;
  if target_event.status <> 'scheduled' then
    raise exception 'Evento non disponibile per il check-in';
  end if;

  start_window := target_event.starts_at - interval '15 minutes';
  end_window := target_event.starts_at
    + make_interval(mins => target_event.duration_minutes::integer)
    + interval '15 minutes';

  insert into public.event_checkin_sessions (
    event_id,
    organizer_id,
    token,
    valid_from,
    expires_at
  )
  values (
    target_event.id,
    actor_id,
    fresh_token,
    start_window,
    end_window
  )
  on conflict (event_id) do update
  set
    organizer_id = excluded.organizer_id,
    token = excluded.token,
    valid_from = excluded.valid_from,
    expires_at = excluded.expires_at,
    updated_at = now();

  return jsonb_build_object(
    'event_id', target_event.id,
    'organizer_user_id', actor_id,
    'token', fresh_token,
    'issued_at', now(),
    'starts_at', start_window,
    'expires_at', end_window,
    'status', case
      when now() < start_window then 'scheduled'
      when now() <= end_window then 'active'
      else 'expired'
    end,
    'can_manage', true
  );
end;
$$;

revoke all on function public.start_event_checkin(uuid) from public, anon;
grant execute on function public.start_event_checkin(uuid) to authenticated;

commit;
