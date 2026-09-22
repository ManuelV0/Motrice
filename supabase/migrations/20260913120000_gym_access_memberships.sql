begin;

alter table public.events
  add column if not exists gym_venue_key text;

update public.events
set gym_venue_key = trim(both '-' from regexp_replace(
  lower(concat_ws('-', nullif(location_name, ''), nullif(city, ''))),
  '[^a-z0-9]+', '-', 'g'
))
where venue_type = 'gym'
  and nullif(trim(gym_venue_key), '') is null;

alter table public.events
  drop constraint if exists events_gym_access_policy_check,
  add constraint events_gym_access_policy_check
    check (
      (venue_type = 'standard' and gym_access_policy is null)
      or
      (venue_type = 'gym' and gym_access_policy in ('members_only', 'members_or_trial', 'contact_venue'))
    );

create index if not exists events_gym_venue_key_idx
  on public.events(gym_venue_key, starts_at)
  where venue_type = 'gym' and status = 'scheduled';

comment on column public.events.gym_venue_key is
  'Identificatore stabile della struttura usato per abbonamenti e prove palestra. Non contiene credenziali o dati di pagamento.';
comment on column public.events.gym_access_policy is
  'Regola di accesso fotografata alla pubblicazione: members_only, members_or_trial oppure contact_venue. È separata dalla caparra Motrice.';

create table if not exists public.gym_venue_memberships (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null check (venue_key = lower(venue_key) and venue_key ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'suspended', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  verified_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  verification_source text not null default 'gym' check (verification_source in ('gym', 'admin', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists gym_venue_memberships_active_unique
  on public.gym_venue_memberships(venue_key, user_id)
  where status = 'active';
create index if not exists gym_venue_memberships_user_idx
  on public.gym_venue_memberships(user_id, status, ends_at);

create table if not exists public.gym_trial_usages (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null check (venue_key = lower(venue_key) and venue_key ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'used' check (status in ('reserved', 'used', 'cancelled')),
  reserved_at timestamptz,
  used_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_key, user_id)
);

create index if not exists gym_trial_usages_user_idx
  on public.gym_trial_usages(user_id, status);

alter table public.gym_venue_memberships enable row level security;
alter table public.gym_trial_usages enable row level security;

drop policy if exists gym_memberships_read_own_or_admin on public.gym_venue_memberships;
create policy gym_memberships_read_own_or_admin
on public.gym_venue_memberships for select
to authenticated
using (user_id = auth.uid() or public.profile_verification_is_admin());

drop policy if exists gym_memberships_admin_write on public.gym_venue_memberships;
create policy gym_memberships_admin_write
on public.gym_venue_memberships for all
to authenticated
using (public.profile_verification_is_admin())
with check (public.profile_verification_is_admin());

drop policy if exists gym_trials_read_own_or_admin on public.gym_trial_usages;
create policy gym_trials_read_own_or_admin
on public.gym_trial_usages for select
to authenticated
using (user_id = auth.uid() or public.profile_verification_is_admin());

drop policy if exists gym_trials_admin_write on public.gym_trial_usages;
create policy gym_trials_admin_write
on public.gym_trial_usages for all
to authenticated
using (public.profile_verification_is_admin())
with check (public.profile_verification_is_admin());

revoke all on public.gym_venue_memberships from anon;
revoke all on public.gym_trial_usages from anon;
grant select on public.gym_venue_memberships to authenticated;
grant select on public.gym_trial_usages to authenticated;

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
  has_membership boolean := false;
  has_used_trial boolean := false;
begin
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if target_event.venue_type <> 'gym' then
    return jsonb_build_object(
      'status', 'not_applicable',
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

  if has_membership then
    return jsonb_build_object(
      'status', 'member',
      'venue_key', venue_key_value,
      'can_participate', true,
      'membership_verified', true,
      'trial_used', false,
      'entry_price_cents', 0
    );
  end if;

  select exists (
    select 1
    from public.gym_trial_usages trial
    where trial.venue_key = venue_key_value
      and trial.user_id = target_user_id
      and trial.status = 'used'
  ) into has_used_trial;

  if target_event.gym_access_policy = 'members_or_trial' then
    return jsonb_build_object(
      'status', case when has_used_trial then 'trial_used' else 'trial_available' end,
      'venue_key', venue_key_value,
      'can_participate', not has_used_trial,
      'membership_verified', false,
      'trial_used', has_used_trial,
      'entry_price_cents', 0
    );
  end if;

  if target_event.gym_access_policy = 'contact_venue' then
    return jsonb_build_object(
      'status', 'contact_venue',
      'venue_key', venue_key_value,
      'can_participate', true,
      'membership_verified', false,
      'trial_used', has_used_trial,
      'entry_price_cents', null
    );
  end if;

  return jsonb_build_object(
    'status', 'member_required',
    'venue_key', venue_key_value,
    'can_participate', false,
    'membership_verified', false,
    'trial_used', has_used_trial,
    'entry_price_cents', 0
  );
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

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if coalesce((access_result ->> 'can_participate')::boolean, false) then return new; end if;
  if access_result ->> 'status' = 'trial_used' then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;
  raise exception 'GYM_MEMBERSHIP_REQUIRED: serve un abbonamento attivo e verificato con questa palestra';
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

  access_result := public.resolve_event_gym_access(new.event_id, new.user_id);
  if coalesce((access_result ->> 'can_participate')::boolean, false) then return new; end if;
  if access_result ->> 'status' = 'trial_used' then
    raise exception 'GYM_TRIAL_ALREADY_USED: la prova gratuita in questa palestra è già stata utilizzata';
  end if;
  raise exception 'GYM_MEMBERSHIP_REQUIRED: serve un abbonamento attivo e verificato con questa palestra';
end;
$$;

drop trigger if exists event_participants_10_gym_access on public.event_participants;
create trigger event_participants_10_gym_access
before insert or update of status on public.event_participants
for each row execute function public.enforce_participant_gym_access();

drop trigger if exists event_join_requests_10_gym_access on public.event_join_requests;
create trigger event_join_requests_10_gym_access
before insert or update of status on public.event_join_requests
for each row execute function public.enforce_request_gym_access();

revoke all on function public.resolve_event_gym_access(uuid, uuid) from public, anon;
revoke all on function public.get_my_event_gym_access(uuid) from public, anon;
grant execute on function public.resolve_event_gym_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_event_gym_access(uuid) to authenticated, service_role;

commit;
