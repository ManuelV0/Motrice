begin;

alter table public.events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text not null default '',
  add column if not exists cancellation_is_late boolean not null default false;

do $$
begin
  alter table public.events
    add constraint events_cancellation_reason_check
      check (
        cancellation_reason is null
        or cancellation_reason in (
          'personal',
          'weather',
          'venue_unavailable',
          'insufficient_participants',
          'emergency',
          'other'
        )
      );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_cancellation_note_check
      check (char_length(cancellation_note) <= 500);
exception when duplicate_object then null;
end;
$$;

create index if not exists events_creator_cancelled_idx
  on public.events(creator_id, cancelled_at desc)
  where status = 'cancelled';

-- Avoid one misleading "participant left" notification per attendee while the
-- organizer cancellation transaction marks all memberships as cancelled.
create or replace function public.notify_event_participation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_owner uuid;
  event_title text;
  event_status text;
  participant_name text;
begin
  select creator_id, title, status into event_owner, event_title, event_status
  from public.events
  where id = new.event_id;

  if event_owner is null or event_owner = new.user_id or event_status = 'cancelled' then
    return new;
  end if;

  select display_name into participant_name
  from public.profiles
  where id = new.user_id;

  if new.status = 'going' and (tg_op = 'INSERT' or old.status is distinct from 'going') then
    insert into public.notifications (user_id, actor_id, event_id, type, title, body)
    values (
      event_owner,
      new.user_id,
      new.event_id,
      'participant_joined',
      'Nuovo partecipante',
      coalesce(participant_name, 'Un atleta') || ' partecipa a ' || event_title
    );
  elsif new.status = 'cancelled' and tg_op = 'UPDATE' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, actor_id, event_id, type, title, body)
    values (
      event_owner,
      new.user_id,
      new.event_id,
      'participant_left',
      'Partecipazione annullata',
      coalesce(participant_name, 'Un atleta') || ' ha lasciato ' || event_title
    );
  end if;

  return new;
end;
$$;

create or replace function public.prevent_message_on_cancelled_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.events event
    where event.id = new.event_id
      and event.status = 'cancelled'
  ) then
    raise exception 'EVENT_CANCELLED_READ_ONLY: la chat di questo evento e in sola lettura'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
begin
  create trigger prevent_message_on_cancelled_event
  before insert on public.event_messages
  for each row execute function public.prevent_message_on_cancelled_event();
exception when duplicate_object then null;
end;
$$;

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
  participant_row public.event_participants%rowtype;
  safe_reason text := lower(trim(coalesce(reason_code, '')));
  safe_note text := left(trim(coalesce(organizer_note, '')), 500);
  reason_label text;
  late_cancellation boolean;
  refunded_participants integer := 0;
  refunded_cents integer := 0;
  notified_users integer := 0;
  wallet_updated integer;
begin
  if actor_id is null then
    raise exception 'Devi accedere per annullare un evento';
  end if;

  if safe_reason not in (
    'personal',
    'weather',
    'venue_unavailable',
    'insufficient_participants',
    'emergency',
    'other'
  ) then
    raise exception 'Seleziona un motivo valido per annullare l evento';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then
    raise exception 'Evento non trovato';
  end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo annullare questo evento';
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
    raise exception 'Puoi annullare soltanto un evento programmato';
  end if;
  if target_event.starts_at <= now() then
    raise exception 'L evento e gia iniziato: chiudilo dalla gestione presenze';
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

  update public.events
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = actor_id,
    cancellation_reason = safe_reason,
    cancellation_note = safe_note,
    cancellation_is_late = late_cancellation,
    updated_at = now()
  where id = target_event_id;

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
      user_id,
      actor_id,
      event_id,
      type,
      title,
      body,
      payload
    )
    select
      recipient.user_id,
      actor_id,
      target_event_id,
      'event_cancelled',
      'Evento annullato',
      left(
        target_event.title || ' e stato annullato per ' || reason_label
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

  for participant_row in
    select participant.*
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.status in ('going', 'completed')
      and participant.stake_cents > 0
      and participant.stake_status in ('locked', 'verified')
    for update
  loop
    update public.wallet_accounts
    set
      available_cents = available_cents + participant_row.stake_cents,
      locked_cents = locked_cents - participant_row.stake_cents,
      updated_at = now()
    where user_id = participant_row.user_id
      and locked_cents >= participant_row.stake_cents;

    get diagnostics wallet_updated = row_count;
    if wallet_updated <> 1 then
      raise exception 'Saldo bloccato incoerente per il partecipante %', participant_row.user_id;
    end if;

    insert into public.wallet_ledger (
      user_id,
      event_id,
      entry_type,
      amount_cents,
      ref_key,
      metadata
    )
    values (
      participant_row.user_id,
      target_event_id,
      'stake_release',
      participant_row.stake_cents,
      'event_cancel_release:' || target_event_id::text || ':' || participant_row.user_id::text,
      jsonb_build_object(
        'eventTitle', target_event.title,
        'reason', 'organizer_cancelled',
        'cancelledBy', actor_id
      )
    )
    on conflict (user_id, ref_key) do nothing;

    refunded_participants := refunded_participants + 1;
    refunded_cents := refunded_cents + participant_row.stake_cents;
  end loop;

  update public.event_participants
  set
    status = 'cancelled',
    stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
    cashback_percent = 0,
    updated_at = now()
  where event_id = target_event_id
    and status in ('going', 'completed');

  update public.event_join_requests
  set
    status = 'cancelled',
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

commit;
