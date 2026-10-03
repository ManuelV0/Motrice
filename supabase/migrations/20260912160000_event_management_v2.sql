begin;

alter table public.events
  add column if not exists organizer_notes text not null default '',
  add column if not exists organizer_alert text not null default '',
  add column if not exists cover_image_url text not null default '';

do $$
begin
  alter table public.events
    add constraint events_organizer_notes_check check (char_length(organizer_notes) <= 800);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_organizer_alert_check check (char_length(organizer_alert) <= 280);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_cover_image_url_check check (char_length(cover_image_url) <= 2048);
exception when duplicate_object then null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_covers_public_read on storage.objects;
create policy event_covers_public_read
on storage.objects for select
using (bucket_id = 'event-covers');

drop policy if exists event_covers_insert_own_folder on storage.objects;
create policy event_covers_insert_own_folder
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists event_covers_update_own_folder on storage.objects;
create policy event_covers_update_own_folder
on storage.objects for update
to authenticated
using (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists event_covers_delete_own_folder on storage.objects;
create policy event_covers_delete_own_folder
on storage.objects for delete
to authenticated
using (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.prevent_published_event_core_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role'
    or current_setting('motrice.managed_event_update', true) = 'on'
  then
    return new;
  end if;

  raise exception 'Questa modifica richiede il flusso protetto Gestisci evento';
end;
$$;

create or replace function public.enforce_event_management_window()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  current_grace integer := coalesce(old.checkin_grace_minutes, 15);
  occupied_count integer := 1;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if old.status <> 'scheduled' or old.lifecycle_state in ('cancelled', 'completed', 'archived') then
    raise exception 'Questo evento non è più modificabile';
  end if;

  select greatest(1, count(*))::integer into occupied_count
  from public.event_participants participant
  where participant.event_id = old.id
    and participant.status in ('going', 'completed');

  if (new.description is distinct from old.description
      or new.organizer_notes is distinct from old.organizer_notes
      or new.cover_image_url is distinct from old.cover_image_url)
    and now() >= old.starts_at
  then
    raise exception 'Descrizione, indicazioni e immagine non sono più modificabili dopo l inizio';
  end if;

  if (new.duration_minutes is distinct from old.duration_minutes
      or new.max_participants is distinct from old.max_participants
      or new.required_level is distinct from old.required_level
      or new.scheda_id is distinct from old.scheda_id)
    and now() > old.starts_at - interval '2 hours'
  then
    raise exception 'Questa modifica è consentita fino a 2 ore prima dell inizio';
  end if;

  if new.max_participants is distinct from old.max_participants
    and new.max_participants < greatest(2, occupied_count)
  then
    raise exception 'I posti non possono essere inferiori alle presenze già confermate';
  end if;

  if new.required_level is distinct from old.required_level
    and occupied_count > 1
    and new.required_level <> 'all'
  then
    raise exception 'Con partecipanti confermati puoi soltanto rendere il livello aperto a tutti';
  end if;

  if new.scheda_id is distinct from old.scheda_id
    and new.scheda_id is not null
    and not exists (
      select 1
      from public.personal_workout_plans plan
      where plan.id = new.scheda_id
        and plan.user_id = old.creator_id
    )
  then
    raise exception 'Puoi allegare soltanto una tua scheda personale';
  end if;

  if new.organizer_alert is distinct from old.organizer_alert
    and now() >= old.starts_at + make_interval(mins => greatest(15, old.duration_minutes))
  then
    raise exception 'La finestra per gli aggiornamenti urgenti è terminata';
  end if;

  if new.checkin_grace_minutes is distinct from old.checkin_grace_minutes then
    if coalesce(old.is_personal, false) then
      raise exception 'La tolleranza ritardi non è prevista per gli eventi personali';
    end if;
    if new.checkin_grace_minutes is null or new.checkin_grace_minutes not in (15, 20, 30) then
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
before update of
  description,
  duration_minutes,
  checkin_grace_minutes,
  max_participants,
  required_level,
  scheda_id,
  organizer_notes,
  organizer_alert,
  cover_image_url
on public.events
for each row execute function public.enforce_event_management_window();

create or replace function public.update_managed_event_v2(
  target_event_id uuid,
  requested_description text,
  requested_duration_minutes integer,
  requested_grace_minutes integer,
  requested_max_participants integer,
  requested_level text,
  requested_notes text,
  requested_alert text,
  requested_cover_image_url text,
  requested_workout_plan_id uuid
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
  normalized_notes text := btrim(coalesce(requested_notes, ''));
  normalized_alert text := btrim(coalesce(requested_alert, ''));
  normalized_cover text := btrim(coalesce(requested_cover_image_url, ''));
  normalized_level text := lower(btrim(coalesce(requested_level, '')));
  occupied_count integer := 1;
  change_labels text[] := array[]::text[];
  notification_title text := 'Evento aggiornato';
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

  select greatest(1, count(*))::integer into occupied_count
  from public.event_participants participant
  where participant.event_id = target_event_id
    and participant.status in ('going', 'completed');

  if char_length(normalized_description) between 1 and 19 then
    raise exception 'La descrizione deve contenere almeno 20 caratteri oppure restare vuota';
  end if;
  if char_length(normalized_description) > 2000 then raise exception 'Descrizione troppo lunga'; end if;
  if char_length(normalized_notes) > 800 then raise exception 'Indicazioni troppo lunghe'; end if;
  if char_length(normalized_alert) > 280 then raise exception 'Aggiornamento urgente troppo lungo'; end if;
  if char_length(normalized_cover) > 2048 then raise exception 'URL immagine non valido'; end if;
  if requested_duration_minutes is null or requested_duration_minutes not between 15 and 360 then
    raise exception 'La durata deve essere compresa tra 15 e 360 minuti';
  end if;
  if requested_max_participants is null
    or requested_max_participants not between greatest(2, occupied_count) and 500
  then
    raise exception 'Numero di posti non valido rispetto alle presenze confermate';
  end if;
  if normalized_level not in ('beginner', 'intermediate', 'advanced', 'all') then
    raise exception 'Livello richiesto non valido';
  end if;
  if not coalesce(target_event.is_personal, false)
    and (requested_grace_minutes is null or requested_grace_minutes not in (15, 20, 30))
  then
    raise exception 'La tolleranza può essere di 15, 20 o 30 minuti';
  end if;
  if requested_workout_plan_id is not null and not exists (
    select 1 from public.personal_workout_plans plan
    where plan.id = requested_workout_plan_id and plan.user_id = actor_id
  ) then
    raise exception 'Puoi allegare soltanto una tua scheda personale';
  end if;

  if normalized_description is distinct from btrim(coalesce(target_event.description, '')) then
    change_labels := array_append(change_labels, 'descrizione');
  end if;
  if requested_duration_minutes is distinct from target_event.duration_minutes then
    change_labels := array_append(change_labels, 'durata');
  end if;
  if not coalesce(target_event.is_personal, false)
    and requested_grace_minutes is distinct from target_event.checkin_grace_minutes
  then
    change_labels := array_append(change_labels, 'tolleranza ritardi');
  end if;
  if requested_max_participants is distinct from target_event.max_participants then
    change_labels := array_append(change_labels, 'posti disponibili');
  end if;
  if normalized_level is distinct from target_event.required_level then
    change_labels := array_append(change_labels, 'livello richiesto');
  end if;
  if normalized_notes is distinct from btrim(coalesce(target_event.organizer_notes, '')) then
    change_labels := array_append(change_labels, 'indicazioni pratiche');
  end if;
  if normalized_alert is distinct from btrim(coalesce(target_event.organizer_alert, '')) then
    change_labels := array_append(change_labels, 'aggiornamento urgente');
  end if;
  if normalized_cover is distinct from btrim(coalesce(target_event.cover_image_url, '')) then
    change_labels := array_append(change_labels, 'immagine evento');
  end if;
  if requested_workout_plan_id is distinct from target_event.scheda_id then
    change_labels := array_append(change_labels, 'scheda di allenamento');
  end if;

  perform set_config('motrice.managed_event_update', 'on', true);

  update public.events
  set description = normalized_description,
      duration_minutes = requested_duration_minutes,
      checkin_grace_minutes = case
        when coalesce(target_event.is_personal, false) then target_event.checkin_grace_minutes
        else requested_grace_minutes
      end,
      max_participants = requested_max_participants,
      required_level = normalized_level,
      organizer_notes = normalized_notes,
      organizer_alert = normalized_alert,
      cover_image_url = normalized_cover,
      scheda_id = requested_workout_plan_id,
      updated_at = now()
  where id = target_event_id;

  if cardinality(change_labels) > 0 then
    if 'aggiornamento urgente' = any(change_labels) and normalized_alert <> '' then
      notification_title := 'Aggiornamento urgente';
      notification_body := normalized_alert;
    else
      notification_body := format(
        '%s: modifica a %s. Controlla i dettagli aggiornati.',
        target_event.title,
        array_to_string(change_labels, ', ')
      );
    end if;

    insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
    select
      participant.user_id,
      actor_id,
      target_event_id,
      'event_updated',
      notification_title,
      notification_body,
      jsonb_build_object(
        'changes', to_jsonb(change_labels),
        'urgent', notification_title = 'Aggiornamento urgente'
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

revoke all on function public.update_managed_event_v2(
  uuid, text, integer, integer, integer, text, text, text, text, uuid
) from public, anon;
grant execute on function public.update_managed_event_v2(
  uuid, text, integer, integer, integer, text, text, text, text, uuid
) to authenticated;

comment on function public.update_managed_event_v2(
  uuid, text, integer, integer, integer, text, text, text, text, uuid
) is 'Aggiorna soltanto gli elementi adattabili di un evento rispettando finestre temporali e partecipanti confermati.';

-- Canonical organizer deletion. The events_money_cancelled trigger restores every
-- balance/trial from event_money_holds; this function deliberately avoids the
-- legacy wallet tables retained only for compatibility with older APKs.
create or replace function public.cancel_event(
  target_event_id uuid,
  reason_code text,
  organizer_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  safe_reason text := lower(btrim(coalesce(reason_code, '')));
  safe_note text := left(btrim(coalesce(organizer_note, '')), 500);
  reason_label text;
  late_cancellation boolean;
  refunded_participants integer := 0;
  refunded_cents bigint := 0;
  notified_users integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere per eliminare un evento'; end if;
  if safe_reason not in (
    'personal', 'weather', 'venue_unavailable',
    'insufficient_participants', 'emergency', 'other'
  ) then
    raise exception 'Seleziona un motivo valido per eliminare l evento';
  end if;

  select * into target_event
  from public.events event_row
  where event_row.id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore può eliminare questo evento';
  end if;
  if target_event.status = 'cancelled' then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'cancelled_at', target_event.cancelled_at,
      'refunded_participants', 0,
      'refunded_cents', 0,
      'is_late', target_event.cancellation_is_late
    );
  end if;
  if target_event.status <> 'scheduled' then
    raise exception 'Puoi eliminare soltanto un evento programmato';
  end if;
  if target_event.starts_at <= now() then
    raise exception 'L evento è già iniziato: chiudilo dalla gestione presenze';
  end if;

  late_cancellation := target_event.starts_at < now() + interval '24 hours';
  reason_label := case safe_reason
    when 'personal' then 'motivi personali'
    when 'weather' then 'condizioni meteo'
    when 'venue_unavailable' then 'luogo non disponibile'
    when 'insufficient_participants' then 'partecipanti insufficienti'
    when 'emergency' then 'emergenza'
    else 'altro motivo'
  end;

  select count(*), coalesce(sum(hold.amount_cents), 0)
  into refunded_participants, refunded_cents
  from public.event_money_holds hold
  where hold.event_id = target_event_id
    and hold.status in ('trial', 'locked');

  with recipients as (
    select participant.user_id
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.status in ('going', 'completed')
    union
    select request.user_id
    from public.event_join_requests request
    where request.event_id = target_event_id
      and request.status = 'pending'
  ), inserted as (
    insert into public.notifications (
      user_id, actor_id, event_id, type, title, body, payload
    )
    select
      recipient.user_id,
      actor_id,
      target_event_id,
      'event_cancelled',
      'Evento eliminato',
      left(
        target_event.title || ' è stato eliminato per ' || reason_label
        || case when safe_note <> '' then '. ' || safe_note else '' end,
        500
      ),
      jsonb_build_object(
        'reason', safe_reason,
        'note', safe_note,
        'full_refund', true,
        'cancelled_at', now(),
        'starts_at', target_event.starts_at
      )
    from recipients recipient
    where recipient.user_id <> actor_id
    returning 1
  )
  select count(*) into notified_users from inserted;

  -- This status change activates the canonical, idempotent money restoration
  -- trigger defined by the money flow migration.
  update public.events
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_id,
      cancellation_reason = safe_reason,
      cancellation_note = safe_note,
      cancellation_is_late = late_cancellation,
      updated_at = now()
  where id = target_event_id;

  update public.event_participants
  set status = 'cancelled',
      stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
      cashback_percent = 0,
      updated_at = now()
  where event_id = target_event_id
    and status in ('going', 'completed');

  update public.event_join_requests
  set status = 'cancelled',
      decided_at = now(),
      decided_by = actor_id,
      updated_at = now()
  where event_id = target_event_id
    and status = 'pending';

  delete from public.event_participant_qr_tokens where event_id = target_event_id;
  delete from public.event_checkin_sessions where event_id = target_event_id;
  delete from public.event_host_qr_sessions where event_id = target_event_id;

  return jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'cancelled_at', now(),
    'refunded_participants', refunded_participants,
    'refunded_cents', refunded_cents,
    'notified_users', notified_users,
    'is_late', late_cancellation
  );
end;
$$;

revoke all on function public.cancel_event(uuid, text, text) from public, anon;
grant execute on function public.cancel_event(uuid, text, text) to authenticated;

comment on function public.cancel_event(uuid, text, text) is
  'Elimina logicamente un evento futuro, ripristina trial e credito tramite il ledger canonico e conserva lo storico di audit.';

commit;
