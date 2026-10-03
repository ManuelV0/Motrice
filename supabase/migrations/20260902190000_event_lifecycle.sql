begin;

-- The organizer chooses how long late arrivals may check in after the planned
-- start. The actual event end never changes.
alter table public.events
  add column if not exists checkin_grace_minutes smallint not null default 15,
  add column if not exists completed_at timestamptz;

do $$
begin
  alter table public.events
    add constraint events_checkin_grace_minutes_check
    check (checkin_grace_minutes between 0 and 30);
exception when duplicate_object then null;
end;
$$;

create index if not exists events_lifecycle_due_idx
  on public.events(status, starts_at)
  where status = 'scheduled';

-- Final server-side guard. It protects every current and legacy check-in RPC,
-- even if a stale client bypasses the new UI.
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

  if not found then
    raise exception 'Evento non trovato';
  end if;

  if target_event.status <> 'scheduled' then
    raise exception 'La finestra di check-in è chiusa';
  end if;

  effective_grace := least(
    30,
    greatest(0, target_event.duration_minutes::integer - target_event.minimum_presence_minutes::integer),
    greatest(0, target_event.checkin_grace_minutes::integer)
  );
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

drop trigger if exists enforce_event_checkin_window on public.event_checkins;
create trigger enforce_event_checkin_window
before insert on public.event_checkins
for each row execute function public.enforce_event_checkin_window();

-- During the live window the organizer may only increase the tolerance. The
-- hard ceiling is 30 minutes and it can never make minimum presence impossible.
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
  maximum_grace integer;
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

  maximum_grace := least(
    30,
    greatest(0, target_event.duration_minutes::integer - target_event.minimum_presence_minutes::integer)
  );

  if requested_grace_minutes is null
    or requested_grace_minutes <= target_event.checkin_grace_minutes
  then
    raise exception 'La tolleranza può essere soltanto aumentata';
  end if;
  if requested_grace_minutes > maximum_grace then
    raise exception 'Tolleranza massima consentita: % minuti', maximum_grace;
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

-- Internal finalizer. It is intentionally not granted to app users: the public
-- wrapper below keeps the existing organizer-only manual fallback.
create or replace function public.finalize_event_outcomes_core(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  validated_count integer := 0;
  no_show_count integer := 0;
begin
  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if now() < target_event.starts_at + make_interval(mins => target_event.duration_minutes::integer) then
    raise exception 'L evento non è ancora terminato';
  end if;

  if target_event.status = 'completed' then
    return jsonb_build_object(
      'success', true,
      'already_completed', true,
      'validated_count', 0,
      'no_show_count', 0,
      'event_status', 'completed'
    );
  end if;
  if target_event.status = 'cancelled' then
    return jsonb_build_object('success', true, 'event_status', 'cancelled');
  end if;

  for participant in
    select * from public.event_participants
    where event_id = target_event_id
    for update
  loop
    if participant.user_id = target_event.creator_id then
      continue;
    end if;

    if participant.status = 'completed' and participant.cashback_percent = 100 then
      validated_count := validated_count + 1;
    elsif participant.status = 'going' then
      update public.event_participants
      set
        status = 'no_show',
        stake_status = case when stake_cents > 0 then 'forfeited' else 'waived' end,
        updated_at = now()
      where event_id = target_event_id
        and user_id = participant.user_id;

      if participant.stake_cents > 0
        and participant.stake_status in ('locked', 'verified')
      then
        update public.wallet_accounts
        set locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = participant.user_id;

        insert into public.wallet_ledger (
          user_id, event_id, entry_type, amount_cents, ref_key, metadata
        ) values (
          participant.user_id,
          target_event_id,
          'stake_forfeit',
          participant.stake_cents,
          'stake_forfeit:' || target_event_id::text || ':' ||
            floor(extract(epoch from participant.joined_at) * 1000)::bigint::text,
          jsonb_build_object('reason', 'minimum_presence_not_reached', 'joined_at', participant.joined_at)
        )
        on conflict (user_id, ref_key) do nothing;
      end if;

      insert into public.notifications (
        user_id, actor_id, event_id, type, title, body, payload
      ) values (
        participant.user_id,
        target_event.creator_id,
        target_event_id,
        'event_no_show',
        'Evento concluso',
        'La presenza minima non è stata raggiunta: nessun MOT o XP assegnato.',
        jsonb_build_object('status', 'no_show')
      );

      no_show_count := no_show_count + 1;
    end if;
  end loop;

  update public.events
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = target_event_id;

  return jsonb_build_object(
    'success', true,
    'validated_count', validated_count,
    'no_show_count', no_show_count,
    'event_status', 'completed'
  );
end;
$$;

create or replace function public.finalize_event_outcomes(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_creator_id uuid;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select creator_id into target_creator_id
  from public.events
  where id = target_event_id;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_creator_id <> actor_id then
    raise exception 'Solo l organizzatore può chiudere l evento';
  end if;

  return public.finalize_event_outcomes_core(target_event_id);
end;
$$;

create or replace function public.finalize_due_events()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  due_event record;
  finalized_count integer := 0;
  failed_count integer := 0;
begin
  for due_event in
    select event_row.id
    from public.events event_row
    where event_row.status = 'scheduled'
      and now() >= event_row.starts_at + make_interval(mins => event_row.duration_minutes::integer)
    order by event_row.starts_at
    for update skip locked
  loop
    begin
      perform public.finalize_event_outcomes_core(due_event.id);
      finalized_count := finalized_count + 1;
    exception when others then
      failed_count := failed_count + 1;
      raise warning 'Impossibile finalizzare evento %: %', due_event.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'finalized_count', finalized_count,
    'failed_count', failed_count
  );
end;
$$;

revoke all on function public.enforce_event_checkin_window() from public, anon, authenticated;
revoke all on function public.extend_event_checkin_window(uuid, integer) from public, anon;
grant execute on function public.extend_event_checkin_window(uuid, integer) to authenticated;
revoke all on function public.finalize_event_outcomes_core(uuid) from public, anon, authenticated;
revoke all on function public.finalize_due_events() from public, anon, authenticated;
revoke all on function public.finalize_event_outcomes(uuid) from public, anon;
grant execute on function public.finalize_event_outcomes(uuid) to authenticated;

-- Supabase Cron runs the database finalizer independently from app sessions.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'motrice-finalize-due-events'
  ) then
    perform cron.schedule(
      'motrice-finalize-due-events',
      '* * * * *',
      'select public.finalize_due_events();'
    );
  end if;
end;
$$;

commit;
