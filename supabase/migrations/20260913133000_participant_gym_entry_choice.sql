begin;

alter table public.events
  drop constraint if exists events_gym_access_policy_check;

-- La condizione di ingresso appartiene alla persona, non all'organizzatore.
update public.events
set gym_access_policy = 'participant_choice'
where venue_type = 'gym';

alter table public.events
  add constraint events_gym_access_policy_check
    check (
      (venue_type = 'standard' and gym_access_policy is null)
      or
      (venue_type = 'gym' and gym_access_policy = 'participant_choice')
    );

comment on column public.events.gym_access_policy is
  'Per gli eventi in palestra vale participant_choice: ogni partecipante dichiara il proprio ingresso, separatamente dalla caparra Motrice.';

create table if not exists public.gym_event_access_choices (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null check (choice in ('member', 'trial', 'day_pass')),
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists gym_event_access_choices_user_idx
  on public.gym_event_access_choices(user_id, updated_at desc);

alter table public.gym_event_access_choices enable row level security;

drop policy if exists gym_event_access_choices_read_involved on public.gym_event_access_choices;
create policy gym_event_access_choices_read_involved
on public.gym_event_access_choices for select
to authenticated
using (
  user_id = auth.uid()
  or public.profile_verification_is_admin()
  or exists (
    select 1 from public.events event
    where event.id = event_id and event.creator_id = auth.uid()
  )
);

revoke all on public.gym_event_access_choices from anon;
grant select on public.gym_event_access_choices to authenticated;

-- Mantiene utilizzabili le prenotazioni palestra già esistenti senza inventare
-- un abbonamento: l'ingresso giornaliero è l'opzione conservativa.
insert into public.gym_event_access_choices (event_id, user_id, choice, selected_at, updated_at)
select participant.event_id, participant.user_id, 'day_pass', participant.joined_at, now()
from public.event_participants participant
join public.events event on event.id = participant.event_id
where event.venue_type = 'gym'
  and participant.user_id <> event.creator_id
  and participant.status in ('going', 'completed')
on conflict (event_id, user_id) do nothing;

insert into public.gym_event_access_choices (event_id, user_id, choice, selected_at, updated_at)
select request.event_id, request.user_id, 'day_pass', request.requested_at, now()
from public.event_join_requests request
join public.events event on event.id = request.event_id
where event.venue_type = 'gym'
  and request.status = 'pending'
on conflict (event_id, user_id) do nothing;

create or replace function public.resolve_event_gym_access(
  target_event_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  venue_key_value text;
  selected_choice text;
  has_membership boolean := false;
  has_used_trial boolean := false;
  resolved_status text;
  allowed boolean := true;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if target_event.venue_type <> 'gym' then
    return jsonb_build_object(
      'status', 'not_applicable',
      'selected_choice', null,
      'can_participate', true,
      'membership_verified', false,
      'trial_used', false,
      'entry_price_cents', 0
    );
  end if;

  venue_key_value := coalesce(
    nullif(trim(target_event.gym_venue_key), ''),
    trim(both '-' from regexp_replace(
      lower(concat_ws('-', nullif(target_event.location_name, ''), nullif(target_event.city, ''))),
      '[^a-z0-9]+', '-', 'g'
    ))
  );

  select exists (
    select 1
    from public.gym_venue_memberships membership
    where membership.venue_key = venue_key_value
      and membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.starts_at <= now()
      and (membership.ends_at is null or membership.ends_at > now())
  ) into has_membership;

  select exists (
    select 1
    from public.gym_trial_usages trial
    where trial.venue_key = venue_key_value
      and trial.user_id = target_user_id
      and trial.status = 'used'
  ) into has_used_trial;

  select access.choice into selected_choice
  from public.gym_event_access_choices access
  where access.event_id = target_event_id and access.user_id = target_user_id;

  if selected_choice is null and has_membership then
    selected_choice := 'member';
  end if;

  resolved_status := case
    when selected_choice is null then 'selection_required'
    when selected_choice = 'member' and has_membership then 'member'
    when selected_choice = 'member' then 'member_declared'
    when selected_choice = 'trial' and has_used_trial then 'trial_used'
    when selected_choice = 'trial' then 'trial_available'
    when selected_choice = 'day_pass' then 'day_pass'
    else 'selection_required'
  end;
  allowed := resolved_status <> 'trial_used';

  return jsonb_build_object(
    'status', resolved_status,
    'selected_choice', selected_choice,
    'venue_key', venue_key_value,
    'can_participate', allowed,
    'membership_verified', has_membership,
    'trial_used', has_used_trial,
    'entry_price_cents', case when selected_choice in ('member', 'trial') then 0 else null end
  );
end;
$$;

create or replace function public.choose_event_gym_access(
  target_event_id uuid,
  requested_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  access_result jsonb;
begin
  if actor_id is null then raise exception 'Accedi per scegliere l ingresso in palestra'; end if;
  if requested_choice not in ('member', 'trial', 'day_pass') then
    raise exception 'Tipo di ingresso palestra non valido';
  end if;

  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.venue_type <> 'gym' then raise exception 'Questo evento non si svolge in palestra'; end if;
  if target_event.creator_id = actor_id then raise exception 'L organizzatore non deve scegliere l ingresso dei partecipanti'; end if;
  if target_event.status <> 'scheduled' or target_event.starts_at <= now() then
    raise exception 'Evento non disponibile';
  end if;

  if requested_choice = 'trial' and exists (
    select 1 from public.gym_trial_usages trial
    where trial.venue_key = target_event.gym_venue_key
      and trial.user_id = actor_id
      and trial.status = 'used'
  ) then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;

  insert into public.gym_event_access_choices (event_id, user_id, choice, selected_at, updated_at)
  values (target_event_id, actor_id, requested_choice, now(), now())
  on conflict (event_id, user_id) do update
  set choice = excluded.choice, selected_at = now(), updated_at = now();

  access_result := public.resolve_event_gym_access(target_event_id, actor_id);
  return access_result;
end;
$$;

create or replace function public.get_my_event_gym_access(target_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Accedi per verificare l accesso alla palestra'; end if;
  return public.resolve_event_gym_access(target_event_id, auth.uid());
end;
$$;

create or replace function public.enforce_participant_gym_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  access_result jsonb;
begin
  if new.status not in ('going', 'completed') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('going', 'completed') then return new; end if;

  select * into target_event from public.events where id = new.event_id;
  if not found or target_event.venue_type <> 'gym' or target_event.creator_id = new.user_id then return new; end if;

  if not exists (
    select 1 from public.gym_event_access_choices access
    where access.event_id = new.event_id and access.user_id = new.user_id
  ) then
    raise exception 'GYM_ACCESS_CHOICE_REQUIRED: scegli abbonamento, prima entrata o ingresso giornaliero';
  end if;

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if access_result ->> 'status' = 'trial_used' then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_request_gym_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  access_result jsonb;
begin
  if new.status <> 'pending' then return new; end if;
  select * into target_event from public.events where id = new.event_id;
  if not found or target_event.venue_type <> 'gym' or target_event.creator_id = new.user_id then return new; end if;

  if not exists (
    select 1 from public.gym_event_access_choices access
    where access.event_id = new.event_id and access.user_id = new.user_id
  ) then
    raise exception 'GYM_ACCESS_CHOICE_REQUIRED: scegli abbonamento, prima entrata o ingresso giornaliero';
  end if;

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if access_result ->> 'status' = 'trial_used' then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;
  return new;
end;
$$;

create or replace function public.consume_gym_trial_after_checkin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  access_result jsonb;
begin
  if new.checked_in_at is null and new.status <> 'completed' then return new; end if;
  if tg_op = 'UPDATE' and old.checked_in_at is not null then return new; end if;

  select * into target_event from public.events where id = new.event_id;
  if not found or target_event.venue_type <> 'gym' then return new; end if;
  if not exists (
    select 1 from public.gym_event_access_choices access
    where access.event_id = new.event_id
      and access.user_id = new.user_id
      and access.choice = 'trial'
  ) then
    return new;
  end if;

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if access_result ->> 'status' <> 'trial_available' then return new; end if;

  insert into public.gym_trial_usages (
    venue_key, user_id, event_id, status, reserved_at, used_at,
    verified_by, created_at, updated_at
  ) values (
    access_result ->> 'venue_key', new.user_id, new.event_id, 'used',
    new.joined_at, coalesce(new.checked_in_at, new.completed_at, now()),
    new.checked_in_by, now(), now()
  )
  on conflict (venue_key, user_id) do update
  set event_id = excluded.event_id,
      status = 'used',
      used_at = coalesce(public.gym_trial_usages.used_at, excluded.used_at),
      verified_by = coalesce(public.gym_trial_usages.verified_by, excluded.verified_by),
      updated_at = now()
  where public.gym_trial_usages.status <> 'used';

  return new;
end;
$$;

revoke all on function public.resolve_event_gym_access(uuid, uuid) from public, anon;
revoke all on function public.get_my_event_gym_access(uuid) from public, anon;
revoke all on function public.choose_event_gym_access(uuid, text) from public, anon;
grant execute on function public.resolve_event_gym_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_event_gym_access(uuid) to authenticated, service_role;
grant execute on function public.choose_event_gym_access(uuid, text) to authenticated;

comment on table public.gym_event_access_choices is
  'Scelta personale del partecipante per l ingresso nella palestra dell evento; non è una regola impostata dall organizzatore.';
comment on function public.choose_event_gym_access(uuid, text) is
  'Registra member, trial o day_pass prima della richiesta di partecipazione.';

commit;
