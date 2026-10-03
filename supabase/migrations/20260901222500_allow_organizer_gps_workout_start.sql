begin;

-- L'organizzatore puo avviare la scheda dopo almeno una verifica reale:
-- QR di un partecipante oppure presenza GPS recente dentro il geofence.
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
  session_row public.event_workout_sessions%rowtype;
  organizer_gps_verified boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if target_event.creator_id = actor_id then
    role_value := 'organizer';

    select exists (
      select 1
      from public.event_presence_samples sample
      where sample.event_id = target_event_id
        and sample.user_id = actor_id
        and sample.sample_role = 'organizer'
        and sample.is_in_radius
        and sample.recorded_at >= now() - interval '10 minutes'
    ) into organizer_gps_verified;

    if not target_event.is_personal
      and not organizer_gps_verified
      and not exists (
        select 1
        from public.event_checkins checkin
        where checkin.event_id = target_event_id
      )
    then
      raise exception 'Scannerizza il QR di un partecipante oppure conferma la geolocalizzazione';
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
  end if;

  insert into public.event_workout_sessions (event_id, user_id, role_key)
  values (target_event_id, actor_id, role_value)
  on conflict (event_id, user_id) do update
  set updated_at = now()
  returning * into session_row;

  return to_jsonb(session_row);
end;
$$;

revoke all on function public.start_event_workout(uuid) from public, anon;
grant execute on function public.start_event_workout(uuid) to authenticated;

commit;
