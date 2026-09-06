begin;

-- Canonical, additive lifecycle for the beta. The legacy events.status and
-- event_participants.status columns remain untouched so older APKs keep
-- working while the frontend moves to the richer state machine.
alter table public.events
  add column if not exists lifecycle_state text not null default 'published',
  add column if not exists lifecycle_version bigint not null default 0,
  add column if not exists lifecycle_updated_at timestamptz not null default now(),
  add column if not exists checkin_opens_at timestamptz,
  add column if not exists checkin_closes_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.event_participants
  add column if not exists lifecycle_state text not null default 'confirmed',
  add column if not exists lifecycle_updated_at timestamptz not null default now();

do $$
begin
  alter table public.events
    add constraint events_lifecycle_state_check
    check (
      lifecycle_state in (
        'draft',
        'published',
        'confirmed',
        'checkin_open',
        'active',
        'completed',
        'cancelled',
        'archived'
      )
    );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_lifecycle_version_check
    check (lifecycle_version >= 0);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.event_participants
    add constraint event_participants_lifecycle_state_check
    check (
      lifecycle_state in (
        'requested',
        'confirmed',
        'checked_in',
        'active',
        'completed',
        'rejected',
        'cancelled',
        'no_show'
      )
    );
exception when duplicate_object then null;
end;
$$;

-- Persisted deadlines avoid different devices deriving different instants.
update public.events event
set
  checkin_opens_at = event.starts_at - interval '30 minutes',
  checkin_closes_at = event.starts_at + make_interval(
    mins => least(
      30,
      greatest(0, event.duration_minutes::integer - event.minimum_presence_minutes::integer),
      greatest(0, event.checkin_grace_minutes::integer)
    )
  ),
  ends_at = event.starts_at + make_interval(mins => event.duration_minutes::integer);

-- Backfill without changing the three-value legacy status column.
update public.events event
set
  lifecycle_state = case
    when event.archived_at is not null then 'archived'
    when event.status = 'cancelled' then 'cancelled'
    when event.status = 'completed' or now() >= event.ends_at then 'completed'
    when now() >= event.starts_at then 'active'
    when now() >= event.checkin_opens_at then 'checkin_open'
    else 'published'
  end,
  lifecycle_version = 1,
  lifecycle_updated_at = now();

update public.event_participants participant
set
  lifecycle_state = case
    when participant.status = 'completed' then 'completed'
    when participant.status = 'no_show' then 'no_show'
    when participant.status = 'cancelled' then 'cancelled'
    when participant.minimum_reached_at is not null then 'active'
    when participant.checked_in_at is not null then 'checked_in'
    else 'confirmed'
  end,
  lifecycle_updated_at = now();

create index if not exists events_lifecycle_state_starts_idx
  on public.events(lifecycle_state, starts_at);

create index if not exists events_lifecycle_due_idx_v2
  on public.events(lifecycle_state, checkin_opens_at, starts_at, ends_at)
  where lifecycle_state not in ('archived', 'cancelled');

create index if not exists event_participants_lifecycle_idx
  on public.event_participants(event_id, lifecycle_state);

create table if not exists public.event_lifecycle_transitions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('event', 'participant')),
  participant_user_id uuid references public.profiles(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null default 'state_change',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (entity_kind = 'event' and participant_user_id is null)
    or (entity_kind = 'participant' and participant_user_id is not null)
  )
);

create index if not exists event_lifecycle_transitions_event_created_idx
  on public.event_lifecycle_transitions(event_id, created_at desc);

create index if not exists event_lifecycle_transitions_participant_created_idx
  on public.event_lifecycle_transitions(participant_user_id, created_at desc)
  where participant_user_id is not null;

alter table public.event_lifecycle_transitions enable row level security;

drop policy if exists event_lifecycle_transitions_read_involved
  on public.event_lifecycle_transitions;
create policy event_lifecycle_transitions_read_involved
on public.event_lifecycle_transitions for select
to authenticated
using (
  participant_user_id = (select auth.uid())
  or exists (
    select 1
    from public.events event
    where event.id = event_lifecycle_transitions.event_id
      and event.creator_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.event_participants participant
    where participant.event_id = event_lifecycle_transitions.event_id
      and participant.user_id = (select auth.uid())
  )
);

revoke insert, update, delete on public.event_lifecycle_transitions
  from anon, authenticated;
grant select on public.event_lifecycle_transitions to authenticated;

create or replace function public.sync_event_lifecycle_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_grace integer;
begin
  effective_grace := least(
    30,
    greatest(0, new.duration_minutes::integer - new.minimum_presence_minutes::integer),
    greatest(0, new.checkin_grace_minutes::integer)
  );

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

