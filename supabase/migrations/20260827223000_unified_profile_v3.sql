begin;

-- Motrice V3 starts from a clean ledger without importing legacy profile metrics.
create table if not exists public.profile_v3_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  present_count integer not null default 0 check (present_count >= 0),
  no_show_count integer not null default 0 check (no_show_count >= 0),
  late_cancellation_count integer not null default 0 check (late_cancellation_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_wallet (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_cents integer not null default 0 check (available_cents >= 0),
  locked_cents integer not null default 0 check (locked_cents >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.mot_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  evento_id uuid references public.events(id) on delete cascade,
  mot integer not null check (mot <> 0),
  qr_verificato boolean not null default false,
  motivo text not null default 'checkin_qr' check (char_length(motivo) between 2 and 80),
  ref_key text not null check (char_length(ref_key) between 3 and 180),
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create table if not exists public.xp_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  evento_id uuid references public.events(id) on delete cascade,
  xp integer not null check (xp <> 0),
  motivo text not null check (char_length(motivo) between 2 and 120),
  ref_key text not null check (char_length(ref_key) between 3 and 180),
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create table if not exists public.profile_v3_reliability_outcomes (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  outcome text not null check (outcome in ('present', 'no_show', 'late_cancellation')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, outcome)
);

create table if not exists public.event_host_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > issued_at)
);

create index if not exists mot_logs_user_created_idx on public.mot_logs(user_id, created_at desc);
create index if not exists xp_logs_user_created_idx on public.xp_logs(user_id, created_at desc);
create index if not exists event_host_qr_sessions_event_expiry_idx
  on public.event_host_qr_sessions(event_id, expires_at desc);

drop trigger if exists profile_v3_accounts_set_updated_at on public.profile_v3_accounts;
create trigger profile_v3_accounts_set_updated_at
before update on public.profile_v3_accounts
for each row execute function public.set_updated_at();

drop trigger if exists credit_wallet_set_updated_at on public.credit_wallet;
create trigger credit_wallet_set_updated_at
before update on public.credit_wallet
for each row execute function public.set_updated_at();

create or replace function public.ensure_profile_v3_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profile_v3_accounts (user_id) values (target_user_id)
  on conflict (user_id) do nothing;
  insert into public.credit_wallet (user_id) values (target_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.issue_event_host_qr(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  event_row public.events%rowtype;
  fresh_token text;
  expires_at_value timestamptz := clock_timestamp() + interval '30 seconds';
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into event_row from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;
  if event_row.creator_id <> actor_id then raise exception 'Solo l organizzatore puo mostrare questo QR'; end if;
  if event_row.status <> 'scheduled' then raise exception 'Evento non disponibile'; end if;

  delete from public.event_host_qr_sessions
  where event_id = target_event_id and (host_id = actor_id or expires_at <= now());

  fresh_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_host_qr_sessions (event_id, host_id, token, expires_at)
  values (target_event_id, actor_id, fresh_token, expires_at_value);

  return jsonb_build_object(
    'event_id', target_event_id,
    'token', fresh_token,
    'expires_at', expires_at_value,
    'ttl_seconds', 30,
    'qr_payload', jsonb_build_object('version', 3, 'type', 'host_checkin', 'eventId', target_event_id, 'token', fresh_token)
  );
end;
$$;

create or replace function public.scan_event_host_qr(
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
  event_row public.events%rowtype;
  session_row public.event_host_qr_sessions%rowtype;
  participant public.event_participants%rowtype;
  existing_checkin timestamptz;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if trim(coalesce(submitted_token, '')) = '' then raise exception 'QR non valido'; end if;

  select * into session_row
  from public.event_host_qr_sessions session
  where session.token = trim(submitted_token);
  if not found then raise exception 'QR non valido'; end if;
  if session_row.event_id <> target_event_id then raise exception 'QR appartenente ad un altro evento'; end if;
  if session_row.expires_at <= clock_timestamp() then raise exception 'QR scaduto'; end if;

  select * into event_row from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if event_row.creator_id <> session_row.host_id then raise exception 'QR non valido'; end if;
  if actor_id = event_row.creator_id then raise exception 'L organizzatore non puo usare il proprio QR'; end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found or participant.status not in ('going', 'completed') then
    raise exception 'Prenotazione non trovata o non approvata';
  end if;

  select checked_in_at into existing_checkin
  from public.event_checkins
  where event_id = target_event_id and user_id = actor_id;
  if found then
    return jsonb_build_object('ok', true, 'already_checked', true, 'checked_in_at', existing_checkin, 'mot_awarded', 0, 'xp_awarded', 0);
  end if;

  insert into public.event_checkins (event_id, user_id, checked_in_at, source)
  values (target_event_id, actor_id, clock_timestamp(), 'qr');

  update public.event_participants
  set
    checked_in_at = coalesce(checked_in_at, clock_timestamp()),
    checked_in_by = event_row.creator_id,
    cashback_percent = greatest(cashback_percent, 60),
    stake_status = case when stake_status = 'locked' then 'verified' else stake_status end,
    updated_at = now()
  where event_id = target_event_id and user_id = actor_id;

  return jsonb_build_object(
    'ok', true,
    'already_checked', false,
    'event_id', target_event_id,
    'participant_id', actor_id,
    'checked_in_at', clock_timestamp(),
    'mot_awarded', 20,
    'xp_awarded', 50
  );
end;
$$;

create or replace function public.apply_profile_v3_checkin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_mot_id bigint;
  host_user_id uuid;
  stake integer := 0;
  participant_locked integer := 0;
begin
  perform public.ensure_profile_v3_account(new.user_id);

  insert into public.mot_logs (user_id, evento_id, mot, qr_verificato, motivo, ref_key, created_at)
  values (
    new.user_id,
    new.event_id,
    20,
    new.source in ('qr', 'organizer'),
    'checkin_qr',
    'checkin:' || new.event_id::text,
    new.checked_in_at
  )
  on conflict (user_id, ref_key) do nothing
  returning id into inserted_mot_id;

  if inserted_mot_id is null then return new; end if;

  insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key, created_at)
  values (new.user_id, new.event_id, 50, 'Check-in QR verificato', 'checkin:' || new.event_id::text, new.checked_in_at)
  on conflict (user_id, ref_key) do nothing;

  insert into public.profile_v3_reliability_outcomes (event_id, user_id, outcome, created_at)
  values (new.event_id, new.user_id, 'present', new.checked_in_at)
  on conflict do nothing;

  update public.profile_v3_accounts
  set present_count = present_count + 1
  where user_id = new.user_id;

  -- Settle only credit locked in the V3 wallet. Legacy beta credit is never copied.
  select event.creator_id, coalesce(participant.stake_cents, 0), wallet.locked_cents
  into host_user_id, stake, participant_locked
  from public.events event
  join public.event_participants participant
    on participant.event_id = event.id and participant.user_id = new.user_id
  join public.credit_wallet wallet on wallet.user_id = new.user_id
  where event.id = new.event_id;

  if host_user_id is not null and stake > 0 and participant_locked >= stake then
    perform public.ensure_profile_v3_account(host_user_id);
    update public.credit_wallet
    set locked_cents = locked_cents - stake
    where user_id = new.user_id;
    update public.credit_wallet
    set available_cents = available_cents + stake
    where user_id = host_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_v3_checkin on public.event_checkins;
create trigger on_profile_v3_checkin
after insert on public.event_checkins
for each row execute function public.apply_profile_v3_checkin();

create or replace function public.apply_profile_v3_negative_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  starts_at_value timestamptz;
  inserted_outcome text;
begin
  if old.status is not distinct from new.status then return new; end if;
  perform public.ensure_profile_v3_account(new.user_id);

  if new.status = 'no_show' then
    inserted_outcome := 'no_show';
  elsif new.status = 'cancelled' and old.status = 'going' then
    select starts_at into starts_at_value from public.events where id = new.event_id;
    if starts_at_value > now() + interval '30 minutes' then return new; end if;
    inserted_outcome := 'late_cancellation';
  else
    return new;
  end if;

  insert into public.profile_v3_reliability_outcomes (event_id, user_id, outcome)
  values (new.event_id, new.user_id, inserted_outcome)
  on conflict do nothing;
  if not found then return new; end if;

  update public.profile_v3_accounts
  set
    no_show_count = no_show_count + case when inserted_outcome = 'no_show' then 1 else 0 end,
    late_cancellation_count = late_cancellation_count + case when inserted_outcome = 'late_cancellation' then 1 else 0 end
  where user_id = new.user_id;

  -- No-show consumes locked V3 credit and never awards MOT or XP.
  if inserted_outcome = 'no_show' and new.stake_cents > 0 then
    update public.credit_wallet
    set locked_cents = greatest(0, locked_cents - new.stake_cents)
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_v3_negative_outcome on public.event_participants;
create trigger on_profile_v3_negative_outcome
after update of status on public.event_participants
for each row execute function public.apply_profile_v3_negative_outcome();

create or replace function public.get_my_profile_v3()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  account public.profile_v3_accounts%rowtype;
  wallet public.credit_wallet%rowtype;
  profile_row public.profiles%rowtype;
  mot_total integer := 0;
  xp_total integer := 0;
  host_events integer := 0;
  host_participants integer := 0;
  total_outcomes integer := 0;
  score integer := 0;
  demo_used boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  perform public.ensure_profile_v3_account(actor_id);
  select * into account from public.profile_v3_accounts where user_id = actor_id;
  select * into wallet from public.credit_wallet where user_id = actor_id;
  select * into profile_row from public.profiles where id = actor_id;
  select coalesce(sum(mot), 0)::integer into mot_total from public.mot_logs where user_id = actor_id and qr_verificato;
  select coalesce(sum(xp), 0)::integer into xp_total from public.xp_logs where user_id = actor_id;
  select count(*)::integer into host_events from public.events where creator_id = actor_id and created_at >= account.started_at;
  select count(*)::integer into host_participants
  from public.event_participants participant
  join public.events event on event.id = participant.event_id
  where event.creator_id = actor_id and event.created_at >= account.started_at and participant.user_id <> actor_id;
  total_outcomes := account.present_count + account.no_show_count + account.late_cancellation_count;
  score := case when total_outcomes = 0 then 0 else round(account.present_count * 100.0 / total_outcomes)::integer end;
  select exists (select 1 from public.mot_logs where user_id = actor_id and ref_key = 'demo:checkin') into demo_used;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'display_name', coalesce(profile_row.display_name, 'Alessandro'),
      'avatar_url', coalesce(profile_row.avatar_url, ''),
      'bio', coalesce(profile_row.bio, ''),
      'city', coalesce(nullif(profile_row.city, ''), 'Ascoli Piceno'),
      'sports', jsonb_build_array('Calisthenics', 'Running'),
      'member_since', 'Mar 2026'
    ),
    'verified_checkins', account.present_count,
    'reliability', jsonb_build_object('score', score, 'present', account.present_count, 'no_show', account.no_show_count, 'late_cancellations', account.late_cancellation_count),
    'mot', jsonb_build_object('total', mot_total, 'logs', coalesce((select jsonb_agg(row_to_json(log_row) order by log_row.created_at desc) from (select id, evento_id, mot, qr_verificato, motivo, created_at from public.mot_logs where user_id = actor_id order by created_at desc limit 10) log_row), '[]'::jsonb)),
    'ratings', jsonb_build_object('average', 0, 'verified_count', 0),
    'host', jsonb_build_object('events', host_events, 'participants', host_participants),
    'xp', jsonb_build_object('total', xp_total, 'logs', coalesce((select jsonb_agg(row_to_json(xp_row) order by xp_row.created_at desc) from (select id, evento_id, xp, motivo, created_at from public.xp_logs where user_id = actor_id order by created_at desc limit 10) xp_row), '[]'::jsonb)),
    'credit_wallet', jsonb_build_object('available_cents', wallet.available_cents, 'locked_cents', wallet.locked_cents),
    'recent_activity', coalesce((select jsonb_agg(jsonb_build_object('id', 'mot-' || log.id::text, 'title', 'Check-in QR', 'subtitle', '+' || log.mot::text || ' MOT · +50 XP', 'created_at', log.created_at) order by log.created_at desc) from (select * from public.mot_logs where user_id = actor_id and qr_verificato order by created_at desc limit 5) log), '[]'::jsonb),
    'demo_used', demo_used
  );
end;
$$;

create or replace function public.simulate_my_profile_v3_checkin()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor_id uuid := auth.uid(); inserted_id bigint;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  perform public.ensure_profile_v3_account(actor_id);
  insert into public.mot_logs (user_id, evento_id, mot, qr_verificato, motivo, ref_key)
  values (actor_id, null, 20, true, 'demo_checkin_qr', 'demo:checkin')
  on conflict (user_id, ref_key) do nothing returning id into inserted_id;
  if inserted_id is not null then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key)
    values (actor_id, null, 50, 'Check-in QR verificato', 'demo:checkin')
    on conflict (user_id, ref_key) do nothing;
    update public.profile_v3_accounts set present_count = present_count + 1 where user_id = actor_id;
  end if;
  return public.get_my_profile_v3();
