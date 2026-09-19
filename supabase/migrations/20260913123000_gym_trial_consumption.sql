begin;

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
  if not found
    or target_event.venue_type <> 'gym'
    or target_event.gym_access_policy <> 'members_or_trial' then
    return new;
  end if;

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if access_result ->> 'status' <> 'trial_available' then return new; end if;

  insert into public.gym_trial_usages (
    venue_key,
    user_id,
    event_id,
    status,
    reserved_at,
    used_at,
    verified_by,
    created_at,
    updated_at
  ) values (
    access_result ->> 'venue_key',
    new.user_id,
    new.event_id,
    'used',
    new.joined_at,
    coalesce(new.checked_in_at, new.completed_at, now()),
    new.checked_in_by,
    now(),
    now()
  )
  on conflict (venue_key, user_id) do update
  set
    event_id = excluded.event_id,
    status = 'used',
    used_at = coalesce(public.gym_trial_usages.used_at, excluded.used_at),
    verified_by = coalesce(public.gym_trial_usages.verified_by, excluded.verified_by),
    updated_at = now()
  where public.gym_trial_usages.status <> 'used';

  return new;
end;
$$;

drop trigger if exists event_participants_90_consume_gym_trial on public.event_participants;
create trigger event_participants_90_consume_gym_trial
after insert or update of checked_in_at, status on public.event_participants
for each row execute function public.consume_gym_trial_after_checkin();

comment on function public.consume_gym_trial_after_checkin() is
  'Consuma la prova della palestra solo quando la presenza fisica è stata verificata, mai alla semplice prenotazione.';

commit;
