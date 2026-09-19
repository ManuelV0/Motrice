begin;

-- Creation rules owned by Motrice must not be editable from the client.
-- Organizers can choose a visible late check-in tolerance of 15, 20 or 30 minutes.
create or replace function public.enforce_event_creation_system_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  normalized_duration integer;
  automatic_presence integer;
begin
  normalized_duration := least(360, greatest(15, coalesce(new.duration_minutes, 120)));
  new.duration_minutes := normalized_duration;

  if coalesce(new.is_personal, false) then
    automatic_presence := least(15, normalized_duration);
    new.verification_mode := 'geo';
    new.geofence_radius_m := 250;
    new.checkin_grace_minutes := 0;
    new.completion_xp := 5;
    new.review_bonus_xp := 0;
  else
    automatic_presence := least(
      normalized_duration,
      greatest(15, round(normalized_duration * 2.0 / 3.0)::integer)
    );
    new.verification_mode := 'both';
    new.geofence_radius_m := 250;
    new.checkin_grace_minutes := case
      when coalesce(new.checkin_grace_minutes, 15) <= 17 then 15
      when new.checkin_grace_minutes <= 25 then 20
      else 30
    end;
    new.completion_xp := 50;
    new.review_bonus_xp := 25;
  end if;

  new.minimum_presence_minutes := automatic_presence;
  return new;
end;
$$;

drop trigger if exists events_06_enforce_creation_system_rules on public.events;
create trigger events_06_enforce_creation_system_rules
before insert or update of
  duration_minutes,
  is_personal,
  minimum_presence_minutes,
  verification_mode,
  geofence_radius_m,
  checkin_grace_minutes,
  completion_xp,
  review_bonus_xp
on public.events
for each row execute function public.enforce_event_creation_system_rules();

-- Keep persisted lifecycle deadlines aligned with the organizer-facing policy.
-- The tolerance is independent from the automatic minimum-presence target:
-- arriving late remains possible, while completing the required permanence is
-- still evaluated separately by the participation flow.
create or replace function public.sync_event_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_grace integer;
begin
  effective_grace := case
    when coalesce(new.is_personal, false) then 0
    else least(30, greatest(15, coalesce(new.checkin_grace_minutes, 15)::integer))
  end;

  new.checkin_opens_at := new.starts_at - interval '30 minutes';
  new.checkin_closes_at := new.starts_at + make_interval(mins => effective_grace);
  new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes::integer);

  if new.archived_at is not null then
    new.lifecycle_state := 'archived';
  elsif new.status = 'cancelled' then
    new.lifecycle_state := 'cancelled';
  elsif new.status = 'completed' then
    new.lifecycle_state := 'completed';
  end if;

  if tg_op = 'INSERT' then
    new.lifecycle_version := greatest(1, coalesce(new.lifecycle_version, 0));
    new.lifecycle_updated_at := now();
  elsif new.lifecycle_state is distinct from old.lifecycle_state then
    new.lifecycle_version := old.lifecycle_version + 1;
    new.lifecycle_updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.enforce_event_checkin_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  effective_grace integer;
  valid_from timestamptz;
  valid_until timestamptz;
begin
  select * into target_event
  from public.events
  where id = new.event_id;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then
    raise exception 'La finestra di check-in è chiusa';
  end if;

  effective_grace := case
    when coalesce(target_event.is_personal, false) then 0
    else least(30, greatest(15, coalesce(target_event.checkin_grace_minutes, 15)::integer))
  end;
  valid_from := target_event.starts_at - interval '30 minutes';
  valid_until := target_event.starts_at + make_interval(mins => effective_grace);

  if now() < valid_from then
    raise exception 'Il check-in apre 30 minuti prima dell evento';
  end if;
  if now() > valid_until then
    raise exception 'La finestra di check-in è chiusa';
  end if;

  return new;
end;
$$;

create or replace function public.extend_event_checkin_window(
  target_event_id uuid,
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
  participant_record record;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore può prolungare il check-in';
  end if;
  if target_event.status <> 'scheduled' then
    raise exception 'L evento non è più attivo';
  end if;
  if now() < target_event.starts_at - interval '30 minutes' then
    raise exception 'Puoi modificare la tolleranza da 30 minuti prima dell evento';
  end if;
  if now() > target_event.starts_at + interval '30 minutes' then
    raise exception 'Il limite massimo per il check-in è terminato';
  end if;
  if requested_grace_minutes is null
    or requested_grace_minutes not in (15, 20, 30)
    or requested_grace_minutes <= target_event.checkin_grace_minutes
  then
    raise exception 'La tolleranza può essere aumentata a 15, 20 o 30 minuti';
  end if;

  update public.events
  set checkin_grace_minutes = requested_grace_minutes,
      updated_at = now()
  where id = target_event_id;

  for participant_record in
    select participant.user_id
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.status = 'going'
      and participant.user_id <> actor_id
  loop
    insert into public.notifications (
      user_id, actor_id, event_id, type, title, body, payload
    ) values (
      participant_record.user_id,
      actor_id,
      target_event_id,
      'checkin_window_extended',
      'Check-in prolungato',
      format('Puoi effettuare il check-in fino a %s.', to_char(target_event.starts_at + make_interval(mins => requested_grace_minutes), 'HH24:MI')),
      jsonb_build_object(
        'checkin_grace_minutes', requested_grace_minutes,
        'checkin_closes_at', target_event.starts_at + make_interval(mins => requested_grace_minutes)
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'checkin_grace_minutes', requested_grace_minutes,
    'checkin_closes_at', target_event.starts_at + make_interval(mins => requested_grace_minutes),
    'event_ends_at', target_event.starts_at + make_interval(mins => target_event.duration_minutes::integer)
  );
end;
$$;

-- Normalize existing group events to the same three organizer choices.
update public.events
set checkin_grace_minutes = case
  when checkin_grace_minutes <= 17 then 15
  when checkin_grace_minutes <= 25 then 20
  else 30
end
where not coalesce(is_personal, false);

commit;
