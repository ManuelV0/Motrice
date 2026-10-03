begin;

-- Canonical money flow for Motrice. Legacy wallet_accounts/credit_wallet tables
-- remain untouched for APK compatibility, but no longer authorize real-value
-- actions. Every balance change below is server-side and idempotent.

create table if not exists public.money_system_settings (
  singleton boolean primary key default true check (singleton),
  provider_mode text not null default 'stripe_test'
    check (provider_mode in ('stripe_test', 'stripe_live_disabled')),
  deposit_cents integer not null default 1000 check (deposit_cents = 1000),
  trial_events integer not null default 2 check (trial_events = 2),
  platform_no_show_percent integer not null default 30
    check (platform_no_show_percent = 30),
  dispute_hours integer not null default 48 check (dispute_hours = 48),
  minimum_withdrawal_cents integer not null default 1000
    check (minimum_withdrawal_cents = 1000),
  required_reserve_cents integer not null default 1000
    check (required_reserve_cents = 1000),
  deposits_enabled boolean not null default false,
  withdrawals_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.money_system_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.money_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  currency text not null default 'EUR' check (currency = 'EUR'),
  available_cents bigint not null default 0 check (available_cents >= 0),
  locked_cents bigint not null default 0 check (locked_cents >= 0),
  pending_cents bigint not null default 0 check (pending_cents >= 0),
  withdrawable_cents bigint not null default 0 check (withdrawable_cents >= 0),
  trial_events_remaining smallint not null default 2
    check (trial_events_remaining between 0 and 2),
  trial_events_used integer not null default 0 check (trial_events_used >= 0),
  stripe_customer_id text unique,
  stripe_connect_account_id text unique,
  payouts_enabled boolean not null default false,
  account_status text not null default 'active'
    check (account_status in ('active', 'restricted', 'suspended', 'closed')),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.money_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  entry_type text not null check (char_length(entry_type) between 3 and 80),
  available_delta bigint not null default 0,
  locked_delta bigint not null default 0,
  pending_delta bigint not null default 0,
  withdrawable_delta bigint not null default 0,
  idempotency_key text not null unique check (char_length(idempotency_key) between 6 and 220),
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists money_ledger_user_created_idx
  on public.money_ledger(user_id, created_at desc);
create index if not exists money_ledger_event_idx
  on public.money_ledger(event_id, created_at desc);

create table if not exists public.event_money_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in ('organizer', 'participant')),
  funding_source text not null check (funding_source in ('trial', 'balance')),
  amount_cents integer not null check (amount_cents in (0, 1000)),
  status text not null check (
    status in ('trial', 'locked', 'pending_return', 'released', 'forfeited', 'cancelled')
  ),
  cycle_key text not null check (char_length(cycle_key) between 3 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id, cycle_key)
);

create unique index if not exists event_money_holds_one_active_idx
  on public.event_money_holds(event_id, user_id)
  where status in ('trial', 'locked', 'pending_return');

create table if not exists public.event_money_settlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'disputed', 'released', 'reversed')),
  attendee_count integer not null default 0 check (attendee_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  returned_cents bigint not null default 0 check (returned_cents >= 0),
  platform_cents bigint not null default 0 check (platform_cents >= 0),
  redistributed_cents bigint not null default 0 check (redistributed_cents >= 0),
  release_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.event_money_allocations (
  id bigint generated always as identity primary key,
  settlement_id uuid not null references public.event_money_settlements(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_user_id uuid references public.profiles(id) on delete cascade,
  allocation_type text not null
    check (allocation_type in ('stake_return', 'no_show_share', 'platform_fee')),
  destination_bucket text not null
    check (destination_bucket in ('available', 'withdrawable', 'platform')),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'released', 'reversed')),
  release_at timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists event_money_allocations_due_idx
  on public.event_money_allocations(status, release_at);

create table if not exists public.money_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 1000),
  from_available_cents bigint not null default 0 check (from_available_cents >= 0),
  from_withdrawable_cents bigint not null default 0 check (from_withdrawable_cents >= 0),
  withdraw_all boolean not null default false,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'paid', 'failed', 'cancelled')),
  provider_reference text unique,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.money_withdrawal_requests
  drop constraint if exists money_withdrawal_requests_source_total_check;
alter table public.money_withdrawal_requests
  add constraint money_withdrawal_requests_source_total_check
  check (from_available_cents + from_withdrawable_cents = amount_cents);

