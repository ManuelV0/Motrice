begin;

-- Published events keep their identity stable. Organizers may only change the
-- description, duration and late check-in tolerance through the guarded flow.
create or replace function public.prevent_published_event_core_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  raise exception 'Dopo la pubblicazione puoi modificare solo descrizione, durata e tolleranza ritardi';
end;
$$;

drop trigger if exists events_04_lock_published_core_fields on public.events;
create trigger events_04_lock_published_core_fields
before update of
  creator_id,
  sport_id,
  title,
  city,
  location_name,
  lat,
  lng,
  starts_at,
  max_participants,
  required_level,
  route_info,
  deposit_cents,
  audience,
  participation_protection,
  visibility,
  join_policy,
  is_personal,
  scheda_id,
  verification_mode,
  geofence_radius_m,
  completion_xp,
  review_bonus_xp,
  minimum_presence_minutes
on public.events
for each row execute function public.prevent_published_event_core_changes();

create or replace function public.enforce_event_management_window()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_grace integer := coalesce(old.checkin_grace_minutes, 15);
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if old.status <> 'scheduled' or old.lifecycle_state in ('cancelled', 'completed', 'archived') then
    raise exception 'Questo evento non è più modificabile';
  end if;

  if new.description is distinct from old.description and now() >= old.starts_at then
    raise exception 'La descrizione non è più modificabile dopo l inizio dell evento';
  end if;

  if new.duration_minutes is distinct from old.duration_minutes
    and now() > old.starts_at - interval '2 hours'
  then
    raise exception 'La durata è modificabile fino a 2 ore prima dell inizio';
  end if;

  if new.checkin_grace_minutes is distinct from old.checkin_grace_minutes then
    if coalesce(old.is_personal, false) then
      raise exception 'La tolleranza ritardi non è prevista per gli eventi personali';
    end if;
    if new.checkin_grace_minutes is null
      or new.checkin_grace_minutes not in (15, 20, 30)
    then
      raise exception 'La tolleranza può essere di 15, 20 o 30 minuti';
    end if;
    if now() >= old.starts_at then
      if now() > old.starts_at + interval '30 minutes' then
        raise exception 'La finestra massima per modificare la tolleranza è terminata';
      end if;
      if new.checkin_grace_minutes <= current_grace then
        raise exception 'Dopo l inizio puoi soltanto aumentare la tolleranza';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists events_05_enforce_management_window on public.events;
create trigger events_05_enforce_management_window
before update of description, duration_minutes, checkin_grace_minutes
on public.events
for each row execute function public.enforce_event_management_window();

create or replace function public.update_managed_event(
  target_event_id uuid,
  requested_description text,
  requested_duration_minutes integer,
  requested_grace_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  normalized_description text := btrim(coalesce(requested_description, ''));
  description_changed boolean;
  duration_changed boolean;
  grace_changed boolean;
  change_labels text[] := array[]::text[];
  notification_body text;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events event_row
  where event_row.id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore può modificare questo evento';
  end if;
  if target_event.status <> 'scheduled' then
    raise exception 'Questo evento non è più modificabile';
  end if;
  if char_length(normalized_description) between 1 and 19 then
    raise exception 'La descrizione deve contenere almeno 20 caratteri oppure restare vuota';
  end if;
  if char_length(normalized_description) > 2000 then
    raise exception 'La descrizione può contenere massimo 2000 caratteri';
  end if;
  if requested_duration_minutes is null or requested_duration_minutes not between 15 and 360 then
    raise exception 'La durata deve essere compresa tra 15 e 360 minuti';
  end if;
  if not coalesce(target_event.is_personal, false)
    and (
      requested_grace_minutes is null
      or requested_grace_minutes not in (15, 20, 30)
    )
  then
    raise exception 'La tolleranza può essere di 15, 20 o 30 minuti';
  end if;

  description_changed := normalized_description is distinct from btrim(coalesce(target_event.description, ''));
  duration_changed := requested_duration_minutes is distinct from target_event.duration_minutes;
  grace_changed := not coalesce(target_event.is_personal, false)
    and requested_grace_minutes is distinct from target_event.checkin_grace_minutes;

  update public.events
  set description = normalized_description,
      duration_minutes = requested_duration_minutes,
      checkin_grace_minutes = case
        when coalesce(target_event.is_personal, false) then target_event.checkin_grace_minutes
        else requested_grace_minutes
      end,
      updated_at = now()
  where id = target_event_id;

  if description_changed then change_labels := array_append(change_labels, 'descrizione'); end if;
  if duration_changed then change_labels := array_append(change_labels, 'durata'); end if;
  if grace_changed then change_labels := array_append(change_labels, 'tolleranza ritardi'); end if;

  if cardinality(change_labels) > 0 then
    notification_body := format(
      '%s: modifica a %s. Controlla i dettagli aggiornati.',
      target_event.title,
      array_to_string(change_labels, ', ')
    );

    insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
    select
      participant.user_id,
      actor_id,
      target_event_id,
      'event_updated',
      'Evento aggiornato',
      notification_body,
      jsonb_build_object(
        'changes', to_jsonb(change_labels),
        'duration_minutes', requested_duration_minutes,
        'checkin_grace_minutes', requested_grace_minutes
      )
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id <> actor_id
      and participant.status in ('going', 'completed');
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', target_event_id,
    'changes', to_jsonb(change_labels)
  );
end;
$$;

revoke all on function public.update_managed_event(uuid, text, integer, integer) from public, anon;
grant execute on function public.update_managed_event(uuid, text, integer, integer) to authenticated;

commit;