create or replace function public.guard_event_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  transition_allowed boolean := false;
begin
  if new.lifecycle_state is not distinct from old.lifecycle_state then
    return new;
  end if;

  transition_allowed := case old.lifecycle_state
    when 'draft' then new.lifecycle_state in ('published', 'cancelled')
    when 'published' then new.lifecycle_state in ('confirmed', 'checkin_open', 'active', 'completed', 'cancelled')
    when 'confirmed' then new.lifecycle_state in ('checkin_open', 'active', 'completed', 'cancelled')
    when 'checkin_open' then new.lifecycle_state in ('active', 'completed', 'cancelled')
    when 'active' then new.lifecycle_state in ('completed', 'cancelled')
    when 'completed' then new.lifecycle_state = 'archived'
    when 'cancelled' then new.lifecycle_state = 'archived'
    when 'archived' then false
    else false
  end;

  if not transition_allowed then
    raise exception 'Transizione evento non valida: % -> %', old.lifecycle_state, new.lifecycle_state;
  end if;

  return new;
end;
$$;

drop trigger if exists events_lifecycle_10_sync_fields on public.events;
create trigger events_lifecycle_10_sync_fields
before insert or update of
  starts_at,
  duration_minutes,
  minimum_presence_minutes,
  checkin_grace_minutes,
  status,
  lifecycle_state,
  archived_at
on public.events
for each row execute function public.sync_event_lifecycle_fields();

drop trigger if exists events_lifecycle_20_guard_transition on public.events;
create trigger events_lifecycle_20_guard_transition
before update of lifecycle_state, status, archived_at
on public.events
for each row execute function public.guard_event_lifecycle_transition();

create or replace function public.sync_participant_lifecycle_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.lifecycle_state := case
    when new.status = 'completed' then 'completed'
    when new.status = 'no_show' then 'no_show'
    when new.status = 'cancelled' then 'cancelled'
    when new.lifecycle_state = 'active' then 'active'
    when new.minimum_reached_at is not null then 'active'
    when new.checked_in_at is not null then 'checked_in'
    else 'confirmed'
  end;

  if tg_op = 'INSERT' or new.lifecycle_state is distinct from old.lifecycle_state then
    new.lifecycle_updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.guard_participant_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  transition_allowed boolean := false;
begin
  if new.lifecycle_state is not distinct from old.lifecycle_state then
    return new;
  end if;

  transition_allowed := case old.lifecycle_state
    when 'requested' then new.lifecycle_state in ('confirmed', 'rejected', 'cancelled')
    when 'confirmed' then new.lifecycle_state in ('checked_in', 'active', 'completed', 'cancelled', 'no_show')
    when 'checked_in' then new.lifecycle_state in ('active', 'completed', 'cancelled', 'no_show')
    when 'active' then new.lifecycle_state in ('completed', 'cancelled', 'no_show')
    -- Rejoining before an event starts is already supported by the beta RPC.
    when 'cancelled' then new.lifecycle_state = 'confirmed'
    when 'rejected' then new.lifecycle_state = 'confirmed'
    when 'completed' then false
    when 'no_show' then false
    else false
  end;

  if not transition_allowed then
    raise exception 'Transizione partecipante non valida: % -> %', old.lifecycle_state, new.lifecycle_state;
  end if;

  return new;
end;
$$;

drop trigger if exists event_participants_lifecycle_10_sync on public.event_participants;
create trigger event_participants_lifecycle_10_sync
before insert or update of
  status,
  checked_in_at,
  minimum_reached_at,
  completed_at,
  lifecycle_state
on public.event_participants
for each row execute function public.sync_participant_lifecycle_state();

drop trigger if exists event_participants_lifecycle_20_guard on public.event_participants;
create trigger event_participants_lifecycle_20_guard
before update of
  status,
  checked_in_at,
  minimum_reached_at,
  completed_at,
  lifecycle_state
on public.event_participants
for each row execute function public.guard_participant_lifecycle_transition();

create or replace function public.mark_participant_workout_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role_key = 'participant' then
    update public.event_participants
    set lifecycle_state = 'active'
    where event_id = new.event_id
      and user_id = new.user_id
      and lifecycle_state in ('confirmed', 'checked_in');
  end if;

  return new;
end;
$$;

drop trigger if exists on_event_workout_session_started_lifecycle
  on public.event_workout_sessions;
create trigger on_event_workout_session_started_lifecycle
after insert on public.event_workout_sessions
for each row execute function public.mark_participant_workout_active();

