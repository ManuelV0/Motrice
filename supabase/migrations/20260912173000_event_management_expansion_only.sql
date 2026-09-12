begin;

-- Once an event is published, these adjustments may only make the agreement
-- more permissive. The guard also protects calls made outside the current UI.
create or replace function public.enforce_event_management_expansion_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.cover_image_url is distinct from old.cover_image_url then
    raise exception 'L immagine dell evento viene definita alla creazione e non può essere modificata';
  end if;

  if new.scheda_id is distinct from old.scheda_id then
    raise exception 'La scheda di allenamento viene definita alla creazione e non può essere modificata';
  end if;

  if new.duration_minutes is distinct from old.duration_minutes then
    if new.duration_minutes < old.duration_minutes
      or new.duration_minutes > old.duration_minutes + 30
      or mod(new.duration_minutes - old.duration_minutes, 15) <> 0
    then
      raise exception 'La durata può essere soltanto ampliata di 15 o 30 minuti';
    end if;
  end if;

  if new.checkin_grace_minutes is distinct from old.checkin_grace_minutes
    and new.checkin_grace_minutes < old.checkin_grace_minutes
  then
    raise exception 'La tolleranza ritardi può essere soltanto ampliata';
  end if;

  if new.max_participants is distinct from old.max_participants then
    if new.max_participants < old.max_participants
      or new.max_participants > old.max_participants + 3
    then
      raise exception 'I posti disponibili possono essere soltanto ampliati, fino a 3 posti aggiuntivi';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists events_05a_enforce_expansion_only on public.events;
create trigger events_05a_enforce_expansion_only
before update of
  duration_minutes,
  checkin_grace_minutes,
  max_participants,
  scheda_id,
  cover_image_url
on public.events
for each row execute function public.enforce_event_management_expansion_only();

comment on function public.enforce_event_management_expansion_only()
is 'Blocca riduzioni opportunistiche e rende immutabili immagine e scheda dopo la pubblicazione.';

commit;
