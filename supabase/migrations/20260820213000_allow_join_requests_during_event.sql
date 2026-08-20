begin;

-- Approval events may still accept a participant after the scheduled start,
-- provided enough time remains to complete the configured minimum presence.
create or replace function public.request_event_join(
  target_event_id uuid,
  participant_skill_level text default 'beginner',
  participant_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  occupied integer;
  latest_join_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per richiedere di partecipare';
  end if;
  if participant_skill_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Livello non valido';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  latest_join_at := target_event.starts_at
    + make_interval(
        mins => greatest(
          0,
          target_event.duration_minutes::integer
            - target_event.minimum_presence_minutes::integer
        )
      );

  if now() > latest_join_at then
    raise exception 'Tempo insufficiente per completare la presenza minima';
  end if;
  if target_event.is_personal then raise exception 'Questo evento e un promemoria personale'; end if;
  if target_event.join_policy <> 'approval' then
    raise exception 'Questo evento non richiede approvazione';
  end if;
  if target_event.creator_id = actor_id then
    return jsonb_build_object('success', true, 'already_joined', true, 'pending', false);
  end if;
  if exists (
    select 1 from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed')
  ) then
    return jsonb_build_object('success', true, 'already_joined', true, 'pending', false);
  end if;

  select count(*) into occupied
  from public.event_participants participant
  where participant.event_id = target_event_id
    and participant.status in ('going', 'completed');

  if occupied >= target_event.max_participants then
    raise exception 'Evento completo: posti disponibili terminati';
  end if;

  insert into public.event_join_requests (
    event_id,
    user_id,
    status,
    skill_level,
    note,
    requested_at,
    decided_at,
    decided_by,
    updated_at
  )
  values (
    target_event_id,
    actor_id,
    'pending',
    participant_skill_level,
    left(coalesce(participant_note, ''), 500),
    now(),
    null,
    null,
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = 'pending',
    skill_level = excluded.skill_level,
    note = excluded.note,
    requested_at = now(),
    decided_at = null,
    decided_by = null,
    updated_at = now();

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    target_event.creator_id,
    actor_id,
    target_event_id,
    'event_join_requested',
    'Nuova richiesta di partecipazione',
    target_event.title,
    jsonb_build_object('requester_id', actor_id)
  );

  return jsonb_build_object('success', true, 'pending', true, 'event_id', target_event_id);
end;
$$;

create or replace function public.approve_event_join_request(
  target_event_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  request_row public.event_join_requests%rowtype;
  occupied integer;
  account public.wallet_accounts%rowtype;
  effective_stake integer := 0;
  joined_at_value timestamptz := clock_timestamp();
  ledger_cycle text;
  personal_token text;
  latest_join_at timestamptz;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then raise exception 'Solo l organizer puo approvare'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  latest_join_at := target_event.starts_at
    + make_interval(
        mins => greatest(
          0,
          target_event.duration_minutes::integer
            - target_event.minimum_presence_minutes::integer
        )
      );

  if now() > latest_join_at then
    raise exception 'Tempo insufficiente per completare la presenza minima';
  end if;

  select * into request_row
  from public.event_join_requests request
  where request.event_id = target_event_id
    and request.user_id = target_user_id
    and request.status = 'pending'
  for update;

  if not found then raise exception 'Richiesta non disponibile'; end if;

  select count(*) into occupied
  from public.event_participants participant
  where participant.event_id = target_event_id
    and participant.status in ('going', 'completed');

  if occupied >= target_event.max_participants then
    raise exception 'Evento completo: posti disponibili terminati';
  end if;

  effective_stake := target_event.deposit_cents;
  ledger_cycle := floor(extract(epoch from joined_at_value) * 1000)::bigint::text;

  if effective_stake > 0 then
    account := public.ensure_wallet_account(target_user_id);
    if account.available_cents < effective_stake then
      raise exception 'Il partecipante non ha saldo beta sufficiente';
    end if;

    update public.wallet_accounts
    set
      available_cents = available_cents - effective_stake,
      locked_cents = locked_cents + effective_stake
    where user_id = target_user_id;

    insert into public.wallet_ledger (
      user_id,
      event_id,
      entry_type,
      amount_cents,
      ref_key,
      metadata
    )
    values (
      target_user_id,
      target_event_id,
      'stake_lock',
      effective_stake,
      'stake_lock:' || target_event_id::text || ':' || ledger_cycle,
      jsonb_build_object('eventTitle', target_event.title, 'cycle', ledger_cycle, 'approvedBy', actor_id)
    )
    on conflict (user_id, ref_key) do nothing;
  end if;

  insert into public.event_participants (
    event_id,
    user_id,
    status,
    skill_level,
    note,
    stake_cents,
    stake_status,
    cashback_percent,
    joined_at,
    updated_at
  )
  values (
    target_event_id,
    target_user_id,
    'going',
    request_row.skill_level,
    request_row.note,
    effective_stake,
    case when effective_stake = 0 then 'waived' else 'locked' end,
    0,
    joined_at_value,
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = 'going',
    skill_level = excluded.skill_level,
    note = excluded.note,
    stake_cents = excluded.stake_cents,
    stake_status = excluded.stake_status,
    cashback_percent = 0,
    checked_in_at = null,
    checked_in_by = null,
    checkin_lat = null,
    checkin_lng = null,
    minimum_reached_at = null,
    completed_at = null,
    review_bonus_awarded = false,
    joined_at = joined_at_value,
    updated_at = now();

  personal_token := public.issue_event_participant_qr(target_event_id, target_user_id);

  update public.event_join_requests
  set status = 'approved', decided_at = now(), decided_by = actor_id, updated_at = now()
  where event_id = target_event_id and user_id = target_user_id;

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    target_user_id,
    actor_id,
    target_event_id,
    'event_join_approved',
    'Richiesta approvata',
    target_event.title,
    jsonb_build_object('deposit_cents', effective_stake, 'qr_generated', true)
  );

  return jsonb_build_object(
    'success', true,
    'approved', true,
    'deposit_cents', effective_stake,
    'qr_token', personal_token
  );
end;
$$;

revoke all on function public.request_event_join(uuid, text, text) from public, anon;
revoke all on function public.approve_event_join_request(uuid, uuid) from public, anon;

grant execute on function public.request_event_join(uuid, text, text) to authenticated;
grant execute on function public.approve_event_join_request(uuid, uuid) to authenticated;

commit;
