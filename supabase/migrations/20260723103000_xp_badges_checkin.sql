begin;

-- XP is server-owned: clients can read their progression but cannot write totals
-- or choose how many points to receive.
create table if not exists public.xp_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp_global integer not null default 0 check (xp_global >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_sport_totals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport_key text not null check (char_length(sport_key) between 1 and 80),
  xp integer not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, sport_key)
);

create table if not exists public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null check (char_length(reward_type) between 2 and 60),
  points integer not null,
  sport_key text not null check (char_length(sport_key) between 1 and 80),
  points_sport integer not null default 0,
  ref_key text not null check (char_length(ref_key) between 3 and 180),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists xp_ledger_user_created_idx
  on public.xp_ledger(user_id, created_at desc);
create index if not exists xp_ledger_user_day_idx
  on public.xp_ledger(user_id, created_at);

drop trigger if exists xp_accounts_set_updated_at on public.xp_accounts;
create trigger xp_accounts_set_updated_at
before update on public.xp_accounts
for each row execute function public.set_updated_at();

drop trigger if exists xp_sport_totals_set_updated_at on public.xp_sport_totals;
create trigger xp_sport_totals_set_updated_at
before update on public.xp_sport_totals
for each row execute function public.set_updated_at();

create or replace function public.xp_badge_key(total_xp integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when greatest(coalesce(total_xp, 0), 0) >= 1000 then 'diamante'
    when greatest(coalesce(total_xp, 0), 0) >= 500 then 'oro'
    when greatest(coalesce(total_xp, 0), 0) >= 250 then 'argento'
    when greatest(coalesce(total_xp, 0), 0) >= 100 then 'bronzo'
    else 'rame'
  end;
$$;

create or replace function public.xp_badge_label(total_xp integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case public.xp_badge_key(total_xp)
    when 'diamante' then 'Diamante'
    when 'oro' then 'Oro'
    when 'argento' then 'Argento'
    when 'bronzo' then 'Bronzo'
    else 'Rame'
  end;
$$;

create or replace function public.apply_xp_reward(
  target_user_id uuid,
  reward_type text,
  requested_global integer,
  requested_sport integer,
  reward_sport_key text,
  reward_ref_key text,
  reward_metadata jsonb default '{}'::jsonb,
  reward_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_sport text := left(lower(coalesce(nullif(trim(reward_sport_key), ''), 'generic')), 80);
  normalized_type text := left(coalesce(nullif(trim(reward_type), ''), 'xp_adjustment'), 60);
  normalized_ref text := left(coalesce(nullif(trim(reward_ref_key), ''), gen_random_uuid()::text), 180);
  effective_at timestamptz := least(coalesce(reward_created_at, now()), now());
  current_global integer := 0;
  current_sport integer := 0;
  positive_global_today integer := 0;
  positive_sport_today integer := 0;
  applied_global integer := 0;
  applied_sport integer := 0;
  next_global integer := 0;
  next_sport integer := 0;
  previous_badge text;
  next_badge text;
  ledger_id bigint;
begin
  if target_user_id is null then
    return jsonb_build_object('applied', false, 'reason', 'missing_user');
  end if;

  -- One writer per user keeps caps and aggregates consistent under concurrency.
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  if exists (
    select 1
    from public.xp_ledger ledger
    where ledger.user_id = target_user_id
      and ledger.ref_key = normalized_ref
  ) then
    return jsonb_build_object('applied', false, 'duplicate', true, 'points', 0, 'points_sport', 0);
  end if;

  insert into public.xp_accounts (user_id, xp_global)
  values (target_user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.xp_sport_totals (user_id, sport_key, xp)
  values (target_user_id, normalized_sport, 0)
  on conflict (user_id, sport_key) do nothing;

  select account.xp_global
  into current_global
  from public.xp_accounts account
  where account.user_id = target_user_id
  for update;

  select total.xp
  into current_sport
  from public.xp_sport_totals total
  where total.user_id = target_user_id
    and total.sport_key = normalized_sport
  for update;

  select
    coalesce(sum(greatest(ledger.points, 0)), 0)::integer,
    coalesce(sum(
      case
        when ledger.sport_key = normalized_sport then greatest(ledger.points_sport, 0)
        else 0
      end
    ), 0)::integer
  into positive_global_today, positive_sport_today
  from public.xp_ledger ledger
  where ledger.user_id = target_user_id
    and ledger.created_at >= date_trunc('day', effective_at)
    and ledger.created_at < date_trunc('day', effective_at) + interval '1 day';

  applied_global := case
    when coalesce(requested_global, 0) > 0
      then least(coalesce(requested_global, 0), greatest(0, 200 - positive_global_today))
    else greatest(coalesce(requested_global, 0), -current_global)
  end;

  applied_sport := case
    when coalesce(requested_sport, 0) > 0
      then least(coalesce(requested_sport, 0), greatest(0, 120 - positive_sport_today))
    else greatest(coalesce(requested_sport, 0), -current_sport)
  end;

  next_global := greatest(0, current_global + applied_global);
  next_sport := greatest(0, current_sport + applied_sport);
  previous_badge := public.xp_badge_key(current_global);
  next_badge := public.xp_badge_key(next_global);

  update public.xp_accounts
  set xp_global = next_global, updated_at = now()
  where user_id = target_user_id;

  update public.xp_sport_totals
  set xp = next_sport, updated_at = now()
  where user_id = target_user_id
    and sport_key = normalized_sport;

  insert into public.xp_ledger (
    user_id,
    reward_type,
    points,
    sport_key,
    points_sport,
    ref_key,
    metadata,
    created_at
  )
  values (
    target_user_id,
    normalized_type,
    applied_global,
    normalized_sport,
    applied_sport,
    normalized_ref,
    coalesce(reward_metadata, '{}'::jsonb) || jsonb_build_object(
      'points_requested_global', coalesce(requested_global, 0),
      'points_requested_sport', coalesce(requested_sport, 0),
      'daily_global_cap_hit', coalesce(requested_global, 0) > applied_global and coalesce(requested_global, 0) > 0,
      'daily_sport_cap_hit', coalesce(requested_sport, 0) > applied_sport and coalesce(requested_sport, 0) > 0
    ),
    effective_at
  )
  returning id into ledger_id;

  if previous_badge <> next_badge and next_global > current_global then
    insert into public.notifications (user_id, type, title, body, payload)
    values (
      target_user_id,
      'xp_badge_earned',
      'Nuovo badge sbloccato',
      'Hai raggiunto il badge ' || public.xp_badge_label(next_global) || '.',
      jsonb_build_object('badge', next_badge, 'xp_global', next_global)
    );
  end if;

  return jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'ledger_id', ledger_id,
    'points', applied_global,
    'points_sport', applied_sport,
    'xp_global', next_global,
    'xp_sport', next_sport,
    'badge', next_badge
  );
end;
$$;

create or replace function public.refresh_profile_reliability(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attended_count integer := 0;
  no_show_count integer := 0;
  cancelled_count integer := 0;
  total_outcomes integer := 0;
  score numeric(5,2) := 100;
begin
  select
    count(*) filter (where participant.status = 'completed')::integer,
    count(*) filter (where participant.status = 'no_show')::integer,
    count(*) filter (where participant.status = 'cancelled')::integer
  into attended_count, no_show_count, cancelled_count
  from public.event_participants participant
  where participant.user_id = target_user_id;

  total_outcomes := attended_count + no_show_count + cancelled_count;
  if total_outcomes > 0 then
    score := round(
      ((attended_count * 100.0) + (cancelled_count * 70.0)) / total_outcomes,
      2
    );
  end if;

  update public.profiles
  set reliability_score = greatest(0, least(100, score))
  where id = target_user_id;
end;
$$;

create or replace function public.reward_event_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.apply_xp_reward(
    new.creator_id,
    'event_created',
    10,
    10,
    new.sport_id::text,
    'event_created:' || new.id::text,
    jsonb_build_object('eventId', new.id, 'source', 'server'),
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists on_event_created_reward_xp on public.events;
create trigger on_event_created_reward_xp
after insert on public.events
for each row execute function public.reward_event_creation();

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

  select *
  into event_row
  from public.events
  where id = new.event_id;

  if new.status = 'completed' and old.status = 'going' then
    perform public.apply_xp_reward(
      new.user_id,
      'attendance_confirmed',
      30,
      20,
      event_row.sport_id::text,
      'attendance_confirmed:' || new.event_id::text || ':' || new.user_id::text,
      jsonb_build_object('eventId', new.event_id, 'attendance', 'attended', 'source', 'server')
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

drop trigger if exists on_participation_outcome_xp on public.event_participants;
create trigger on_participation_outcome_xp
after update of status on public.event_participants
for each row execute function public.reward_participation_outcome();

-- Shared QR check-in. The token can only be obtained by the organizer through
-- the RPC; no table writes are exposed to the browser.
create table if not exists public.event_checkin_sessions (
  event_id uuid primary key references public.events(id) on delete cascade,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  token text not null check (char_length(token) between 16 and 160),
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > valid_from)
);

create table if not exists public.event_checkins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  source text not null default 'qr' check (source in ('qr', 'organizer')),
  primary key (event_id, user_id),
  constraint event_checkins_participant_fkey
    foreign key (event_id, user_id)
    references public.event_participants(event_id, user_id)
    on delete cascade
);

create index if not exists event_checkins_user_created_idx
  on public.event_checkins(user_id, checked_in_at desc);

drop trigger if exists event_checkin_sessions_set_updated_at on public.event_checkin_sessions;
create trigger event_checkin_sessions_set_updated_at
before update on public.event_checkin_sessions
for each row execute function public.set_updated_at();

create or replace function public.start_event_checkin(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  fresh_token text := encode(extensions.gen_random_bytes(24), 'hex');
  start_window timestamptz;
  end_window timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per avviare il check-in';
  end if;

  select *
  into target_event
  from public.events
  where id = target_event_id
  for update;

  if not found then
    raise exception 'Evento non trovato';
  end if;
  if target_event.creator_id <> actor_id then
    raise exception 'Solo l organizzatore puo avviare il check-in';
  end if;
  if target_event.status <> 'scheduled' then
    raise exception 'Evento non disponibile per il check-in';
  end if;

  start_window := target_event.starts_at - interval '15 minutes';
  end_window := target_event.starts_at
    + make_interval(mins => target_event.duration_minutes::integer)
    + interval '15 minutes';

  insert into public.event_checkin_sessions (
    event_id,
    organizer_id,
    token,
    valid_from,
    expires_at
  )
  values (
    target_event.id,
    actor_id,
    fresh_token,
    start_window,
    end_window
  )
  on conflict (event_id) do update
  set
    organizer_id = excluded.organizer_id,
    token = excluded.token,
    valid_from = excluded.valid_from,
    expires_at = excluded.expires_at,
    updated_at = now();

  return jsonb_build_object(
    'event_id', target_event.id,
    'organizer_user_id', actor_id,
    'token', fresh_token,
    'issued_at', now(),
    'starts_at', start_window,
    'expires_at', end_window,
    'status', case
      when now() < start_window then 'scheduled'
      when now() <= end_window then 'active'
      else 'expired'
    end,
    'can_manage', true
  );
end;
$$;

create or replace function public.get_event_checkin_session(target_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_checkin_sessions%rowtype;
  can_manage boolean := false;
  can_view boolean := false;
begin
  if actor_id is null then
    raise exception 'Devi accedere per vedere il check-in';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id;

  if not found then
    raise exception 'Evento non trovato';
  end if;

  can_manage := target_event.creator_id = actor_id;
  can_view := can_manage or exists (
    select 1
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed')
  );

  if not can_view then
    raise exception 'Il check-in e riservato ai partecipanti';
  end if;

  select * into session_row
  from public.event_checkin_sessions session
  where session.event_id = target_event_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'event_id', session_row.event_id,
    'organizer_user_id', session_row.organizer_id,
    'token', case when can_manage then session_row.token else null end,
    'issued_at', session_row.created_at,
    'starts_at', session_row.valid_from,
    'expires_at', session_row.expires_at,
    'status', case
      when now() < session_row.valid_from then 'scheduled'
      when now() <= session_row.expires_at then 'active'
      else 'expired'
    end,
    'can_manage', can_manage
  );
end;
$$;

create or replace function public.check_in_to_event(
  target_event_id uuid,
  submitted_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_checkin_sessions%rowtype;
  participant_status text;
  participant_points integer := 0;
  organizer_result jsonb := '{}'::jsonb;
begin
  if actor_id is null then
    raise exception 'Devi accedere per fare check-in';
  end if;

  select * into target_event
  from public.events
  where id = target_event_id;

  if not found then
    raise exception 'Evento non trovato';
  end if;

  select status
  into participant_status
  from public.event_participants
  where event_id = target_event_id
    and user_id = actor_id
  for update;

  if participant_status is null or participant_status not in ('going', 'completed') then
    raise exception 'Devi essere tra i partecipanti per fare check-in';
  end if;

  select * into session_row
  from public.event_checkin_sessions session
  where session.event_id = target_event_id
  for update;

  if not found then
    raise exception 'Sessione check-in non trovata';
  end if;
  if now() < session_row.valid_from or now() > session_row.expires_at then
    raise exception 'Sessione check-in non valida o scaduta';
  end if;
  if coalesce(trim(submitted_token), '') <> session_row.token then
    raise exception 'Token check-in non valido';
  end if;

  if exists (
    select 1
    from public.event_checkins checkin
    where checkin.event_id = target_event_id
      and checkin.user_id = actor_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'alreadyChecked', true,
      'attendanceConfirmed', participant_status = 'completed',
      'xpAwarded', jsonb_build_object('participant', 0, 'organizer', 0)
    );
  end if;

  insert into public.event_checkins (event_id, user_id, source)
  values (target_event_id, actor_id, 'qr');

  if participant_status = 'going' then
    update public.event_participants
    set status = 'completed', updated_at = now()
    where event_id = target_event_id
      and user_id = actor_id;

    select coalesce(ledger.points, 0)
    into participant_points
    from public.xp_ledger ledger
    where ledger.user_id = actor_id
      and ledger.ref_key = 'attendance_confirmed:' || target_event_id::text || ':' || actor_id::text;
  end if;

  if target_event.creator_id <> actor_id then
    organizer_result := public.apply_xp_reward(
      target_event.creator_id,
      'event_checkin_organizer',
      20,
      0,
      target_event.sport_id::text,
      'event_checkin_organizer:' || target_event_id::text || ':' || actor_id::text,
      jsonb_build_object(
        'eventId', target_event_id,
        'attendeeUserId', actor_id,
        'source', 'qr'
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'alreadyChecked', false,
    'unlockedStake', true,
    'attendanceConfirmed', true,
    'xpAwarded', jsonb_build_object(
      'participant', participant_points,
      'organizer', coalesce((organizer_result ->> 'points')::integer, 0)
    ),
    'checkinRecord', jsonb_build_object('ts', now(), 'source', 'qr')
  );
end;
$$;

create or replace function public.list_event_checkin_participants(target_event_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Devi accedere per vedere i partecipanti';
  end if;

  if not exists (
    select 1
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = actor_id
      and participant.status in ('going', 'completed')
  ) then
    raise exception 'Elenco riservato ai partecipanti';
  end if;

  return query
  select
    checkin.user_id,
    profile.display_name,
    coalesce(profile.avatar_url, ''),
    checkin.checked_in_at
  from public.event_checkins checkin
  join public.profiles profile on profile.id = checkin.user_id
  where checkin.event_id = target_event_id
  order by checkin.checked_in_at desc;
end;
$$;

-- Completed participants retain access to their event chat.
create or replace function public.is_event_participant(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.event_participants
    where event_id = target_event_id
      and user_id = auth.uid()
      and status in ('going', 'completed')
  );
$$;

create or replace function public.get_event_chat_inbox()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  city text,
  location_name text,
  event_status text,
  sport_slug text,
  sport_name text,
  participants_count bigint,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  last_sender_name text,
  unread_count bigint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select auth.uid() as id
  ),
  memberships as (
    select participant.event_id, participant.joined_at
    from public.event_participants participant
    cross join actor
    where participant.user_id = actor.id
      and participant.status in ('going', 'completed')
  )
  select
    event.id as event_id,
    event.title,
    event.starts_at,
    event.city,
    event.location_name,
    event.status as event_status,
    sport.slug as sport_slug,
    sport.name as sport_name,
    coalesce(participant_totals.total, 0)::bigint as participants_count,
    latest.body as last_message,
    latest.created_at as last_message_at,
    latest.sender_id as last_sender_id,
    latest.sender_name as last_sender_name,
    coalesce(unread.total, 0)::bigint as unread_count,
    membership.joined_at
  from memberships membership
  join public.events event on event.id = membership.event_id
  join public.sports sport on sport.id = event.sport_id
  cross join actor
  left join public.event_chat_reads read_state
    on read_state.event_id = event.id
   and read_state.user_id = actor.id
  left join lateral (
    select count(*)::bigint as total
    from public.event_participants participant
    where participant.event_id = event.id
      and participant.status in ('going', 'completed')
  ) participant_totals on true
  left join lateral (
    select
      message.body,
      message.created_at,
      message.sender_id,
      profile.display_name as sender_name
    from public.event_messages message
    join public.profiles profile on profile.id = message.sender_id
    where message.event_id = event.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as total
    from public.event_messages message
    where message.event_id = event.id
      and message.sender_id <> actor.id
      and message.created_at > greatest(
        membership.joined_at,
        coalesce(read_state.last_read_at, membership.joined_at)
      )
  ) unread on true
  order by
    coalesce(latest.created_at, membership.joined_at, event.created_at) desc,
    event.starts_at asc;
$$;

create or replace function public.notify_event_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_title text;
  sender_name text;
begin
  select title into event_title from public.events where id = new.event_id;
  select display_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, actor_id, event_id, type, title, body)
  select
    participant.user_id,
    new.sender_id,
    new.event_id,
    'event_group_message',
    coalesce(event_title, 'Chat evento'),
    coalesce(sender_name, 'Partecipante') || ': ' || left(new.body, 180)
  from public.event_participants participant
  where participant.event_id = new.event_id
    and participant.status in ('going', 'completed')
    and participant.user_id <> new.sender_id;

  return new;
end;
$$;

create or replace function public.get_my_xp_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  total_xp integer := 0;
  badge_key text;
  badge_label text;
  current_threshold integer := 0;
  next_threshold integer;
  progress_percent integer := 0;
  sport_totals jsonb := '{}'::jsonb;
  history_rows jsonb := '[]'::jsonb;
  attended_count integer := 0;
  no_show_count integer := 0;
  cancelled_count integer := 0;
  reliability numeric(5,2) := 100;
  last_updated timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per vedere XP e badge';
  end if;

  select coalesce(account.xp_global, 0), account.updated_at
  into total_xp, last_updated
  from public.xp_accounts account
  where account.user_id = actor_id;

  total_xp := coalesce(total_xp, 0);
  badge_key := public.xp_badge_key(total_xp);
  badge_label := public.xp_badge_label(total_xp);

  current_threshold := case badge_key
    when 'diamante' then 1000
    when 'oro' then 500
    when 'argento' then 250
    when 'bronzo' then 100
    else 0
  end;
  next_threshold := case badge_key
    when 'oro' then 1000
    when 'argento' then 500
    when 'bronzo' then 250
    when 'rame' then 100
    else null
  end;

  progress_percent := case
    when next_threshold is null then 100
    else least(
      100,
      greatest(
        0,
        round(
          ((total_xp - current_threshold)::numeric / greatest(1, next_threshold - current_threshold)) * 100
        )::integer
      )
    )
  end;

  select coalesce(jsonb_object_agg(total.sport_key, total.xp), '{}'::jsonb)
  into sport_totals
  from public.xp_sport_totals total
  where total.user_id = actor_id
    and total.xp > 0;

  select coalesce(jsonb_agg(item order by item.created_at desc), '[]'::jsonb)
  into history_rows
  from (
    select
      ledger.id::text as id,
      ledger.reward_type as type,
      ledger.points,
      ledger.sport_key as "sportId",
      ledger.ref_key as "refId",
      ledger.created_at as ts,
      ledger.metadata || jsonb_build_object('points_sport', ledger.points_sport) as meta,
      ledger.created_at
    from public.xp_ledger ledger
    where ledger.user_id = actor_id
    order by ledger.created_at desc
    limit 100
  ) item;

  select
    count(*) filter (where participant.status = 'completed')::integer,
    count(*) filter (where participant.status = 'no_show')::integer,
    count(*) filter (where participant.status = 'cancelled')::integer
  into attended_count, no_show_count, cancelled_count
  from public.event_participants participant
  where participant.user_id = actor_id;

  select coalesce(profile.reliability_score, 100)
  into reliability
  from public.profiles profile
  where profile.id = actor_id;

  return jsonb_build_object(
    'source', 'supabase',
    'user_id', actor_id,
    'xp_global', total_xp,
    'xp_by_sport', sport_totals,
    'xp_history', history_rows,
    'badge', jsonb_build_object(
      'key', badge_key,
      'label', badge_label,
      'min', current_threshold,
      'max', case when next_threshold is null then null else next_threshold - 1 end
    ),
    'progress', jsonb_build_object(
      'currentXp', total_xp,
      'currentThreshold', current_threshold,
      'nextThreshold', next_threshold,
      'progressPct', progress_percent
    ),
    'limits', jsonb_build_object(
      'daily_global_cap', 200,
      'daily_sport_cap', 120
    ),
    'stats', jsonb_build_object(
      'attended', attended_count,
      'no_show', no_show_count,
      'cancelled', cancelled_count,
      'reliability', reliability
    ),
    'updated_at', last_updated
  );
end;
$$;

alter table public.xp_accounts enable row level security;
alter table public.xp_sport_totals enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.event_checkin_sessions enable row level security;
alter table public.event_checkins enable row level security;

drop policy if exists "xp_accounts_read_own" on public.xp_accounts;
create policy "xp_accounts_read_own"
on public.xp_accounts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "xp_sport_totals_read_own" on public.xp_sport_totals;
create policy "xp_sport_totals_read_own"
on public.xp_sport_totals for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "xp_ledger_read_own" on public.xp_ledger;
create policy "xp_ledger_read_own"
on public.xp_ledger for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "event_checkin_sessions_read_organizer" on public.event_checkin_sessions;
create policy "event_checkin_sessions_read_organizer"
on public.event_checkin_sessions for select
to authenticated
using ((select auth.uid()) = organizer_id);

drop policy if exists "event_checkins_read_members" on public.event_checkins;
create policy "event_checkins_read_members"
on public.event_checkins for select
to authenticated
using (public.is_event_participant(event_id));

grant select on public.xp_accounts, public.xp_sport_totals, public.xp_ledger to authenticated;
grant select on public.event_checkin_sessions, public.event_checkins to authenticated;
revoke insert, update, delete on public.xp_accounts, public.xp_sport_totals, public.xp_ledger
  from anon, authenticated;
revoke insert, update, delete on public.event_checkin_sessions, public.event_checkins
  from anon, authenticated;
grant usage, select on sequence public.xp_ledger_id_seq to authenticated;

revoke all on function public.apply_xp_reward(uuid, text, integer, integer, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refresh_profile_reliability(uuid)
  from public, anon, authenticated;

revoke all on function public.get_my_xp_state() from public, anon;
grant execute on function public.get_my_xp_state() to authenticated;
revoke all on function public.start_event_checkin(uuid) from public, anon;
grant execute on function public.start_event_checkin(uuid) to authenticated;
revoke all on function public.get_event_checkin_session(uuid) from public, anon;
grant execute on function public.get_event_checkin_session(uuid) to authenticated;
revoke all on function public.check_in_to_event(uuid, text) from public, anon;
grant execute on function public.check_in_to_event(uuid, text) to authenticated;
revoke all on function public.list_event_checkin_participants(uuid) from public, anon;
grant execute on function public.list_event_checkin_participants(uuid) to authenticated;

-- Backfill beta activity once. Ref keys make this safe to rerun.
do $$
declare
  event_row public.events%rowtype;
  participant_row public.event_participants%rowtype;
begin
  for event_row in select * from public.events loop
    perform public.apply_xp_reward(
      event_row.creator_id,
      'event_created',
      10,
      10,
      event_row.sport_id::text,
      'event_created:' || event_row.id::text,
      jsonb_build_object('eventId', event_row.id, 'source', 'migration'),
      event_row.created_at
    );
  end loop;

  for participant_row in
    select *
    from public.event_participants
    where status in ('completed', 'no_show')
  loop
    if participant_row.status = 'completed' then
      perform public.apply_xp_reward(
        participant_row.user_id,
        'attendance_confirmed',
        30,
        20,
        (select sport_id::text from public.events where id = participant_row.event_id),
        'attendance_confirmed:' || participant_row.event_id::text || ':' || participant_row.user_id::text,
        jsonb_build_object('eventId', participant_row.event_id, 'attendance', 'attended', 'source', 'migration'),
        participant_row.updated_at
      );
    else
      perform public.apply_xp_reward(
        participant_row.user_id,
        'attendance_no_show',
        -50,
        -30,
        (select sport_id::text from public.events where id = participant_row.event_id),
        'attendance_no_show:' || participant_row.event_id::text || ':' || participant_row.user_id::text,
        jsonb_build_object('eventId', participant_row.event_id, 'attendance', 'no_show', 'source', 'migration'),
        participant_row.updated_at
      );
    end if;
    perform public.refresh_profile_reliability(participant_row.user_id);
  end loop;
end;
$$;

commit;
