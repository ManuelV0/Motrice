begin;

alter table public.events
  add column if not exists venue_type text not null default 'standard',
  add column if not exists gym_access_policy text;

alter table public.events
  drop constraint if exists events_venue_type_check,
  add constraint events_venue_type_check
    check (venue_type in ('standard', 'gym')),
  drop constraint if exists events_gym_access_policy_check,
  add constraint events_gym_access_policy_check
    check (
      (venue_type = 'standard' and gym_access_policy is null)
      or
      (venue_type = 'gym' and gym_access_policy in ('members_only', 'contact_venue'))
    );

create index if not exists events_venue_type_starts_idx
  on public.events(venue_type, starts_at)
  where status = 'scheduled';

comment on column public.events.venue_type is
  'Classifica il luogo fisico dell evento. gym identifica una struttura sportiva privata, non lo sport praticato.';
comment on column public.events.gym_access_policy is
  'Condizione informativa per eventi in palestra: members_only oppure contact_venue. Non rappresenta un ingresso garantito o acquistato.';

commit;