end;
$$;

create or replace function public.profile_v3_is_admin()
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(auth.role() = 'service_role', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.admin_reset_credits(target_user_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if not public.profile_v3_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  update public.credit_wallet set available_cents = 0, locked_cents = 0 where target_user_id is null or user_id = target_user_id;
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.admin_reset_mot(target_user_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if not public.profile_v3_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  delete from public.mot_logs where target_user_id is null or user_id = target_user_id;
  get diagnostics affected = row_count; return affected;
end;
$$;

create or replace function public.admin_reset_xp(target_user_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  if not public.profile_v3_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  delete from public.xp_logs where target_user_id is null or user_id = target_user_id;
  get diagnostics affected = row_count; return affected;
end;
$$;

alter table public.profile_v3_accounts enable row level security;
alter table public.credit_wallet enable row level security;
alter table public.mot_logs enable row level security;
alter table public.xp_logs enable row level security;
alter table public.profile_v3_reliability_outcomes enable row level security;
alter table public.event_host_qr_sessions enable row level security;

drop policy if exists profile_v3_accounts_read_own on public.profile_v3_accounts;
create policy profile_v3_accounts_read_own on public.profile_v3_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists credit_wallet_read_own on public.credit_wallet;
create policy credit_wallet_read_own on public.credit_wallet for select to authenticated using (user_id = auth.uid());
drop policy if exists mot_logs_read_own on public.mot_logs;
create policy mot_logs_read_own on public.mot_logs for select to authenticated using (user_id = auth.uid());
drop policy if exists xp_logs_read_own on public.xp_logs;
create policy xp_logs_read_own on public.xp_logs for select to authenticated using (user_id = auth.uid());

revoke all on function public.ensure_profile_v3_account(uuid) from public, anon, authenticated;
revoke all on function public.apply_profile_v3_checkin() from public, anon, authenticated;
revoke all on function public.apply_profile_v3_negative_outcome() from public, anon, authenticated;
revoke all on function public.get_my_profile_v3() from public, anon;
revoke all on function public.simulate_my_profile_v3_checkin() from public, anon;
revoke all on function public.issue_event_host_qr(uuid) from public, anon;
revoke all on function public.scan_event_host_qr(uuid, text) from public, anon;
grant execute on function public.get_my_profile_v3() to authenticated;
grant execute on function public.simulate_my_profile_v3_checkin() to authenticated;
grant execute on function public.issue_event_host_qr(uuid) to authenticated;
grant execute on function public.scan_event_host_qr(uuid, text) to authenticated;
revoke all on function public.admin_reset_credits(uuid) from public, anon;
revoke all on function public.admin_reset_mot(uuid) from public, anon;
revoke all on function public.admin_reset_xp(uuid) from public, anon;
grant execute on function public.admin_reset_credits(uuid) to authenticated, service_role;
grant execute on function public.admin_reset_mot(uuid) to authenticated, service_role;
grant execute on function public.admin_reset_xp(uuid) to authenticated, service_role;

commit;
