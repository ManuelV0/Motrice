begin;

create table if not exists public.event_participant_removals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  reason_code text not null
    check (reason_code in (
      'organizer_error',
      'requirements_mismatch',
      'safety',
      'organization_issue',
      'other'
    )),
  organizer_note text not null default '' check (char_length(organizer_note) <= 300),
  is_late boolean not null default false,
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  removed_at timestamptz not null default now()
);

create index if not exists event_participant_removals_event_idx
  on public.event_participant_removals(event_id, removed_at desc);

alter table public.event_participant_removals enable row level security;

drop policy if exists "participant_removals_read_involved" on public.event_participant_removals;
create policy "participant_removals_read_involved"
on public.event_participant_removals for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or participant_id = (select auth.uid())
);

create or replace function public.remove_event_participant(
  target_event_id uuid,
  target_participant_id uuid,
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
  normalized_reason text := lower(trim(coalesce(reason_code, '')));
  normalized_note text := left(trim(coalesce(organizer_note, '')), 300);
  checkin_opens_at_value timestamptz;
  late_window_starts_at timestamptz;
  removal_is_late boolean := false;
  released_cents integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if target_participant_id is null then raise exception 'Partecipante non valido'; end if;
  if target_participant_id = actor_id then raise exception 'L organizer non può rimuovere se stesso'; end if;
  if normalized_reason not in (
    'organizer_error',
    'requirements_mismatch',
    'safety',
    'organization_issue',
    'other'
  ) then
    raise exception 'Seleziona il motivo della rimozione';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizer può rimuovere un partecipante';
  end if;
  if target_event.status <> 'scheduled'
    or coalesce(target_event.lifecycle_state, 'published') in ('completed', 'cancelled', 'archived') then
    raise exception 'Evento non disponibile';
  end if;
  if coalesce(target_event.lifecycle_state, 'published') in ('checkin_open', 'active') then
    raise exception 'La rimozione è bloccata dall apertura del check-in';
  end if;

  checkin_opens_at_value := coalesce(
    target_event.checkin_opens_at,
    target_event.starts_at - interval '30 minutes'
  );
  if clock_timestamp() >= checkin_opens_at_value then
    raise exception 'La rimozione è bloccata dall apertura del check-in';
  end if;

  select * into participant_row
  from public.event_participants
  where event_id = target_event_id
    and user_id = target_participant_id
    and status = 'going'
  for update;
  if not found then raise exception 'Il partecipante non risulta più iscritto'; end if;

  late_window_starts_at := target_event.starts_at - interval '12 hours';
  removal_is_late := clock_timestamp() >= late_window_starts_at;
  released_cents := greatest(0, coalesce(participant_row.stake_cents, 0));

  insert into public.event_participant_removals (
    event_id,
    organizer_id,
    participant_id,
    reason_code,
    organizer_note,
    is_late,
    refunded_cents
  ) values (
    target_event_id,
    actor_id,
    target_participant_id,
    normalized_reason,
    normalized_note,
    removal_is_late,
    released_cents
  );

  update public.event_participants
  set
    status = 'cancelled',
    lifecycle_state = 'cancelled',
    lifecycle_updated_at = now(),
    stake_status = case
      when stake_status in ('locked', 'verified') then 'released'
      else stake_status
    end,
    updated_at = now()
  where event_id = target_event_id
    and user_id = target_participant_id
    and status = 'going';

  update public.event_join_requests
  set
    status = 'cancelled',
    decided_at = now(),
    decided_by = actor_id,
    updated_at = now()
  where event_id = target_event_id
    and user_id = target_participant_id;

  delete from public.event_participant_qr_tokens
  where event_id = target_event_id
    and user_id = target_participant_id;

  insert into public.notifications (
    user_id,
    actor_id,
    event_id,
    type,
    title,
    body,
    payload
  ) values (
    target_participant_id,
    actor_id,
    target_event_id,
    'event_participant_removed',
    'Partecipazione rimossa',
    target_event.title || ': l organizer ha rimosso la tua partecipazione. La quota è di nuovo disponibile.',
    jsonb_build_object(
      'reason_code', normalized_reason,
      'is_late', removal_is_late,
      'refunded_cents', released_cents
    )
  );

  return jsonb_build_object(
    'success', true,
    'removed', true,
    'participant_id', target_participant_id,
    'is_late', removal_is_late,
    'deposit_released', true,
    'refunded_cents', released_cents
  );
end;
$$;

revoke all on public.event_participant_removals from anon, authenticated;
grant select on public.event_participant_removals to authenticated;

revoke all on function public.remove_event_participant(uuid, uuid, text, text)
from public, anon;
grant execute on function public.remove_event_participant(uuid, uuid, text, text)
to authenticated, service_role;

commit;
