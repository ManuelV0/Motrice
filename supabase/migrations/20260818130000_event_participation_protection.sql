begin;

alter table public.events
  add column if not exists participation_protection boolean not null default true;

update public.events
set participation_protection = false
where is_personal;

alter table public.events
  drop constraint if exists events_personal_settings_check,
  add constraint events_personal_settings_check
    check (
      not is_personal
      or (
        visibility = 'private'
        and join_policy = 'open'
        and max_participants = 1
        and deposit_cents = 0
        and not participation_protection
      )
    ),
  drop constraint if exists events_participation_protection_check,
  add constraint events_participation_protection_check
    check (participation_protection or deposit_cents = 0);

commit;