create table if not exists public.money_disputes (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.event_money_settlements(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text
);

create unique index if not exists money_disputes_one_open_per_user_idx
  on public.money_disputes(settlement_id, opened_by)
  where status = 'open';

create table if not exists public.money_provider_events (
  provider_event_id text primary key,
  provider_mode text not null check (provider_mode in ('stripe_test', 'stripe_live')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.platform_money_ledger (
  id bigint generated always as identity primary key,
  event_id uuid references public.events(id) on delete set null,
  amount_cents bigint not null check (amount_cents <> 0),
  entry_type text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists money_accounts_set_updated_at on public.money_accounts;
create trigger money_accounts_set_updated_at
before update on public.money_accounts
for each row execute function public.set_updated_at();

drop trigger if exists event_money_holds_set_updated_at on public.event_money_holds;
create trigger event_money_holds_set_updated_at
before update on public.event_money_holds
for each row execute function public.set_updated_at();

drop trigger if exists money_withdrawal_requests_set_updated_at on public.money_withdrawal_requests;
create trigger money_withdrawal_requests_set_updated_at
before update on public.money_withdrawal_requests
for each row execute function public.set_updated_at();

create or replace function public.reject_money_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Il ledger monetario è immutabile' using errcode = '42501';
end;
$$;

drop trigger if exists money_ledger_immutable on public.money_ledger;
create trigger money_ledger_immutable
before update or delete on public.money_ledger
for each row execute function public.reject_money_ledger_mutation();

create or replace function public.ensure_money_account(target_user_id uuid)
returns public.money_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.money_accounts%rowtype;
begin
  if target_user_id is null then raise exception 'Utente non valido'; end if;

  insert into public.money_accounts (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;

  select * into account
  from public.money_accounts
  where user_id = target_user_id
  for update;

  return account;
end;
$$;

create or replace function public.money_can_fund_event(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.money_accounts%rowtype;
begin
  account := public.ensure_money_account(target_user_id);
  return jsonb_build_object(
    'can_participate', account.account_status = 'active'
      and (account.trial_events_remaining > 0 or account.available_cents >= 1000),
    'funding_source', case
      when account.account_status <> 'active' then 'none'
      when account.trial_events_remaining > 0 then 'trial'
      when account.available_cents >= 1000 then 'balance'
      else 'none'
    end,
    'trial_events_remaining', account.trial_events_remaining,
    'amount_missing_cents', greatest(0, 1000 - account.available_cents)
  );
end;
$$;

create or replace function public.reserve_event_money(
  target_event_id uuid,
  target_user_id uuid,
  target_role text,
  target_cycle_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.money_accounts%rowtype;
  active_hold public.event_money_holds%rowtype;
  created_hold public.event_money_holds%rowtype;
begin
  if target_role not in ('organizer', 'participant') then raise exception 'Ruolo monetario non valido'; end if;
  if trim(coalesce(target_cycle_key, '')) = '' then raise exception 'Ciclo prenotazione non valido'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 91001));
  account := public.ensure_money_account(target_user_id);

  if account.account_status <> 'active' then
    raise exception 'WALLET_RESTRICTED: il wallet non è abilitato';
  end if;

  select * into active_hold
  from public.event_money_holds
  where event_id = target_event_id
    and user_id = target_user_id
    and status in ('trial', 'locked', 'pending_return')
  for update;

  if found then
    return jsonb_build_object(
      'hold_id', active_hold.id,
      'funding_source', active_hold.funding_source,
      'amount_cents', active_hold.amount_cents,
      'trial_events_remaining', account.trial_events_remaining,
      'already_reserved', true
    );
  end if;

  if account.trial_events_remaining > 0 then
    update public.money_accounts
    set
      trial_events_remaining = trial_events_remaining - 1,
      trial_events_used = trial_events_used + 1,
      version = version + 1
    where user_id = target_user_id
    returning * into account;

    insert into public.event_money_holds (
      event_id, user_id, role_key, funding_source, amount_cents, status, cycle_key
    ) values (
      target_event_id, target_user_id, target_role, 'trial', 0, 'trial', target_cycle_key
    ) returning * into created_hold;

    insert into public.money_ledger (
      user_id, event_id, entry_type, idempotency_key, metadata
    ) values (
      target_user_id,
      target_event_id,
      'trial_event_used',
      'trial:' || target_event_id::text || ':' || target_user_id::text || ':' || target_cycle_key,
      jsonb_build_object('role', target_role, 'remaining', account.trial_events_remaining)
    ) on conflict (idempotency_key) do nothing;
  elsif account.available_cents >= 1000 then
    update public.money_accounts
    set
      available_cents = available_cents - 1000,
      locked_cents = locked_cents + 1000,
      version = version + 1
    where user_id = target_user_id
    returning * into account;

    insert into public.event_money_holds (
      event_id, user_id, role_key, funding_source, amount_cents, status, cycle_key
    ) values (
      target_event_id, target_user_id, target_role, 'balance', 1000, 'locked', target_cycle_key
    ) returning * into created_hold;

    insert into public.money_ledger (
      user_id, event_id, entry_type, available_delta, locked_delta,
      idempotency_key, metadata
    ) values (
      target_user_id,
      target_event_id,
      'event_deposit_locked',
      -1000,
      1000,
      'hold:' || target_event_id::text || ':' || target_user_id::text || ':' || target_cycle_key,
      jsonb_build_object('role', target_role)
    ) on conflict (idempotency_key) do nothing;
  else
    raise exception 'DEPOSIT_REQUIRED: deposita 10 € per continuare a creare o partecipare agli eventi';
  end if;

  return jsonb_build_object(
    'hold_id', created_hold.id,
    'funding_source', created_hold.funding_source,
    'amount_cents', created_hold.amount_cents,
    'trial_events_remaining', account.trial_events_remaining,
    'already_reserved', false
  );
end;
$$;

-- New events always use the fixed 10 EUR reserve. Personal reminders remain free.
create or replace function public.enforce_canonical_event_deposit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_personal, false) then
    new.deposit_cents := 0;
    new.participation_protection := false;
  else
    new.deposit_cents := 1000;
    new.participation_protection := true;
  end if;
  return new;
end;
$$;

drop trigger if exists events_05_enforce_canonical_deposit on public.events;
create trigger events_05_enforce_canonical_deposit
before insert on public.events
for each row execute function public.enforce_canonical_event_deposit();

-- Replaces the legacy creator trigger: the organizer is a real participant and
-- uses one trial event or locks the same 10 EUR reserve as everyone else.
create or replace function public.add_event_creator_as_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  funding jsonb;
  stake integer := 0;
begin
  if coalesce(new.is_personal, false) then
    funding := jsonb_build_object('funding_source', 'personal', 'amount_cents', 0);
  else
    funding := public.reserve_event_money(
      new.id,
      new.creator_id,
      'organizer',
      'creator:' || new.id::text
    );
    stake := coalesce((funding ->> 'amount_cents')::integer, 0);
  end if;

  insert into public.event_participants (
    event_id, user_id, status, stake_cents, stake_status, cashback_percent
  ) values (
    new.id,
    new.creator_id,
    'going',
    stake,
    case when stake > 0 then 'locked' else 'waived' end,
    0
  )
  on conflict (event_id, user_id) do update
  set
    status = 'going',
    stake_cents = excluded.stake_cents,
    stake_status = excluded.stake_status,
    cashback_percent = 0,
    updated_at = now();
  return new;
end;
$$;

-- Open event booking. All value movement happens before membership is written,
-- in the same transaction and under a per-user advisory lock.
create or replace function public.join_event(
  target_event_id uuid,
  participant_skill_level text default 'beginner',
  participant_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  existing_participant public.event_participants%rowtype;
  occupied integer;
  joined_at_value timestamptz := clock_timestamp();
  funding jsonb;
  effective_stake integer := 0;
  personal_token text;
begin
  if actor_id is null then raise exception 'Devi accedere per partecipare'; end if;
  if participant_skill_level not in ('beginner', 'intermediate', 'advanced') then raise exception 'Livello non valido'; end if;

  select * into target_event from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;
  if target_event.is_personal then raise exception 'Questo evento è un promemoria personale'; end if;
  if target_event.join_policy = 'approval' then raise exception 'Questo evento richiede l approvazione dell organizer'; end if;
  if target_event.starts_at <= now() then raise exception 'Evento già iniziato'; end if;

  select * into existing_participant
  from public.event_participants
  where event_id = target_event_id and user_id = actor_id
  for update;
  if found and existing_participant.status = 'going' then
    personal_token := public.issue_event_participant_qr(target_event_id, actor_id);
    return jsonb_build_object('success', true, 'already_joined', true, 'qr_token', personal_token);
  end if;

  select count(*)::integer into occupied
  from public.event_participants
  where event_id = target_event_id and status in ('going', 'completed');
  if occupied >= target_event.max_participants then raise exception 'Evento completo: posti disponibili terminati'; end if;

  funding := public.reserve_event_money(
    target_event_id,
    actor_id,
    'participant',
    floor(extract(epoch from joined_at_value) * 1000)::bigint::text
  );
  effective_stake := coalesce((funding ->> 'amount_cents')::integer, 0);

  insert into public.event_participants (
    event_id, user_id, status, skill_level, note, stake_cents, stake_status,
    cashback_percent, joined_at, updated_at
  ) values (
    target_event_id, actor_id, 'going', participant_skill_level,
    left(coalesce(participant_note, ''), 500), effective_stake,
    case when effective_stake > 0 then 'locked' else 'waived' end,
    0, joined_at_value, now()
  )
  on conflict (event_id, user_id) do update
  set
    status = 'going', skill_level = excluded.skill_level, note = excluded.note,
    stake_cents = excluded.stake_cents, stake_status = excluded.stake_status,
    cashback_percent = 0, checked_in_at = null, checked_in_by = null,
    checkin_lat = null, checkin_lng = null, minimum_reached_at = null,
    completed_at = null, review_bonus_awarded = false,
    joined_at = joined_at_value, updated_at = now();

  personal_token := public.issue_event_participant_qr(target_event_id, actor_id);
  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    actor_id, actor_id, target_event_id, 'rsvp_confirmed',
    'Partecipazione confermata', target_event.title,
    jsonb_build_object(
      'deposit_cents', effective_stake,
      'funding_source', funding ->> 'funding_source',
      'trial_events_remaining', funding ->> 'trial_events_remaining'
    )
  );

  return jsonb_build_object(
    'success', true,
    'already_joined', false,
    'participants_count', occupied + 1,
    'deposit_cents', effective_stake,
    'funding_source', funding ->> 'funding_source',
    'trial_events_remaining', (funding ->> 'trial_events_remaining')::integer,
    'stake_status', case when effective_stake > 0 then 'locked' else 'waived' end,
    'qr_token', personal_token
  );
end;
$$;

-- Approval requests reserve the trial/deposit immediately. This guarantees
-- that a later organizer approval cannot fail because the balance changed.
create or replace function public.request_event_join(
  target_event_id uuid,
  participant_skill_level text default 'beginner',
  participant_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  funding jsonb;
  occupied integer;
begin
  if actor_id is null then raise exception 'Devi accedere per richiedere di partecipare'; end if;
  if participant_skill_level not in ('beginner', 'intermediate', 'advanced') then raise exception 'Livello non valido'; end if;
  select * into target_event from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' or target_event.starts_at <= now() then raise exception 'Evento non disponibile'; end if;
  if target_event.is_personal or target_event.join_policy <> 'approval' then raise exception 'Richiesta non prevista per questo evento'; end if;
  if target_event.creator_id = actor_id then return jsonb_build_object('success', true, 'already_joined', true, 'pending', false); end if;
  if exists (select 1 from public.event_participants where event_id = target_event_id and user_id = actor_id and status in ('going', 'completed')) then
    return jsonb_build_object('success', true, 'already_joined', true, 'pending', false);
  end if;

  select count(*)::integer into occupied from public.event_participants
  where event_id = target_event_id and status in ('going', 'completed');
  if occupied >= target_event.max_participants then raise exception 'Evento completo: posti disponibili terminati'; end if;

  funding := public.reserve_event_money(
    target_event_id,
    actor_id,
    'participant',
    'request:' || target_event_id::text || ':' || actor_id::text
  );

  insert into public.event_join_requests (
    event_id, user_id, status, skill_level, note, requested_at,
    decided_at, decided_by, updated_at
  ) values (
    target_event_id, actor_id, 'pending', participant_skill_level,
    left(coalesce(participant_note, ''), 500), now(), null, null, now()
  ) on conflict (event_id, user_id) do update
  set status = 'pending', skill_level = excluded.skill_level, note = excluded.note,
      requested_at = now(), decided_at = null, decided_by = null, updated_at = now();

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    target_event.creator_id, actor_id, target_event_id,
    'event_join_requested', 'Nuova richiesta di partecipazione', target_event.title,
    jsonb_build_object(
      'requester_id', actor_id,
      'funding_source', funding ->> 'funding_source',
      'deposit_cents', coalesce((funding ->> 'amount_cents')::integer, 0)
    )
  );
  return jsonb_build_object(
    'success', true,
    'pending', true,
    'event_id', target_event_id,
    'deposit_cents', coalesce((funding ->> 'amount_cents')::integer, 0),
    'funding_source', funding ->> 'funding_source',
    'trial_events_remaining', (funding ->> 'trial_events_remaining')::integer
  );
end;
$$;

create or replace function public.approve_event_join_request(
  target_event_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  request_row public.event_join_requests%rowtype;
  joined_at_value timestamptz := clock_timestamp();
  occupied integer;
  funding jsonb;
  effective_stake integer := 0;
  personal_token text;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into target_event from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then raise exception 'Solo l organizer può approvare'; end if;
  if target_event.status <> 'scheduled' or target_event.starts_at <= now() then raise exception 'Evento non disponibile'; end if;

  select * into request_row from public.event_join_requests
  where event_id = target_event_id and user_id = target_user_id and status = 'pending'
  for update;
  if not found then raise exception 'Richiesta non disponibile'; end if;

  select count(*)::integer into occupied from public.event_participants
  where event_id = target_event_id and status in ('going', 'completed');
  if occupied >= target_event.max_participants then raise exception 'Evento completo: posti disponibili terminati'; end if;

  funding := public.reserve_event_money(
    target_event_id,
    target_user_id,
    'participant',
    floor(extract(epoch from joined_at_value) * 1000)::bigint::text
  );
  effective_stake := coalesce((funding ->> 'amount_cents')::integer, 0);

  insert into public.event_participants (
    event_id, user_id, status, skill_level, note, stake_cents, stake_status,
    cashback_percent, joined_at, updated_at
  ) values (
    target_event_id, target_user_id, 'going', request_row.skill_level,
    request_row.note, effective_stake,
    case when effective_stake > 0 then 'locked' else 'waived' end,
    0, joined_at_value, now()
  ) on conflict (event_id, user_id) do update
  set status = 'going', skill_level = excluded.skill_level, note = excluded.note,
      stake_cents = excluded.stake_cents, stake_status = excluded.stake_status,
      cashback_percent = 0, checked_in_at = null, checked_in_by = null,
      minimum_reached_at = null, completed_at = null,
      joined_at = joined_at_value, updated_at = now();

  personal_token := public.issue_event_participant_qr(target_event_id, target_user_id);
  update public.event_join_requests
  set status = 'approved', decided_at = now(), decided_by = actor_id, updated_at = now()
  where event_id = target_event_id and user_id = target_user_id;

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    target_user_id, actor_id, target_event_id, 'event_join_approved',
    'Richiesta approvata', target_event.title,
    jsonb_build_object('deposit_cents', effective_stake, 'funding_source', funding ->> 'funding_source')
  );

  return jsonb_build_object(
    'success', true, 'approved', true, 'deposit_cents', effective_stake,
    'funding_source', funding ->> 'funding_source', 'qr_token', personal_token
  );
end;
$$;

create or replace function public.decline_event_join_request(
  target_event_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  request_row public.event_join_requests%rowtype;
  hold public.event_money_holds%rowtype;
  hold_released boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into target_event from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then raise exception 'Solo l organizer può rifiutare'; end if;

  select * into request_row from public.event_join_requests
  where event_id = target_event_id and user_id = target_user_id and status = 'pending'
  for update;
  if not found then raise exception 'Richiesta non disponibile'; end if;

  select * into hold from public.event_money_holds
  where event_id = target_event_id and user_id = target_user_id and status in ('trial', 'locked')
  for update;
  if found then
    if hold.funding_source = 'trial' then
      update public.money_accounts
      set trial_events_remaining = least(2, trial_events_remaining + 1),
          trial_events_used = greatest(0, trial_events_used - 1),
          version = version + 1
      where user_id = target_user_id;
      insert into public.money_ledger (
        user_id, event_id, entry_type, idempotency_key, metadata
      ) values (
        target_user_id, target_event_id, 'trial_event_restored',
        'request-trial-restored:' || hold.id::text,
        jsonb_build_object('reason', 'join_request_declined')
      ) on conflict (idempotency_key) do nothing;
    else
      update public.money_accounts
      set available_cents = available_cents + hold.amount_cents,
          locked_cents = locked_cents - hold.amount_cents,
          version = version + 1
      where user_id = target_user_id and locked_cents >= hold.amount_cents;
      if not found then
        raise exception 'Invariante contabile violato durante il rilascio della richiesta';
      end if;
      insert into public.money_ledger (
        user_id, event_id, entry_type, available_delta, locked_delta,
        idempotency_key, metadata
      ) values (
        target_user_id, target_event_id, 'join_request_declined',
        hold.amount_cents, -hold.amount_cents,
        'request-declined:' || hold.id::text,
        jsonb_build_object('restored_to', 'available')
      ) on conflict (idempotency_key) do nothing;
    end if;
    update public.event_money_holds set status = 'cancelled' where id = hold.id;
    hold_released := true;
  end if;

  update public.event_join_requests
  set status = 'declined', decided_at = now(), decided_by = actor_id, updated_at = now()
  where event_id = target_event_id and user_id = target_user_id and status = 'pending';

  insert into public.notifications (user_id, actor_id, event_id, type, title, body)
  values (
    target_user_id, actor_id, target_event_id, 'event_join_declined',
    'Richiesta non approvata', target_event.title
  );
  return jsonb_build_object('success', true, 'declined', true, 'deposit_released', hold_released);
end;
$$;

create or replace function public.money_event_user_is_present(
  target_event_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.event_participants participant
      where participant.event_id = target_event_id
        and participant.user_id = target_user_id
        and (
          participant.status = 'completed'
          or participant.minimum_reached_at is not null
          or participant.completed_at is not null
        )
    )
    or exists (
      select 1 from public.event_workout_sessions session
      where session.event_id = target_event_id
        and session.user_id = target_user_id
        and (session.completed_at is not null or session.progress_percent >= 100)
    )
    or exists (
      select 1
      from public.event_presence_samples sample
      join public.events event on event.id = sample.event_id
      where sample.event_id = target_event_id
        and sample.user_id = target_user_id
        and sample.is_in_radius
      group by event.minimum_presence_minutes
      having count(*) >= greatest(2, ceil(event.minimum_presence_minutes / 5.0)::integer)
        and extract(epoch from (max(sample.recorded_at) - min(sample.recorded_at))) / 60
          >= greatest(1, event.minimum_presence_minutes - 2)
    );
$$;

create or replace function public.prepare_event_money_settlement(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings public.money_system_settings%rowtype;
  settlement public.event_money_settlements%rowtype;
  hold public.event_money_holds%rowtype;
  attendee_ids uuid[] := array[]::uuid[];
  attendee_id uuid;
  attendee_count_value integer := 0;
  no_show_count_value integer := 0;
  returned_total bigint := 0;
  forfeited_total bigint := 0;
  platform_total bigint := 0;
  redistributed_total bigint := 0;
  share_base bigint := 0;
  share_remainder bigint := 0;
  share_amount bigint := 0;
  release_at_value timestamptz;
begin
  select * into settings from public.money_system_settings where singleton;
  select * into settlement from public.event_money_settlements
  where event_id = target_event_id for update;
  if found then return to_jsonb(settlement); end if;

  if not exists (select 1 from public.events where id = target_event_id and status = 'completed') then
    raise exception 'L evento deve essere concluso prima del regolamento';
  end if;

  select coalesce(array_agg(active.user_id order by active.user_id::text), array[]::uuid[])
  into attendee_ids
  from (
    select distinct h.user_id
    from public.event_money_holds h
    where h.event_id = target_event_id
      and h.status in ('trial', 'locked')
      and public.money_event_user_is_present(target_event_id, h.user_id)
  ) active;
  attendee_count_value := coalesce(array_length(attendee_ids, 1), 0);
  release_at_value := now() + make_interval(hours => settings.dispute_hours);

  insert into public.event_money_settlements (event_id, release_at)
  values (target_event_id, release_at_value)
  returning * into settlement;

  for hold in
    select * from public.event_money_holds
    where event_id = target_event_id and status in ('trial', 'locked')
    order by user_id::text
    for update
  loop
    if public.money_event_user_is_present(target_event_id, hold.user_id) then
      if hold.funding_source = 'balance' and hold.amount_cents > 0 then
        update public.money_accounts
        set locked_cents = locked_cents - hold.amount_cents,
            pending_cents = pending_cents + hold.amount_cents,
            version = version + 1
        where user_id = hold.user_id and locked_cents >= hold.amount_cents;
        if not found then
          raise exception 'Invariante contabile violato nel rimborso della caparra';
        end if;

        insert into public.money_ledger (
          user_id, event_id, entry_type, locked_delta, pending_delta,
          idempotency_key, metadata
        ) values (
          hold.user_id, target_event_id, 'stake_return_pending',
          -hold.amount_cents, hold.amount_cents,
          'settlement:return:' || settlement.id::text || ':' || hold.user_id::text,
          jsonb_build_object('release_at', release_at_value)
        ) on conflict (idempotency_key) do nothing;

        insert into public.event_money_allocations (
          settlement_id, event_id, beneficiary_user_id, allocation_type,
          destination_bucket, amount_cents, release_at, idempotency_key
        ) values (
          settlement.id, target_event_id, hold.user_id, 'stake_return',
          'available', hold.amount_cents, release_at_value,
          'allocation:return:' || settlement.id::text || ':' || hold.user_id::text
        ) on conflict (idempotency_key) do nothing;
        returned_total := returned_total + hold.amount_cents;
        update public.event_money_holds set status = 'pending_return' where id = hold.id;
      else
        update public.event_money_holds set status = 'released' where id = hold.id;
      end if;
    else
      no_show_count_value := no_show_count_value + 1;
      if hold.funding_source = 'balance' and hold.amount_cents > 0 then
        update public.money_accounts
        set locked_cents = locked_cents - hold.amount_cents,
            version = version + 1
        where user_id = hold.user_id and locked_cents >= hold.amount_cents;
        if not found then
          raise exception 'Invariante contabile violato nella gestione del no-show';
        end if;
        insert into public.money_ledger (
          user_id, event_id, entry_type, locked_delta, idempotency_key, metadata
        ) values (
          hold.user_id, target_event_id, 'no_show_forfeit', -hold.amount_cents,
          'settlement:forfeit:' || settlement.id::text || ':' || hold.user_id::text,
          jsonb_build_object('platform_percent', settings.platform_no_show_percent)
        ) on conflict (idempotency_key) do nothing;
        forfeited_total := forfeited_total + hold.amount_cents;
      end if;
      update public.event_money_holds set status = 'forfeited' where id = hold.id;
    end if;
  end loop;

  if forfeited_total > 0 then
    platform_total := case
      when attendee_count_value = 0 then forfeited_total
      else floor(forfeited_total * settings.platform_no_show_percent / 100.0)::bigint
    end;
    redistributed_total := forfeited_total - platform_total;

    if platform_total > 0 then
      insert into public.event_money_allocations (
        settlement_id, event_id, allocation_type, destination_bucket,
        amount_cents, release_at, idempotency_key
      ) values (
        settlement.id, target_event_id, 'platform_fee', 'platform',
        platform_total, release_at_value,
        'allocation:platform:' || settlement.id::text
      ) on conflict (idempotency_key) do nothing;
    end if;

    if attendee_count_value > 0 and redistributed_total > 0 then
      share_base := floor(redistributed_total::numeric / attendee_count_value)::bigint;
      share_remainder := redistributed_total - share_base * attendee_count_value;
      foreach attendee_id in array attendee_ids loop
        share_amount := share_base + case when share_remainder > 0 then 1 else 0 end;
        share_remainder := greatest(0, share_remainder - 1);
        perform public.ensure_money_account(attendee_id);
        update public.money_accounts
        set pending_cents = pending_cents + share_amount, version = version + 1
        where user_id = attendee_id;
        insert into public.money_ledger (
          user_id, event_id, entry_type, pending_delta, idempotency_key, metadata
        ) values (
          attendee_id, target_event_id, 'no_show_share_pending', share_amount,
          'settlement:share:' || settlement.id::text || ':' || attendee_id::text,
          jsonb_build_object('release_at', release_at_value)
        ) on conflict (idempotency_key) do nothing;
        insert into public.event_money_allocations (
          settlement_id, event_id, beneficiary_user_id, allocation_type,
          destination_bucket, amount_cents, release_at, idempotency_key
        ) values (
          settlement.id, target_event_id, attendee_id, 'no_show_share',
          'withdrawable', share_amount, release_at_value,
          'allocation:share:' || settlement.id::text || ':' || attendee_id::text
        ) on conflict (idempotency_key) do nothing;
      end loop;
    end if;
  end if;

  update public.event_money_settlements
  set attendee_count = attendee_count_value,
      no_show_count = no_show_count_value,
      returned_cents = returned_total,
      platform_cents = platform_total,
      redistributed_cents = redistributed_total
  where id = settlement.id
  returning * into settlement;

  return to_jsonb(settlement);
end;
$$;

create or replace function public.on_event_money_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform public.prepare_event_money_settlement(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists events_money_settle_after_completion on public.events;
create trigger events_money_settle_after_completion
after update of status on public.events
for each row execute function public.on_event_money_completed();

create or replace function public.release_due_money_settlements()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allocation public.event_money_allocations%rowtype;
  released_count integer := 0;
begin
  for allocation in
    select item.*
    from public.event_money_allocations item
    join public.event_money_settlements settlement on settlement.id = item.settlement_id
    where item.status = 'pending'
      and item.release_at <= now()
      and settlement.status = 'pending'
    order by item.id
    for update of item skip locked
  loop
    if allocation.destination_bucket = 'available' then
      update public.money_accounts
      set pending_cents = pending_cents - allocation.amount_cents,
          available_cents = available_cents + allocation.amount_cents,
          version = version + 1
      where user_id = allocation.beneficiary_user_id
        and pending_cents >= allocation.amount_cents;
      if not found then
        raise exception 'Invariante contabile violato nel rilascio del rimborso';
      end if;
      insert into public.money_ledger (
        user_id, event_id, entry_type, available_delta, pending_delta, idempotency_key
      ) values (
        allocation.beneficiary_user_id, allocation.event_id, 'stake_return_released',
        allocation.amount_cents, -allocation.amount_cents,
        'release:' || allocation.id::text
      ) on conflict (idempotency_key) do nothing;
      update public.event_money_holds
      set status = 'released'
      where event_id = allocation.event_id
        and user_id = allocation.beneficiary_user_id
        and status = 'pending_return';
    elsif allocation.destination_bucket = 'withdrawable' then
      update public.money_accounts
      set pending_cents = pending_cents - allocation.amount_cents,
          withdrawable_cents = withdrawable_cents + allocation.amount_cents,
          version = version + 1
      where user_id = allocation.beneficiary_user_id
        and pending_cents >= allocation.amount_cents;
      if not found then
        raise exception 'Invariante contabile violato nel rilascio della quota no-show';
      end if;
      insert into public.money_ledger (
        user_id, event_id, entry_type, pending_delta, withdrawable_delta, idempotency_key
      ) values (
        allocation.beneficiary_user_id, allocation.event_id, 'no_show_share_released',
        -allocation.amount_cents, allocation.amount_cents,
        'release:' || allocation.id::text
      ) on conflict (idempotency_key) do nothing;
    else
      insert into public.platform_money_ledger (
        event_id, amount_cents, entry_type, idempotency_key, metadata
      ) values (
        allocation.event_id, allocation.amount_cents, 'no_show_platform_fee',
        'release:' || allocation.id::text,
        jsonb_build_object('settlement_id', allocation.settlement_id)
      ) on conflict (idempotency_key) do nothing;
    end if;

    update public.event_money_allocations
    set status = 'released', released_at = now()
    where id = allocation.id;
    released_count := released_count + 1;
  end loop;

  update public.event_money_settlements settlement
  set status = 'released', released_at = now()
  where settlement.status = 'pending'
    and not exists (
      select 1 from public.event_money_allocations item
      where item.settlement_id = settlement.id and item.status = 'pending'
    );

  return jsonb_build_object('success', true, 'released_allocations', released_count);
end;
$$;

create or replace function public.get_my_money_wallet()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  account public.money_accounts%rowtype;
  settings public.money_system_settings%rowtype;
  settled bigint;
  standard_max bigint;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  account := public.ensure_money_account(actor_id);
  select * into settings from public.money_system_settings where singleton;
  settled := account.available_cents + account.withdrawable_cents;
  standard_max := greatest(0, settled - settings.required_reserve_cents);
  return jsonb_build_object(
    'currency', account.currency,
    'available_cents', account.available_cents,
    'locked_cents', account.locked_cents,
    'pending_cents', account.pending_cents,
    'withdrawable_cents', account.withdrawable_cents,
    'total_cents', account.available_cents + account.locked_cents + account.pending_cents + account.withdrawable_cents,
    'trial_events_remaining', account.trial_events_remaining,
    'trial_events_used', account.trial_events_used,
    'can_participate', account.account_status = 'active' and (account.trial_events_remaining > 0 or account.available_cents >= 1000),
    'funding_source', case when account.trial_events_remaining > 0 then 'trial' when account.available_cents >= 1000 then 'balance' else 'none' end,
    'amount_missing_cents', case when account.trial_events_remaining > 0 then 0 else greatest(0, 1000 - account.available_cents) end,
    'provider_mode', settings.provider_mode,
    'deposits_enabled', settings.deposits_enabled,
    'withdrawals_enabled', settings.withdrawals_enabled and account.payouts_enabled,
    'withdrawal', jsonb_build_object(
      'settled_cents', settled,
      'minimum_cents', settings.minimum_withdrawal_cents,
      'required_reserve_cents', settings.required_reserve_cents,
      'standard_maximum_cents', standard_max,
      'can_withdraw_standard', settled >= settings.required_reserve_cents + settings.minimum_withdrawal_cents
        and standard_max >= settings.minimum_withdrawal_cents,
      'can_withdraw_all', settled > 0
    )
  );
end;
$$;

create or replace function public.open_event_money_dispute(
  target_event_id uuid,
  dispute_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  settlement public.event_money_settlements%rowtype;
  created_dispute public.money_disputes%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if char_length(trim(coalesce(dispute_reason, ''))) < 5 then raise exception 'Descrivi il problema'; end if;
  if not exists (
    select 1 from public.event_participants
    where event_id = target_event_id and user_id = actor_id
  ) then raise exception 'Puoi contestare soltanto un evento a cui hai partecipato'; end if;

  select * into settlement from public.event_money_settlements
  where event_id = target_event_id for update;
  if not found then raise exception 'Regolamento non disponibile'; end if;
  if settlement.status <> 'pending' or settlement.release_at <= now() then raise exception 'La finestra di contestazione è chiusa'; end if;

  insert into public.money_disputes (settlement_id, event_id, opened_by, reason)
  values (settlement.id, target_event_id, actor_id, left(trim(dispute_reason), 500))
  returning * into created_dispute;
  update public.event_money_settlements set status = 'disputed' where id = settlement.id;
  return to_jsonb(created_dispute);
end;
$$;

create or replace function public.request_money_withdrawal(
  requested_amount_cents integer default null,
  withdraw_all boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  account public.money_accounts%rowtype;
  settings public.money_system_settings%rowtype;
  amount bigint;
  settled bigint;
  from_withdrawable bigint;
  from_available bigint;
  request_row public.money_withdrawal_requests%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into settings from public.money_system_settings where singleton;
  account := public.ensure_money_account(actor_id);
  if not settings.withdrawals_enabled or not account.payouts_enabled then
    raise exception 'Prelievi non ancora abilitati per questo account';
  end if;
  if exists (select 1 from public.money_withdrawal_requests where user_id = actor_id and status in ('requested', 'processing')) then
    raise exception 'Hai già un prelievo in lavorazione';
  end if;

  settled := account.available_cents + account.withdrawable_cents;
  amount := case when withdraw_all then settled else coalesce(requested_amount_cents, 0) end;
  if amount < settings.minimum_withdrawal_cents then raise exception 'Importo minimo di prelievo: 10 €'; end if;
  if amount > settled then raise exception 'Saldo prelevabile insufficiente'; end if;
  if not withdraw_all and settled - amount < settings.required_reserve_cents then
    raise exception 'Il prelievo standard deve lasciare 10 € di riserva';
  end if;

  from_withdrawable := least(account.withdrawable_cents, amount);
  from_available := amount - from_withdrawable;
  update public.money_accounts
  set withdrawable_cents = withdrawable_cents - from_withdrawable,
      available_cents = available_cents - from_available,
      version = version + 1
  where user_id = actor_id
    and withdrawable_cents >= from_withdrawable
    and available_cents >= from_available;
  if not found then
    raise exception 'Saldo modificato durante la richiesta: riprova';
  end if;

  insert into public.money_withdrawal_requests (
    user_id, amount_cents, from_available_cents, from_withdrawable_cents, withdraw_all
  )
  values (actor_id, amount, from_available, from_withdrawable, withdraw_all)
  returning * into request_row;
  insert into public.money_ledger (
    user_id, entry_type, available_delta, withdrawable_delta,
    idempotency_key, metadata
  ) values (
    actor_id, 'withdrawal_requested', -from_available, -from_withdrawable,
    'withdrawal:' || request_row.id::text,
    jsonb_build_object(
      'withdraw_all', withdraw_all,
      'provider_mode', settings.provider_mode,
      'from_available_cents', from_available,
      'from_withdrawable_cents', from_withdrawable
    )
  );
  return to_jsonb(request_row);
end;
$$;

-- Service-role payout callbacks. A failed payout restores the exact source
-- buckets once; provider retries are harmless because the request row is locked.
create or replace function public.complete_money_withdrawal(
  target_request_id uuid,
  provider_reference_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.money_withdrawal_requests%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role richiesta' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(provider_reference_value, '')), '') is null then
    raise exception 'Riferimento provider obbligatorio';
  end if;

  select * into request_row
  from public.money_withdrawal_requests
  where id = target_request_id
  for update;
  if not found then raise exception 'Richiesta di prelievo non trovata'; end if;
  if request_row.status = 'paid' then return to_jsonb(request_row); end if;
  if request_row.status not in ('requested', 'processing') then
    raise exception 'Richiesta di prelievo non completabile';
  end if;

  update public.money_withdrawal_requests
  set status = 'paid', provider_reference = provider_reference_value,
      failure_reason = null, completed_at = now()
  where id = target_request_id
  returning * into request_row;

  insert into public.money_ledger (
    user_id, entry_type, idempotency_key, provider_reference, metadata
  ) values (
    request_row.user_id, 'withdrawal_paid',
    'withdrawal-paid:' || request_row.id::text,
    provider_reference_value,
    jsonb_build_object('amount_cents', request_row.amount_cents)
  ) on conflict (idempotency_key) do nothing;
  return to_jsonb(request_row);
end;
$$;

create or replace function public.fail_money_withdrawal(
  target_request_id uuid,
  failure_reason_value text default 'Payout non riuscito'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.money_withdrawal_requests%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role richiesta' using errcode = '42501';
  end if;
  select * into request_row
  from public.money_withdrawal_requests
  where id = target_request_id
  for update;
  if not found then raise exception 'Richiesta di prelievo non trovata'; end if;
  if request_row.status = 'failed' then return to_jsonb(request_row); end if;
  if request_row.status not in ('requested', 'processing') then
    raise exception 'Richiesta di prelievo non ripristinabile';
  end if;

  update public.money_accounts
  set available_cents = available_cents + request_row.from_available_cents,
      withdrawable_cents = withdrawable_cents + request_row.from_withdrawable_cents,
      version = version + 1
  where user_id = request_row.user_id;
  if not found then
    raise exception 'Account contabile non trovato durante il ripristino';
  end if;

  update public.money_withdrawal_requests
  set status = 'failed', failure_reason = left(coalesce(failure_reason_value, 'Payout non riuscito'), 500),
      completed_at = now()
  where id = target_request_id
  returning * into request_row;

  insert into public.money_ledger (
    user_id, entry_type, available_delta, withdrawable_delta,
    idempotency_key, metadata
  ) values (
    request_row.user_id, 'withdrawal_failed_restored',
    request_row.from_available_cents, request_row.from_withdrawable_cents,
    'withdrawal-failed:' || request_row.id::text,
    jsonb_build_object('amount_cents', request_row.amount_cents, 'reason', request_row.failure_reason)
  ) on conflict (idempotency_key) do nothing;
  return to_jsonb(request_row);
end;
$$;

-- An accepted dispute remains frozen for manual financial review. Rejecting
-- the dispute safely reopens the existing settlement for normal release.
create or replace function public.resolve_event_money_dispute(
  target_dispute_id uuid,
  decision text,
  resolution_note_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dispute_row public.money_disputes%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role richiesta' using errcode = '42501';
  end if;
  if decision not in ('accepted', 'rejected') then
    raise exception 'Decisione non valida';
  end if;

  select * into dispute_row
  from public.money_disputes
  where id = target_dispute_id
  for update;
  if not found then raise exception 'Contestazione non trovata'; end if;
  if dispute_row.status <> 'open' then return to_jsonb(dispute_row); end if;

  update public.money_disputes
  set status = decision,
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolution_note = left(coalesce(resolution_note_value, ''), 500)
  where id = target_dispute_id
  returning * into dispute_row;

  if decision = 'rejected' and not exists (
    select 1 from public.money_disputes
    where settlement_id = dispute_row.settlement_id and status = 'open'
  ) then
    update public.event_money_settlements
    set status = 'pending'
    where id = dispute_row.settlement_id and status = 'disputed';
  end if;

  return to_jsonb(dispute_row);
end;
$$;

-- Called only by a service-role Stripe webhook. provider_event_id makes webhook
-- retries safe; live events are refused while the system is in test mode.
create or replace function public.apply_stripe_test_deposit(
  target_user_id uuid,
  amount_cents integer,
  provider_event_id text,
  provider_payment_intent text,
  provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings public.money_system_settings%rowtype;
  account public.money_accounts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role richiesta' using errcode = '42501'; end if;
  select * into settings from public.money_system_settings where singleton;
  if settings.provider_mode <> 'stripe_test' then raise exception 'Stripe Test Mode non attivo'; end if;
  if not settings.deposits_enabled then raise exception 'Depositi disabilitati'; end if;
  if amount_cents <> 1000 then raise exception 'Il deposito Motrice deve essere di 10 €'; end if;

  insert into public.money_provider_events (provider_event_id, provider_mode, event_type, payload)
  values (provider_event_id, 'stripe_test', 'payment_intent.succeeded', coalesce(provider_payload, '{}'::jsonb))
  on conflict (provider_event_id) do nothing;
  if not found then return public.money_can_fund_event(target_user_id); end if;

  account := public.ensure_money_account(target_user_id);
  update public.money_accounts
  set available_cents = available_cents + amount_cents,
      stripe_customer_id = coalesce(stripe_customer_id, provider_payload ->> 'customer'),
      version = version + 1
  where user_id = target_user_id;
  if not found then
    raise exception 'Account contabile non trovato durante il deposito';
  end if;
  insert into public.money_ledger (
    user_id, entry_type, available_delta, idempotency_key,
    provider_reference, metadata
  ) values (
    target_user_id, 'stripe_deposit_succeeded', amount_cents,
    'stripe:' || provider_event_id, provider_payment_intent,
    jsonb_build_object('mode', 'test')
  ) on conflict (idempotency_key) do nothing;
  return public.money_can_fund_event(target_user_id);
end;
$$;

-- A participant cancellation made at least 30 minutes before the start restores
-- the original bucket or trial. Later cancellations stay locked and are settled
-- with the existing no-show policy when the event closes.
create or replace function public.on_money_participant_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_start timestamptz;
  hold public.event_money_holds%rowtype;
begin
  if new.status <> 'cancelled' or old.status is not distinct from new.status then return new; end if;
  select starts_at into event_start from public.events where id = new.event_id;
  if event_start <= now() + interval '30 minutes' then return new; end if;
  select * into hold from public.event_money_holds
  where event_id = new.event_id and user_id = new.user_id and status in ('trial', 'locked')
  for update;
  if not found then return new; end if;

  if hold.funding_source = 'trial' then
    update public.money_accounts
    set trial_events_remaining = least(2, trial_events_remaining + 1),
        trial_events_used = greatest(0, trial_events_used - 1), version = version + 1
    where user_id = new.user_id;
    insert into public.money_ledger (
      user_id, event_id, entry_type, idempotency_key, metadata
    ) values (
      new.user_id, new.event_id, 'trial_event_restored',
      'participant-trial-restored:' || hold.id::text,
      jsonb_build_object('reason', 'cancelled_before_cutoff')
    ) on conflict (idempotency_key) do nothing;
  else
    update public.money_accounts
    set available_cents = available_cents + hold.amount_cents,
        locked_cents = locked_cents - hold.amount_cents, version = version + 1
    where user_id = new.user_id and locked_cents >= hold.amount_cents;
    if not found then
      raise exception 'Invariante contabile violato nella cancellazione anticipata';
    end if;
    insert into public.money_ledger (
      user_id, event_id, entry_type, available_delta, locked_delta,
      idempotency_key, metadata
    ) values (
      new.user_id, new.event_id, 'event_cancelled_before_start',
      hold.amount_cents, -hold.amount_cents,
      'cancel:' || hold.id::text,
      jsonb_build_object('restored_to', 'available')
    ) on conflict (idempotency_key) do nothing;
  end if;
  update public.event_money_holds set status = 'cancelled' where id = hold.id;
  return new;
end;
$$;

drop trigger if exists event_participants_money_cancelled on public.event_participants;
create trigger event_participants_money_cancelled
after update of status on public.event_participants
for each row execute function public.on_money_participant_cancelled();

create or replace function public.on_money_event_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hold public.event_money_holds%rowtype;
begin
  if new.status <> 'cancelled' or old.status is not distinct from new.status then return new; end if;
  for hold in select * from public.event_money_holds
    where event_id = new.id and status in ('trial', 'locked') for update
  loop
    if hold.funding_source = 'trial' then
      update public.money_accounts
      set trial_events_remaining = least(2, trial_events_remaining + 1),
          trial_events_used = greatest(0, trial_events_used - 1), version = version + 1
      where user_id = hold.user_id;
      insert into public.money_ledger (
        user_id, event_id, entry_type, idempotency_key, metadata
      ) values (
        hold.user_id, new.id, 'trial_event_restored',
        'event-trial-restored:' || hold.id::text,
        jsonb_build_object('reason', 'event_cancelled_by_organizer')
      ) on conflict (idempotency_key) do nothing;
    else
      update public.money_accounts
      set available_cents = available_cents + hold.amount_cents,
          locked_cents = locked_cents - hold.amount_cents, version = version + 1
      where user_id = hold.user_id and locked_cents >= hold.amount_cents;
      if not found then
        raise exception 'Invariante contabile violato nella cancellazione evento';
      end if;
      insert into public.money_ledger (
        user_id, event_id, entry_type, available_delta, locked_delta,
        idempotency_key, metadata
      ) values (
        hold.user_id, new.id, 'organizer_event_cancelled',
        hold.amount_cents, -hold.amount_cents,
        'event-cancel:' || hold.id::text,
        jsonb_build_object('reason', 'event_cancelled_by_organizer')
      ) on conflict (idempotency_key) do nothing;
    end if;
    update public.event_money_holds set status = 'cancelled' where id = hold.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists events_money_cancelled on public.events;
create trigger events_money_cancelled
after update of status on public.events
for each row execute function public.on_money_event_cancelled();

alter table public.money_system_settings enable row level security;
alter table public.money_accounts enable row level security;
alter table public.money_ledger enable row level security;
alter table public.event_money_holds enable row level security;
alter table public.event_money_settlements enable row level security;
alter table public.event_money_allocations enable row level security;
alter table public.money_withdrawal_requests enable row level security;
alter table public.money_disputes enable row level security;
alter table public.money_provider_events enable row level security;
alter table public.platform_money_ledger enable row level security;

drop policy if exists money_accounts_read_own on public.money_accounts;
create policy money_accounts_read_own on public.money_accounts for select to authenticated
using (user_id = auth.uid());
drop policy if exists money_ledger_read_own on public.money_ledger;
create policy money_ledger_read_own on public.money_ledger for select to authenticated
using (user_id = auth.uid());
drop policy if exists event_money_holds_read_relevant on public.event_money_holds;
create policy event_money_holds_read_relevant on public.event_money_holds for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.events where id = event_id and creator_id = auth.uid())
);
drop policy if exists event_money_settlements_read_relevant on public.event_money_settlements;
create policy event_money_settlements_read_relevant on public.event_money_settlements for select to authenticated
using (exists (select 1 from public.event_participants where event_id = event_money_settlements.event_id and user_id = auth.uid()));
drop policy if exists event_money_allocations_read_own on public.event_money_allocations;
create policy event_money_allocations_read_own on public.event_money_allocations for select to authenticated
using (beneficiary_user_id = auth.uid());
drop policy if exists money_withdrawals_read_own on public.money_withdrawal_requests;
create policy money_withdrawals_read_own on public.money_withdrawal_requests for select to authenticated
using (user_id = auth.uid());
drop policy if exists money_disputes_read_own on public.money_disputes;
create policy money_disputes_read_own on public.money_disputes for select to authenticated
using (opened_by = auth.uid());

grant select on public.money_accounts, public.money_ledger, public.event_money_holds,
  public.event_money_settlements, public.event_money_allocations,
  public.money_withdrawal_requests, public.money_disputes to authenticated;
revoke insert, update, delete on public.money_accounts, public.money_ledger,
  public.event_money_holds, public.event_money_settlements,
  public.event_money_allocations, public.money_withdrawal_requests,
  public.money_disputes from anon, authenticated;
revoke all on public.money_system_settings, public.money_provider_events,
  public.platform_money_ledger from anon, authenticated;

revoke all on function public.ensure_money_account(uuid) from public, anon, authenticated;
revoke all on function public.money_can_fund_event(uuid) from public, anon, authenticated;
revoke all on function public.reserve_event_money(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.money_event_user_is_present(uuid, uuid) from public, anon, authenticated;
revoke all on function public.prepare_event_money_settlement(uuid) from public, anon, authenticated;
revoke all on function public.release_due_money_settlements() from public, anon, authenticated;
revoke all on function public.apply_stripe_test_deposit(uuid, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_money_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_money_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_event_money_dispute(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_my_money_wallet() from public, anon;
revoke all on function public.open_event_money_dispute(uuid, text) from public, anon;
revoke all on function public.request_money_withdrawal(integer, boolean) from public, anon;
grant execute on function public.get_my_money_wallet() to authenticated;
grant execute on function public.open_event_money_dispute(uuid, text) to authenticated;
grant execute on function public.request_money_withdrawal(integer, boolean) to authenticated;
grant execute on function public.ensure_money_account(uuid) to service_role;
grant execute on function public.money_can_fund_event(uuid) to service_role;
grant execute on function public.apply_stripe_test_deposit(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.complete_money_withdrawal(uuid, text) to service_role;
grant execute on function public.fail_money_withdrawal(uuid, text) to service_role;
grant execute on function public.resolve_event_money_dispute(uuid, text, text) to service_role;

-- Re-apply grants for functions replaced by this migration.
revoke all on function public.join_event(uuid, text, text) from public, anon;
revoke all on function public.request_event_join(uuid, text, text) from public, anon;
revoke all on function public.approve_event_join_request(uuid, uuid) from public, anon;
revoke all on function public.decline_event_join_request(uuid, uuid) from public, anon;
grant execute on function public.join_event(uuid, text, text) to authenticated;
grant execute on function public.request_event_join(uuid, text, text) to authenticated;
grant execute on function public.approve_event_join_request(uuid, uuid) to authenticated;
grant execute on function public.decline_event_join_request(uuid, uuid) to authenticated;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'motrice-release-money-settlements';
exception when undefined_table then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'motrice-release-money-settlements',
    '*/5 * * * *',
    'select public.release_due_money_settlements();'
  );
exception when undefined_table or undefined_function or insufficient_privilege then
  raise notice 'pg_cron non disponibile: configurare release_due_money_settlements ogni 5 minuti';
end;
$$;

comment on table public.money_accounts is
  'Fonte autorevole del credito reale Motrice. I quattro bucket sono disgiunti.';
comment on table public.money_ledger is
  'Ledger immutabile e idempotente; nessun saldo viene calcolato dal client.';
comment on table public.event_money_settlements is
  'Regolamento evento con finestra di contestazione di 48 ore.';

commit;
