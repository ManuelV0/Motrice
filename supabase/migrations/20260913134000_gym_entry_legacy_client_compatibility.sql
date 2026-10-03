begin;

-- Durante il rollout, le versioni Android precedenti non inviano ancora la
-- scelta personale. Manteniamo quindi l'API leggibile e non blocchiamo utenti
-- che non hanno ancora ricevuto l'aggiornamento.
alter table public.events
  drop constraint if exists events_gym_access_policy_check,
  add constraint events_gym_access_policy_check
    check (
      (venue_type = 'standard' and gym_access_policy is null)
      or
      (
        venue_type = 'gym'
        and gym_access_policy in ('participant_choice', 'members_only', 'members_or_trial', 'contact_venue')
      )
    );

update public.events
set gym_access_policy = 'contact_venue'
where venue_type = 'gym' and gym_access_policy = 'participant_choice';

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

  -- Compatibilità temporanea: il nuovo client registra sempre la scelta prima
  -- di arrivare qui; un record assente identifica un client già distribuito.
  if not exists (
    select 1 from public.gym_event_access_choices access
    where access.event_id = new.event_id and access.user_id = new.user_id
  ) then
    return new;
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
    return new;
  end if;

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if access_result ->> 'status' = 'trial_used' then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;
  return new;
end;
$$;

commit;
