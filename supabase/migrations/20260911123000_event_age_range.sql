begin;

alter table public.events
  add column if not exists min_age smallint not null default 18,
  add column if not exists max_age smallint not null default 99;

alter table public.events
  drop constraint if exists events_age_range_check,
  add constraint events_age_range_check
    check (
      min_age between 18 and 99
      and max_age between 18 and 99
      and min_age <= max_age
    );

comment on column public.events.min_age is
  'Minimum participant age selected by the organizer.';
comment on column public.events.max_age is
  'Maximum participant age selected by the organizer.';

create or replace function public.enforce_event_participant_age()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  participant_birth_date date;
  participant_age integer;
begin
  select * into target_event
  from public.events
  where id = new.event_id;

  if not found or target_event.is_personal or new.user_id = target_event.creator_id then
    return new;
  end if;

  select request.birth_date into participant_birth_date
  from public.profile_verification_requests request
  where request.user_id = new.user_id
    and request.status = 'verified'
  order by coalesce(request.verified_at, request.reviewed_at, request.updated_at) desc
  limit 1;

  if participant_birth_date is null then
    raise exception 'AGE_VERIFICATION_REQUIRED: completa la verifica del profilo';
  end if;

  participant_age := extract(year from age(current_date, participant_birth_date))::integer;
  if participant_age < target_event.min_age or participant_age > target_event.max_age then
    raise exception 'AGE_OUT_OF_RANGE: questo evento e riservato alla fascia %-% anni',
      target_event.min_age,
      target_event.max_age;
  end if;

  return new;
end;
$$;

drop trigger if exists event_participants_enforce_age on public.event_participants;
create trigger event_participants_enforce_age
before insert or update of event_id, user_id on public.event_participants
for each row execute function public.enforce_event_participant_age();

drop trigger if exists event_join_requests_enforce_age on public.event_join_requests;
create trigger event_join_requests_enforce_age
before insert or update of event_id, user_id on public.event_join_requests
for each row execute function public.enforce_event_participant_age();

commit;
