begin;

create or replace function public.cancel_personal_event_series(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  occurrence record;
  cancelled_count integer := 0;
  cancellation_time timestamptz := now();
begin
  if actor_id is null then raise exception 'Devi accedere per eliminare una ricorrenza'; end if;

  select * into target_event
  from public.events event_row
  where event_row.id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo il proprietario può eliminare questa ricorrenza';
  end if;
  if not coalesce(target_event.is_personal, false) or target_event.personal_series_id is null then
    raise exception 'Questo evento non appartiene a una ricorrenza personale';
  end if;
  if target_event.status <> 'scheduled' or target_event.starts_at <= cancellation_time then
    raise exception 'Puoi eliminare la ricorrenza soltanto prima dell inizio';
  end if;

  update public.personal_event_series
  set status = 'cancelled', updated_at = cancellation_time
  where id = target_event.personal_series_id
    and creator_id = actor_id;

  for occurrence in
    select event_row.id
    from public.events event_row
    where event_row.personal_series_id = target_event.personal_series_id
      and event_row.creator_id = actor_id
      and event_row.is_personal = true
      and event_row.status = 'scheduled'
      and event_row.starts_at > cancellation_time
    order by event_row.starts_at
    for update
  loop
    update public.events
    set status = 'cancelled',
        cancelled_at = cancellation_time,
        cancelled_by = actor_id,
        cancellation_reason = 'personal',
        cancellation_note = 'Ricorrenza eliminata dal proprietario',
        cancellation_is_late = false,
        updated_at = cancellation_time
    where id = occurrence.id;

    delete from public.event_participant_qr_tokens where event_id = occurrence.id;
    delete from public.event_checkin_sessions where event_id = occurrence.id;
    delete from public.event_host_qr_sessions where event_id = occurrence.id;
    cancelled_count := cancelled_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'scope', 'series',
    'series_id', target_event.personal_series_id,
    'cancelled_occurrences', cancelled_count,
    'cancelled_at', cancellation_time,
    'refunded_participants', 0,
    'refunded_cents', 0,
    'is_late', false
  );
end;
$$;

revoke all on function public.cancel_personal_event_series(uuid) from public, anon;
grant execute on function public.cancel_personal_event_series(uuid) to authenticated;

comment on function public.cancel_personal_event_series(uuid) is
  'Interrompe una serie personale e annulla soltanto le occorrenze future ancora programmate, conservando lo storico.';

commit;