create or replace function public.audit_event_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.lifecycle_state is distinct from old.lifecycle_state then
    insert into public.event_lifecycle_transitions (
      event_id,
      entity_kind,
      from_state,
      to_state,
      actor_id,
      reason,
      metadata
    ) values (
      new.id,
      'event',
      case when tg_op = 'INSERT' then null else old.lifecycle_state end,
      new.lifecycle_state,
      auth.uid(),
      case when auth.uid() is null then 'system_transition' else 'state_change' end,
      jsonb_build_object('lifecycle_version', new.lifecycle_version)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists events_lifecycle_audit on public.events;
create trigger events_lifecycle_audit
after insert or update on public.events
for each row execute function public.audit_event_lifecycle_transition();

create or replace function public.audit_participant_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.lifecycle_state is distinct from old.lifecycle_state then
    insert into public.event_lifecycle_transitions (
      event_id,
      entity_kind,
      participant_user_id,
      from_state,
      to_state,
      actor_id,
      reason
    ) values (
      new.event_id,
      'participant',
      new.user_id,
      case when tg_op = 'INSERT' then null else old.lifecycle_state end,
      new.lifecycle_state,
      auth.uid(),
      case when auth.uid() is null then 'system_transition' else 'state_change' end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists event_participants_lifecycle_audit
  on public.event_participants;
create trigger event_participants_lifecycle_audit
after insert or update on public.event_participants
for each row execute function public.audit_participant_lifecycle_transition();

-- Deterministic server reconciliation. It advances states only forward and is
-- safe to execute repeatedly or concurrently.
create or replace function public.reconcile_event_lifecycle(
  target_event_id uuid default null,
  batch_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_row public.events%rowtype;
  desired_state text;
  changed_count integer := 0;
begin
  for event_row in
    select event.*
    from public.events event
    where event.lifecycle_state <> 'archived'
      and (
        target_event_id is not null
        or event.status in ('cancelled', 'completed')
        or now() >= event.checkin_opens_at
      )
      and (target_event_id is null or event.id = target_event_id)
    order by event.starts_at
    limit greatest(1, least(coalesce(batch_limit, 500), 2000))
    for update skip locked
  loop
    desired_state := event_row.lifecycle_state;

    if event_row.archived_at is not null then
      desired_state := 'archived';
    elsif event_row.status = 'cancelled' then
      if now() >= coalesce(event_row.cancelled_at, event_row.lifecycle_updated_at) + interval '24 hours' then
        desired_state := 'archived';
      else
        desired_state := 'cancelled';
      end if;
    elsif event_row.status = 'completed' or now() >= event_row.ends_at then
      if now() >= coalesce(event_row.completed_at, event_row.ends_at) + interval '24 hours' then
        desired_state := 'archived';
      else
        desired_state := 'completed';
      end if;
    elsif now() >= event_row.starts_at then
      desired_state := 'active';
    elsif now() >= event_row.checkin_opens_at then
      desired_state := 'checkin_open';
    elsif event_row.lifecycle_state not in ('draft', 'confirmed') then
      desired_state := 'published';
    end if;

    if desired_state is distinct from event_row.lifecycle_state then
      update public.events
      set
        lifecycle_state = desired_state,
        archived_at = case
          when desired_state = 'archived' then coalesce(archived_at, now())
          else archived_at
        end
      where id = event_row.id;
      changed_count := changed_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'changed_count', changed_count,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.sync_event_lifecycle_fields()
  from public, anon, authenticated;
revoke all on function public.guard_event_lifecycle_transition()
  from public, anon, authenticated;
revoke all on function public.sync_participant_lifecycle_state()
  from public, anon, authenticated;
revoke all on function public.guard_participant_lifecycle_transition()
  from public, anon, authenticated;
revoke all on function public.mark_participant_workout_active()
  from public, anon, authenticated;
revoke all on function public.audit_event_lifecycle_transition()
  from public, anon, authenticated;
revoke all on function public.audit_participant_lifecycle_transition()
  from public, anon, authenticated;
revoke all on function public.reconcile_event_lifecycle(uuid, integer)
  from public, anon, authenticated;

-- Run the state reconciler independently from open app sessions. The existing
-- finalizer remains responsible for financial and reward outcomes.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'motrice-reconcile-event-lifecycle'
  ) then
    perform cron.schedule(
      'motrice-reconcile-event-lifecycle',
      '* * * * *',
      'select public.reconcile_event_lifecycle();'
    );
  end if;
end;
$$;

comment on column public.events.lifecycle_state is
  'Canonical event lifecycle; legacy status remains for backwards compatibility.';
comment on column public.event_participants.lifecycle_state is
  'Canonical participant lifecycle synchronized from participation and workout actions.';
comment on table public.event_lifecycle_transitions is
  'Immutable audit trail for event and participant lifecycle transitions.';

commit;
