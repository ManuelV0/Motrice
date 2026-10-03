begin;

-- Event rules are decided once by the organizer and enforced server-side.
alter table public.events
  add column if not exists deposit_cents integer not null default 500,
  add column if not exists minimum_presence_minutes smallint not null default 45,
  add column if not exists verification_mode text not null default 'both',
  add column if not exists geofence_radius_m integer not null default 250,
  add column if not exists completion_xp integer not null default 50,
  add column if not exists review_bonus_xp integer not null default 25;

-- Existing beta events may be shorter than the new 45 minute default.
update public.events
set minimum_presence_minutes = least(minimum_presence_minutes, duration_minutes);

do $$
begin
  alter table public.events
    add constraint events_deposit_cents_check
    check (deposit_cents between 0 and 5000 and mod(deposit_cents, 100) = 0);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_minimum_presence_check
    check (minimum_presence_minutes between 15 and duration_minutes);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_verification_mode_check
    check (verification_mode in ('qr', 'geo', 'both'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_geofence_radius_check
    check (geofence_radius_m between 50 and 1000);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.events
    add constraint events_completion_xp_check
    check (completion_xp between 0 and 200 and review_bonus_xp between 0 and 100);
exception when duplicate_object then null;
end;
$$;

alter table public.event_participants
  add column if not exists stake_cents integer not null default 0,
  add column if not exists stake_status text not null default 'waived',
  add column if not exists cashback_percent smallint not null default 0,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id) on delete set null,
  add column if not exists checkin_lat double precision,
  add column if not exists checkin_lng double precision,
  add column if not exists minimum_reached_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists review_bonus_awarded boolean not null default false;

do $$
begin
  alter table public.event_participants
    add constraint event_participants_stake_cents_check
    check (stake_cents between 0 and 5000);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.event_participants
    add constraint event_participants_stake_status_check
    check (stake_status in ('waived', 'locked', 'verified', 'released', 'forfeited'));
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.event_participants
    add constraint event_participants_cashback_check
    check (cashback_percent in (0, 60, 100));
exception when duplicate_object then null;
end;
$$;

create table if not exists public.wallet_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_cents integer not null default 2000 check (available_cents >= 0),
  locked_cents integer not null default 0 check (locked_cents >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  entry_type text not null check (entry_type in ('beta_credit', 'stake_lock', 'stake_release', 'stake_forfeit')),
  amount_cents integer not null check (amount_cents >= 0),
  ref_key text not null check (char_length(ref_key) between 3 and 180),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger(user_id, created_at desc);

drop trigger if exists wallet_accounts_set_updated_at on public.wallet_accounts;
create trigger wallet_accounts_set_updated_at
before update on public.wallet_accounts
for each row execute function public.set_updated_at();

create table if not exists public.event_participant_qr_tokens (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 32 and 160),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (event_id, user_id),
  constraint event_participant_qr_membership_fkey
    foreign key (event_id, user_id)
    references public.event_participants(event_id, user_id)
    on delete cascade
);

create table if not exists public.event_presence_samples (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sample_role text not null check (sample_role in ('participant', 'organizer')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m numeric(8,2),
  speed_mps numeric(8,2),
  distance_m numeric(10,2) not null,
  is_in_radius boolean not null,
  recorded_at timestamptz not null default now()
);

create index if not exists event_presence_event_user_created_idx
  on public.event_presence_samples(event_id, user_id, recorded_at desc);
create index if not exists event_presence_event_role_created_idx
  on public.event_presence_samples(event_id, sample_role, recorded_at desc);

create table if not exists public.event_reviews (
  event_id uuid not null references public.events(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  partner_rating smallint not null check (partner_rating between 1 and 5),
  organizer_punctuality smallint not null check (organizer_punctuality between 1 and 5),
  description_accuracy smallint not null check (description_accuracy between 1 and 5),
  would_join_again boolean not null,
  note text not null default '' check (char_length(note) <= 500),
  bonus_xp integer not null default 0 check (bonus_xp between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (event_id, reviewer_id),
  constraint event_reviews_participant_fkey
    foreign key (event_id, reviewer_id)
    references public.event_participants(event_id, user_id)
    on delete cascade
);

create or replace function public.event_distance_m(
  lat_a double precision,
  lng_a double precision,
  lat_b double precision,
  lng_b double precision
)
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lat_a is null or lng_a is null or lat_b is null or lng_b is null then null
    else 2 * 6371000 * asin(
      least(
        1,
        sqrt(
          power(sin(radians(lat_b - lat_a) / 2), 2)
          + cos(radians(lat_a)) * cos(radians(lat_b))
          * power(sin(radians(lng_b - lng_a) / 2), 2)
        )
      )
    )
  end;
$$;

create or replace function public.ensure_wallet_account(target_user_id uuid)
returns public.wallet_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.wallet_accounts%rowtype;
begin
  insert into public.wallet_accounts (user_id, available_cents, locked_cents)
  values (target_user_id, 2000, 0)
  on conflict (user_id) do nothing;

  insert into public.wallet_ledger (user_id, entry_type, amount_cents, ref_key, metadata)
  values (
    target_user_id,
    'beta_credit',
    2000,
    'beta_credit:welcome',
    jsonb_build_object('label', 'Saldo beta iniziale')
  )
  on conflict (user_id, ref_key) do nothing;

  select * into account
  from public.wallet_accounts
  where user_id = target_user_id
  for update;

  return account;
end;
$$;

create or replace function public.issue_event_participant_qr(
  target_event_id uuid,
  target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_row public.events%rowtype;
  token_row public.event_participant_qr_tokens%rowtype;
  fresh_token text;
  token_expiry timestamptz;
begin
  select * into event_row
  from public.events
  where id = target_event_id;

  if not found then
    raise exception 'Evento non trovato';
  end if;

  if not exists (
    select 1
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = target_user_id
      and participant.status in ('going', 'completed')
  ) then
    raise exception 'Partecipante non valido';
  end if;

  token_expiry := event_row.starts_at
    + make_interval(mins => event_row.duration_minutes::integer)
    + interval '2 hours';

  select * into token_row
  from public.event_participant_qr_tokens qr
  where qr.event_id = target_event_id
    and qr.user_id = target_user_id
    and qr.expires_at > now();

  if found then
    return token_row.token;
  end if;

  fresh_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.event_participant_qr_tokens (
    event_id,
    user_id,
    token,
    issued_at,
    expires_at
  )
  values (
    target_event_id,
    target_user_id,
    fresh_token,
    now(),
    token_expiry
  )
  on conflict (event_id, user_id) do update
  set
    token = excluded.token,
    issued_at = excluded.issued_at,
    expires_at = excluded.expires_at;

  return fresh_token;
end;
$$;

-- Existing beta participants keep their historical membership and receive a
-- coherent simulated stake. Organizers never need to lock their own stake.
update public.event_participants participant
set
  stake_cents = case when participant.user_id = event.creator_id then 0 else event.deposit_cents end,
  stake_status = case when participant.user_id = event.creator_id then 'waived' else 'locked' end
from public.events event
where event.id = participant.event_id
  and participant.status = 'going'
  and participant.stake_cents = 0;

insert into public.wallet_accounts (user_id, available_cents, locked_cents)
select
  profile.id,
  greatest(0, 2000 - coalesce(stakes.total, 0))::integer,
  coalesce(stakes.total, 0)::integer
from public.profiles profile
left join lateral (
  select sum(participant.stake_cents)::integer as total
  from public.event_participants participant
  where participant.user_id = profile.id
    and participant.status = 'going'
    and participant.stake_status in ('locked', 'verified')
) stakes on true
on conflict (user_id) do nothing;

insert into public.wallet_ledger (user_id, entry_type, amount_cents, ref_key, metadata)
select
  profile.id,
  'beta_credit',
  2000,
  'beta_credit:welcome',
  jsonb_build_object('label', 'Saldo beta iniziale')
from public.profiles profile
on conflict (user_id, ref_key) do nothing;

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
  account public.wallet_accounts%rowtype;
  effective_stake integer := 0;
  personal_token text;
  joined_at_value timestamptz := clock_timestamp();
  ledger_cycle text;
begin
  if actor_id is null then
    raise exception 'Devi accedere per partecipare';
  end if;
  if participant_skill_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'Livello non valido';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;
  if target_event.starts_at <= now() then raise exception 'Evento gia iniziato'; end if;

  select * into existing_participant
  from public.event_participants participant
  where participant.event_id = target_event_id
    and participant.user_id = actor_id
  for update;

  if found and existing_participant.status = 'going' then
    personal_token := public.issue_event_participant_qr(target_event_id, actor_id);
    return jsonb_build_object(
      'success', true,
      'already_joined', true,
      'deposit_cents', existing_participant.stake_cents,
      'stake_status', existing_participant.stake_status,
      'cashback_percent', existing_participant.cashback_percent,
      'qr_token', personal_token
    );
  end if;

  select count(*) into occupied
  from public.event_participants participant
  where participant.event_id = target_event_id
    and participant.status in ('going', 'completed');

  if occupied >= target_event.max_participants then
    raise exception 'Evento completo: posti disponibili terminati';
  end if;

  effective_stake := case
    when target_event.creator_id = actor_id then 0
    else target_event.deposit_cents
  end;
  ledger_cycle := floor(extract(epoch from joined_at_value) * 1000)::bigint::text;

  if effective_stake > 0 then
    account := public.ensure_wallet_account(actor_id);
    if account.available_cents < effective_stake then
      raise exception 'Saldo beta insufficiente per bloccare il deposito';
    end if;

    update public.wallet_accounts
    set
      available_cents = available_cents - effective_stake,
      locked_cents = locked_cents + effective_stake
    where user_id = actor_id;

    insert into public.wallet_ledger (
      user_id,
      event_id,
      entry_type,
      amount_cents,
      ref_key,
      metadata
    )
    values (
      actor_id,
      target_event_id,
      'stake_lock',
      effective_stake,
      'stake_lock:' || target_event_id::text || ':' || ledger_cycle,
      jsonb_build_object('eventTitle', target_event.title, 'cycle', ledger_cycle)
    )
    on conflict (user_id, ref_key) do nothing;
  end if;

  insert into public.event_participants (
    event_id,
    user_id,
    status,
    skill_level,
    note,
    stake_cents,
    stake_status,
    cashback_percent,
    joined_at,
    updated_at
  )
  values (
    target_event_id,
    actor_id,
    'going',
    participant_skill_level,
    left(coalesce(participant_note, ''), 500),
    effective_stake,
    case when effective_stake = 0 then 'waived' else 'locked' end,
    0,
    joined_at_value,
    now()
  )
  on conflict (event_id, user_id) do update
  set
    status = 'going',
    skill_level = excluded.skill_level,
    note = excluded.note,
    stake_cents = excluded.stake_cents,
    stake_status = excluded.stake_status,
    cashback_percent = 0,
    checked_in_at = null,
    checked_in_by = null,
    checkin_lat = null,
    checkin_lng = null,
    minimum_reached_at = null,
    completed_at = null,
    review_bonus_awarded = false,
    joined_at = joined_at_value,
    updated_at = now();

  personal_token := public.issue_event_participant_qr(target_event_id, actor_id);

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    actor_id,
    actor_id,
    target_event_id,
    'rsvp_confirmed',
    'Partecipazione confermata',
    target_event.title,
    jsonb_build_object('deposit_cents', effective_stake, 'qr_generated', true)
  );

  return jsonb_build_object(
    'success', true,
    'already_joined', false,
    'participants_count', occupied + 1,
    'deposit_cents', effective_stake,
    'stake_status', case when effective_stake = 0 then 'waived' else 'locked' end,
    'cashback_percent', 0,
    'qr_token', personal_token
  );
end;
$$;

create or replace function public.leave_event(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  released boolean := false;
begin
  if actor_id is null then
    raise exception 'Devi accedere per abbandonare un evento';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id = actor_id then
    raise exception 'L organizzatore non puo abbandonare il proprio evento';
  end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id
    and user_id = actor_id
  for update;

  if not found or participant.status <> 'going' then
    raise exception 'Non risulti tra i partecipanti';
  end if;

  if target_event.starts_at > now()
    and participant.stake_status in ('locked', 'verified')
    and participant.stake_cents > 0
  then
    update public.wallet_accounts
    set
      available_cents = available_cents + participant.stake_cents,
      locked_cents = greatest(0, locked_cents - participant.stake_cents)
    where user_id = actor_id;

    insert into public.wallet_ledger (
      user_id, event_id, entry_type, amount_cents, ref_key, metadata
    )
    values (
      actor_id,
      target_event_id,
      'stake_release',
      participant.stake_cents,
      'stake_cancel_release:' || target_event_id::text || ':' ||
        floor(extract(epoch from participant.joined_at) * 1000)::bigint::text,
      jsonb_build_object('reason', 'cancelled_before_start', 'joined_at', participant.joined_at)
    )
    on conflict (user_id, ref_key) do nothing;
    released := true;
  elsif participant.stake_status in ('locked', 'verified')
    and participant.stake_cents > 0
  then
    update public.wallet_accounts
    set locked_cents = greatest(0, locked_cents - participant.stake_cents)
    where user_id = actor_id;

    insert into public.wallet_ledger (
      user_id, event_id, entry_type, amount_cents, ref_key, metadata
    )
    values (
      actor_id,
      target_event_id,
      'stake_forfeit',
      participant.stake_cents,
      'stake_cancel_forfeit:' || target_event_id::text || ':' ||
        floor(extract(epoch from participant.joined_at) * 1000)::bigint::text,
      jsonb_build_object('reason', 'cancelled_after_start', 'joined_at', participant.joined_at)
    )
    on conflict (user_id, ref_key) do nothing;
  end if;

  update public.event_participants
  set
    status = 'cancelled',
    stake_status = case when released then 'released' else 'forfeited' end,
    updated_at = now()
  where event_id = target_event_id
    and user_id = actor_id;

  return jsonb_build_object(
    'success', true,
    'stake_released', released,
    'stake_release_note', case
      when released then 'Deposito restituito: cancellazione prima dell inizio'
      else 'Deposito non rimborsabile dopo l inizio dell evento'
    end
  );
end;
$$;

create or replace function public.get_event_participation_progress(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  account public.wallet_accounts%rowtype;
  personal_token text;
  review_exists boolean := false;
  participant_sample_count integer := 0;
  organizer_recent boolean := false;
  elapsed_minutes integer := 0;
  verified_minutes integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id
    and user_id = actor_id;

  if not found then
    if target_event.creator_id <> actor_id then
      raise exception 'Partecipazione non trovata';
    end if;
  end if;

  account := public.ensure_wallet_account(actor_id);

  if participant.status in ('going', 'completed') then
    personal_token := public.issue_event_participant_qr(target_event_id, actor_id);
  end if;

  select exists (
    select 1 from public.event_reviews review
    where review.event_id = target_event_id
      and review.reviewer_id = actor_id
  ) into review_exists;

  select count(*) into participant_sample_count
  from public.event_presence_samples sample
  where sample.event_id = target_event_id
    and sample.user_id = actor_id
    and sample.sample_role = 'participant'
    and sample.is_in_radius;

  select coalesce(
    floor(extract(epoch from (max(sample.recorded_at) - min(sample.recorded_at))) / 60)::integer,
    0
  ) into verified_minutes
  from public.event_presence_samples sample
  where sample.event_id = target_event_id
    and sample.user_id = actor_id
    and sample.sample_role = 'participant'
    and sample.is_in_radius
    and sample.recorded_at >= participant.checked_in_at;

  select exists (
    select 1 from public.event_presence_samples sample
    where sample.event_id = target_event_id
      and sample.sample_role = 'organizer'
      and sample.is_in_radius
      and sample.recorded_at >= now() - interval '10 minutes'
  ) into organizer_recent;

  if participant.checked_in_at is not null then
    elapsed_minutes := greatest(
      0,
      floor(extract(epoch from (now() - participant.checked_in_at)) / 60)::integer
    );
  end if;

  return jsonb_build_object(
    'event_id', target_event.id,
    'can_manage', target_event.creator_id = actor_id,
    'is_participant', participant.user_id is not null,
    'participant_status', participant.status,
    'stake_cents', coalesce(participant.stake_cents, 0),
    'stake_status', coalesce(participant.stake_status, 'waived'),
    'cashback_percent', coalesce(participant.cashback_percent, 0),
    'checked_in_at', participant.checked_in_at,
    'minimum_reached_at', participant.minimum_reached_at,
    'completed_at', participant.completed_at,
    'minimum_presence_minutes', target_event.minimum_presence_minutes,
    'elapsed_minutes', least(elapsed_minutes, verified_minutes),
    'wall_clock_minutes', elapsed_minutes,
    'participant_sample_count', participant_sample_count,
    'organizer_present', organizer_recent,
    'verification_mode', target_event.verification_mode,
    'geofence_radius_m', target_event.geofence_radius_m,
    'completion_xp', target_event.completion_xp,
    'review_bonus_xp', target_event.review_bonus_xp,
    'review_submitted', review_exists,
    'qr_token', personal_token,
    'qr_payload', case when personal_token is null then null else jsonb_build_object(
      'version', 1,
      'eventId', target_event.id,
      'token', personal_token
    ) end,
    'wallet', jsonb_build_object(
      'available_cents', account.available_cents,
      'locked_cents', account.locked_cents
    )
  );
end;
$$;

create or replace function public.scan_event_participant_qr(
  target_event_id uuid,
  submitted_token text,
  organizer_lat double precision default null,
  organizer_lng double precision default null,
  organizer_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  qr_row public.event_participant_qr_tokens%rowtype;
  participant public.event_participants%rowtype;
  distance_from_event double precision := 0;
begin
  if actor_id is null then raise exception 'Devi accedere per scansionare'; end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo scansionare i partecipanti';
  end if;
  if now() < target_event.starts_at - interval '30 minutes'
    or now() > target_event.starts_at
      + make_interval(mins => target_event.duration_minutes::integer)
      + interval '30 minutes'
  then
    raise exception 'Scansione disponibile soltanto durante la finestra evento';
  end if;

  select * into qr_row
  from public.event_participant_qr_tokens qr
  where qr.event_id = target_event_id
    and qr.token = trim(coalesce(submitted_token, ''))
    and qr.expires_at > now();

  if not found then raise exception 'QR personale non valido o scaduto'; end if;
  if qr_row.user_id = actor_id then raise exception 'Non puoi scansionare il tuo QR'; end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id
    and user_id = qr_row.user_id
  for update;

  if not found or participant.status not in ('going', 'completed') then
    raise exception 'Partecipante non valido per questo evento';
  end if;

  if target_event.verification_mode in ('geo', 'both') then
    if organizer_lat is null or organizer_lng is null then
      raise exception 'Posizione organizzatore necessaria per la scansione';
    end if;
    if target_event.lat is null or target_event.lng is null then
      raise exception 'Coordinate evento non configurate';
    end if;

    distance_from_event := public.event_distance_m(
      organizer_lat,
      organizer_lng,
      target_event.lat,
      target_event.lng
    );
    if distance_from_event > target_event.geofence_radius_m then
      raise exception 'Sei fuori dall area dell evento';
    end if;
  end if;

  insert into public.event_checkins (event_id, user_id, checked_in_at, source)
  values (target_event_id, qr_row.user_id, now(), 'organizer')
  on conflict (event_id, user_id) do update
  set checked_in_at = excluded.checked_in_at,
      source = excluded.source;

  update public.event_participants
  set
    checked_in_at = coalesce(checked_in_at, now()),
    checked_in_by = actor_id,
    checkin_lat = organizer_lat,
    checkin_lng = organizer_lng,
    cashback_percent = greatest(cashback_percent, 60),
    stake_status = case
      when stake_status = 'locked' then 'verified'
      else stake_status
    end,
    updated_at = now()
  where event_id = target_event_id
    and user_id = qr_row.user_id;

  if organizer_lat is not null and organizer_lng is not null then
    insert into public.event_presence_samples (
      event_id,
      user_id,
      sample_role,
      lat,
      lng,
      accuracy_m,
      speed_mps,
      distance_m,
      is_in_radius
    )
    values (
      target_event_id,
      actor_id,
      'organizer',
      organizer_lat,
      organizer_lng,
      organizer_accuracy_m,
      null,
      coalesce(distance_from_event, 0),
      target_event.verification_mode = 'qr'
        or coalesce(distance_from_event, 0) <= target_event.geofence_radius_m
    );
  end if;

  insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
  values (
    qr_row.user_id,
    actor_id,
    target_event_id,
    'event_checkin_verified',
    'Presenza verificata',
    'Check-in completato: cashback al 60%.',
    jsonb_build_object('cashback_percent', 60)
  );

  return jsonb_build_object(
    'ok', true,
    'participant_id', qr_row.user_id,
    'cashback_percent', 60,
    'checked_in_at', now(),
    'distance_m', round(coalesce(distance_from_event, 0)::numeric, 1)
  );
end;
$$;

create or replace function public.record_event_presence(
  target_event_id uuid,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision default null,
  sample_speed_mps double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  role_key text;
  distance_from_event double precision;
  inside_radius boolean;
  elapsed_minutes integer := 0;
  sample_count integer := 0;
  coverage_minutes integer := 0;
  organizer_recent boolean := false;
  organizer_sample_count integer := 0;
  organizer_coverage_minutes integer := 0;
  completed_now boolean := false;
  checked_in_now boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.lat is null or target_event.lng is null then
    raise exception 'Coordinate evento non configurate';
  end if;
  if target_event.verification_mode <> 'qr'
    and (sample_lat is null or sample_lng is null)
  then
    raise exception 'Posizione non valida';
  end if;

  role_key := case when target_event.creator_id = actor_id then 'organizer' else 'participant' end;

  if role_key = 'participant' then
    select * into participant
    from public.event_participants
    where event_id = target_event_id
      and user_id = actor_id
    for update;

    if not found or participant.status not in ('going', 'completed') then
      raise exception 'Partecipazione non valida';
    end if;
    if participant.checked_in_at is null
      and target_event.verification_mode <> 'geo'
    then
      raise exception 'Completa prima il check-in QR';
    end if;
  end if;

  if target_event.verification_mode = 'qr' then
    distance_from_event := 0;
    inside_radius := true;
    sample_lat := target_event.lat;
    sample_lng := target_event.lng;
  else
    distance_from_event := public.event_distance_m(
      sample_lat,
      sample_lng,
      target_event.lat,
      target_event.lng
    );
    inside_radius := distance_from_event <= target_event.geofence_radius_m;
  end if;

  insert into public.event_presence_samples (
    event_id,
    user_id,
    sample_role,
    lat,
    lng,
    accuracy_m,
    speed_mps,
    distance_m,
    is_in_radius
  )
  values (
    target_event_id,
    actor_id,
    role_key,
    sample_lat,
    sample_lng,
    sample_accuracy_m,
    sample_speed_mps,
    distance_from_event,
    inside_radius
  );

  if role_key = 'participant' then
    if participant.checked_in_at is null then
      select exists (
        select 1
        from public.event_presence_samples sample
        where sample.event_id = target_event_id
          and sample.sample_role = 'organizer'
          and sample.is_in_radius
          and sample.recorded_at >= now() - interval '10 minutes'
      ) into organizer_recent;

      if not inside_radius then
        raise exception 'Sei fuori dall area dell evento';
      end if;
      if not organizer_recent then
        raise exception 'L organizzatore deve risultare presente';
      end if;

      update public.event_participants
      set
        checked_in_at = now(),
        checked_in_by = target_event.creator_id,
        checkin_lat = sample_lat,
        checkin_lng = sample_lng,
        cashback_percent = 60,
        stake_status = case when stake_status = 'locked' then 'verified' else stake_status end,
        updated_at = now()
      where event_id = target_event_id
        and user_id = actor_id;

      insert into public.event_checkins (event_id, user_id, checked_in_at, source)
      values (target_event_id, actor_id, now(), 'organizer')
      on conflict (event_id, user_id) do update
      set checked_in_at = excluded.checked_in_at,
          source = excluded.source;

      participant.checked_in_at := now();
      participant.cashback_percent := 60;
      participant.stake_status := case
        when participant.stake_status = 'locked' then 'verified'
        else participant.stake_status
      end;
      checked_in_now := true;

      insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
      values (
        actor_id,
        target_event.creator_id,
        target_event_id,
        'event_checkin_verified',
        'Presenza verificata',
        'Check-in GPS completato: cashback al 60%.',
        jsonb_build_object('cashback_percent', 60, 'verification_mode', 'geo')
      );
    end if;

    elapsed_minutes := greatest(
      0,
      floor(extract(epoch from (now() - participant.checked_in_at)) / 60)::integer
    );

    select
      count(*)::integer,
      coalesce(
        floor(extract(epoch from (max(sample.recorded_at) - min(sample.recorded_at))) / 60)::integer,
        0
      )
    into sample_count, coverage_minutes
    from public.event_presence_samples sample
    where sample.event_id = target_event_id
      and sample.user_id = actor_id
      and sample.sample_role = 'participant'
      and sample.is_in_radius
      and sample.recorded_at >= participant.checked_in_at;

    select exists (
      select 1
      from public.event_presence_samples sample
      where sample.event_id = target_event_id
        and sample.sample_role = 'organizer'
        and sample.is_in_radius
        and sample.recorded_at >= now() - interval '10 minutes'
    ) into organizer_recent;

    select
      count(*)::integer,
      coalesce(
        floor(extract(epoch from (max(sample.recorded_at) - min(sample.recorded_at))) / 60)::integer,
        0
      )
    into organizer_sample_count, organizer_coverage_minutes
    from public.event_presence_samples sample
    where sample.event_id = target_event_id
      and sample.user_id = target_event.creator_id
      and sample.sample_role = 'organizer'
      and sample.is_in_radius
      and sample.recorded_at >= participant.checked_in_at;

    if participant.cashback_percent < 100
      and inside_radius
      and elapsed_minutes >= target_event.minimum_presence_minutes
      and sample_count >= greatest(2, ceil(target_event.minimum_presence_minutes / 5.0)::integer)
      and coverage_minutes >= greatest(1, target_event.minimum_presence_minutes - 2)
      and organizer_recent
      and organizer_sample_count >= greatest(2, ceil(target_event.minimum_presence_minutes / 5.0)::integer)
      and organizer_coverage_minutes >= greatest(1, target_event.minimum_presence_minutes - 2)
    then
      update public.event_participants
      set
        status = 'completed',
        cashback_percent = 100,
        stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
        minimum_reached_at = coalesce(minimum_reached_at, now()),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where event_id = target_event_id
        and user_id = actor_id;

      if participant.stake_cents > 0
        and participant.stake_status in ('locked', 'verified')
      then
        update public.wallet_accounts
        set
          available_cents = available_cents + participant.stake_cents,
          locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = actor_id;

        insert into public.wallet_ledger (
          user_id, event_id, entry_type, amount_cents, ref_key, metadata
        )
        values (
          actor_id,
          target_event_id,
          'stake_release',
          participant.stake_cents,
          'stake_complete_release:' || target_event_id::text || ':' ||
            floor(extract(epoch from participant.joined_at) * 1000)::bigint::text,
          jsonb_build_object('cashback_percent', 100, 'joined_at', participant.joined_at)
        )
        on conflict (user_id, ref_key) do nothing;
      end if;

      insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
      values (
        actor_id,
        target_event.creator_id,
        target_event_id,
        'event_participation_completed',
        'Partecipazione completata',
        'Cashback al 100% e PX accreditati.',
        jsonb_build_object('cashback_percent', 100, 'completion_xp', target_event.completion_xp)
      );
      completed_now := true;
    end if;
  else
    organizer_recent := inside_radius;
  end if;

  return jsonb_build_object(
    'ok', true,
    'role', role_key,
    'inside_radius', inside_radius,
    'distance_m', round(distance_from_event::numeric, 1),
    'elapsed_minutes', elapsed_minutes,
    'minimum_presence_minutes', target_event.minimum_presence_minutes,
    'sample_count', sample_count,
    'coverage_minutes', coverage_minutes,
    'organizer_sample_count', organizer_sample_count,
    'organizer_coverage_minutes', organizer_coverage_minutes,
    'organizer_present', organizer_recent,
    'checked_in_now', checked_in_now,
    'completed_now', completed_now,
    'cashback_percent', case
      when completed_now then 100
      else coalesce(participant.cashback_percent, 0)
    end
  );
end;
$$;

create or replace function public.list_event_validation_status(target_event_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  participant_status text,
  stake_cents integer,
  stake_status text,
  cashback_percent smallint,
  checked_in_at timestamptz,
  completed_at timestamptz,
  reviewed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if not exists (
    select 1 from public.events event
    where event.id = target_event_id
      and (
        event.creator_id = actor_id
        or exists (
          select 1 from public.event_participants member
          where member.event_id = target_event_id
            and member.user_id = actor_id
            and member.status in ('going', 'completed')
        )
      )
  ) then
    raise exception 'Elenco non disponibile';
  end if;

  return query
  select
    participant.user_id,
    profile.display_name,
    coalesce(profile.avatar_url, ''),
    participant.status,
    participant.stake_cents,
    participant.stake_status,
    participant.cashback_percent,
    participant.checked_in_at,
    participant.completed_at,
    exists (
      select 1 from public.event_reviews review
      where review.event_id = participant.event_id
        and review.reviewer_id = participant.user_id
    )
  from public.event_participants participant
  join public.profiles profile on profile.id = participant.user_id
  where participant.event_id = target_event_id
  order by
    participant.checked_in_at desc nulls last,
    participant.joined_at asc;
end;
$$;

create or replace function public.submit_event_review(
  target_event_id uuid,
  partner_stars smallint,
  organizer_stars smallint,
  description_stars smallint,
  join_again boolean,
  review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  xp_result jsonb := '{}'::jsonb;
  inserted_review boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if partner_stars not between 1 and 5
    or organizer_stars not between 1 and 5
    or description_stars not between 1 and 5
  then
    raise exception 'Valutazione non valida';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id
    and user_id = actor_id
  for update;

  if not found
    or participant.status <> 'completed'
    or participant.cashback_percent <> 100
  then
    raise exception 'Completa la partecipazione prima di valutare';
  end if;

  insert into public.event_reviews (
    event_id,
    reviewer_id,
    partner_rating,
    organizer_punctuality,
    description_accuracy,
    would_join_again,
    note,
    bonus_xp
  )
  values (
    target_event_id,
    actor_id,
    partner_stars,
    organizer_stars,
    description_stars,
    join_again,
    left(coalesce(review_note, ''), 500),
    target_event.review_bonus_xp
  )
  on conflict (event_id, reviewer_id) do nothing;

  inserted_review := found;

  if inserted_review then
    xp_result := public.apply_xp_reward(
      actor_id,
      'event_review_completed',
      target_event.review_bonus_xp,
      0,
      target_event.sport_id::text,
      'event_review:' || target_event_id::text || ':' || actor_id::text,
      jsonb_build_object('eventId', target_event_id, 'source', 'review')
    );

    update public.event_participants
    set review_bonus_awarded = true, updated_at = now()
    where event_id = target_event_id
      and user_id = actor_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'already_submitted', not inserted_review,
    'bonus_xp', coalesce((xp_result ->> 'points')::integer, 0)
  );
end;
$$;

create or replace function public.finalize_event_outcomes(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  validated_count integer := 0;
  no_show_count integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id
  for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo chiudere l evento';
  end if;
  if now() < target_event.starts_at
    + make_interval(mins => target_event.duration_minutes::integer)
  then
    raise exception 'L evento non e ancora terminato';
  end if;

  for participant in
    select * from public.event_participants
    where event_id = target_event_id
    for update
  loop
    if participant.user_id = target_event.creator_id then
      continue;
    end if;

    if participant.status = 'completed' and participant.cashback_percent = 100 then
      validated_count := validated_count + 1;
    elsif participant.status = 'going' then
      update public.event_participants
      set
        status = 'no_show',
        stake_status = case when stake_cents > 0 then 'forfeited' else 'waived' end,
        updated_at = now()
      where event_id = target_event_id
        and user_id = participant.user_id;

      if participant.stake_cents > 0
        and participant.stake_status in ('locked', 'verified')
      then
        update public.wallet_accounts
        set locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = participant.user_id;

        insert into public.wallet_ledger (
          user_id, event_id, entry_type, amount_cents, ref_key, metadata
        )
        values (
          participant.user_id,
          target_event_id,
          'stake_forfeit',
          participant.stake_cents,
          'stake_forfeit:' || target_event_id::text || ':' ||
            floor(extract(epoch from participant.joined_at) * 1000)::bigint::text,
          jsonb_build_object('reason', 'minimum_presence_not_reached', 'joined_at', participant.joined_at)
        )
        on conflict (user_id, ref_key) do nothing;
      end if;
      no_show_count := no_show_count + 1;
    end if;
  end loop;

  update public.events
  set status = 'completed', updated_at = now()
  where id = target_event_id;

  return jsonb_build_object(
    'success', true,
    'validated_count', validated_count,
    'no_show_count', no_show_count,
    'event_status', 'completed'
  );
end;
$$;

-- Completion rewards now use the value chosen by the organizer.
create or replace function public.reward_participation_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_row public.events%rowtype;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  select * into event_row
  from public.events
  where id = new.event_id;

  if new.status = 'completed' and old.status = 'going' then
    perform public.apply_xp_reward(
      new.user_id,
      'attendance_confirmed',
      event_row.completion_xp,
      greatest(0, floor(event_row.completion_xp / 2.0)::integer),
      event_row.sport_id::text,
      'attendance_confirmed:' || new.event_id::text || ':' || new.user_id::text,
      jsonb_build_object(
        'eventId', new.event_id,
        'attendance', 'attended',
        'cashback_percent', new.cashback_percent,
        'source', 'presence_flow'
      )
    );
  elsif new.status = 'no_show' and old.status = 'going' then
    perform public.apply_xp_reward(
      new.user_id,
      'attendance_no_show',
      -50,
      -30,
      event_row.sport_id::text,
      'attendance_no_show:' || new.event_id::text || ':' || new.user_id::text,
      jsonb_build_object('eventId', new.event_id, 'attendance', 'no_show', 'source', 'server')
    );
  elsif new.status = 'cancelled'
    and old.status = 'going'
    and event_row.starts_at > now()
    and event_row.starts_at <= now() + interval '30 minutes'
  then
    perform public.apply_xp_reward(
      new.user_id,
      'cancel_late',
      -20,
      -10,
      event_row.sport_id::text,
      'cancel_late:' || new.event_id::text || ':' || new.user_id::text,
      jsonb_build_object('eventId', new.event_id, 'attendance', 'cancelled_late', 'source', 'server')
    );
  end if;

  perform public.refresh_profile_reliability(new.user_id);
  return new;
end;
$$;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.event_participant_qr_tokens enable row level security;
alter table public.event_presence_samples enable row level security;
alter table public.event_reviews enable row level security;

drop policy if exists "wallet_accounts_read_own" on public.wallet_accounts;
create policy "wallet_accounts_read_own"
on public.wallet_accounts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "wallet_ledger_read_own" on public.wallet_ledger;
create policy "wallet_ledger_read_own"
on public.wallet_ledger for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "event_reviews_read_relevant" on public.event_reviews;
create policy "event_reviews_read_relevant"
on public.event_reviews for select
to authenticated
using (
  reviewer_id = (select auth.uid())
  or exists (
    select 1 from public.events event
    where event.id = event_reviews.event_id
      and event.creator_id = (select auth.uid())
  )
);

grant select on public.wallet_accounts, public.wallet_ledger, public.event_reviews to authenticated;
revoke all on public.event_participant_qr_tokens, public.event_presence_samples from anon, authenticated;
revoke insert, update, delete on public.wallet_accounts, public.wallet_ledger, public.event_reviews from anon, authenticated;

revoke all on function public.ensure_wallet_account(uuid) from public, anon, authenticated;
revoke all on function public.issue_event_participant_qr(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_event_participation_progress(uuid) from public, anon;
grant execute on function public.get_event_participation_progress(uuid) to authenticated;
revoke all on function public.scan_event_participant_qr(uuid, text, double precision, double precision, double precision) from public, anon;
grant execute on function public.scan_event_participant_qr(uuid, text, double precision, double precision, double precision) to authenticated;
revoke all on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.record_event_presence(uuid, double precision, double precision, double precision, double precision) to authenticated;
revoke all on function public.list_event_validation_status(uuid) from public, anon;
grant execute on function public.list_event_validation_status(uuid) to authenticated;
revoke all on function public.submit_event_review(uuid, smallint, smallint, smallint, boolean, text) from public, anon;
grant execute on function public.submit_event_review(uuid, smallint, smallint, smallint, boolean, text) to authenticated;
revoke all on function public.finalize_event_outcomes(uuid) from public, anon;
grant execute on function public.finalize_event_outcomes(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.event_presence_samples;
exception when duplicate_object then null;
end;
$$;

commit;
