begin;

-- GPS is a first-class verification source, distinct from organizer QR scans.
alter table public.event_checkins drop constraint if exists event_checkins_source_check;
alter table public.event_checkins
  add constraint event_checkins_source_check
  check (source in ('qr', 'organizer', 'gps'));

create table if not exists public.event_workout_sessions (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in ('participant', 'organizer')),
  started_at timestamptz not null default now(),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  mot_sixty_awarded boolean not null default false,
  xp_completion_awarded boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

drop trigger if exists event_workout_sessions_set_updated_at on public.event_workout_sessions;
create trigger event_workout_sessions_set_updated_at
before update on public.event_workout_sessions
for each row execute function public.set_updated_at();

alter table public.event_workout_sessions enable row level security;
drop policy if exists event_workout_sessions_read_own on public.event_workout_sessions;
create policy event_workout_sessions_read_own
on public.event_workout_sessions for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.events event
    where event.id = event_id and event.creator_id = auth.uid()
  )
);

-- V3 rewards: QR = 5 MOT + 25 XP; GPS start = 2 MOT.
-- ref_key unique constraints make the operation idempotent.
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
  is_gps boolean := new.source = 'gps';
  mot_value integer := case when new.source = 'gps' then 2 else 5 end;
  xp_value integer := case when new.source = 'gps' then 0 else 25 end;
begin
  perform public.ensure_profile_v3_account(new.user_id);

  insert into public.mot_logs (user_id, evento_id, mot, qr_verificato, motivo, ref_key, created_at)
  values (
    new.user_id,
    new.event_id,
    mot_value,
    true,
    case when is_gps then 'checkin_gps' else 'checkin_qr' end,
    'checkin:' || new.event_id::text,
    new.checked_in_at
  )
  on conflict (user_id, ref_key) do nothing
  returning id into inserted_mot_id;

  if inserted_mot_id is null then return new; end if;

  if xp_value > 0 then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key, created_at)
    values (new.user_id, new.event_id, xp_value, 'Check-in QR verificato', 'checkin:' || new.event_id::text, new.checked_in_at)
    on conflict (user_id, ref_key) do nothing;
  end if;

  insert into public.profile_v3_reliability_outcomes (event_id, user_id, outcome, created_at)
  values (new.event_id, new.user_id, 'present', new.checked_in_at)
  on conflict do nothing;

  if found then
    update public.profile_v3_accounts
    set present_count = present_count + 1
    where user_id = new.user_id;
  end if;

  select event.creator_id, coalesce(participant.stake_cents, 0), wallet.locked_cents
  into host_user_id, stake, participant_locked
  from public.events event
  join public.event_participants participant
    on participant.event_id = event.id and participant.user_id = new.user_id
  join public.credit_wallet wallet on wallet.user_id = new.user_id
  where event.id = new.event_id;

  if host_user_id is not null and stake > 0 and participant_locked >= stake then
    perform public.ensure_profile_v3_account(host_user_id);
    update public.credit_wallet set locked_cents = locked_cents - stake where user_id = new.user_id;
    update public.credit_wallet set available_cents = available_cents + stake where user_id = host_user_id;
  end if;

  return new;
end;
$$;

create or replace function public.start_event_gps_checkin(
  target_event_id uuid,
  sample_lat double precision,
  sample_lng double precision,
  sample_accuracy_m double precision default null
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
  distance_value double precision;
  already_checked boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into target_event from public.events where id = target_event_id for update;
  if not found then raise exception 'Evento non trovato'; end if;
  if target_event.creator_id = actor_id then raise exception 'L organizzatore deve scansionare il QR del partecipante'; end if;
  if target_event.verification_mode not in ('geo', 'both') then raise exception 'Questo evento richiede il QR Code'; end if;
  if sample_lat is null or sample_lng is null then raise exception 'Posizione non disponibile'; end if;

  select * into participant
  from public.event_participants
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found or participant.status not in ('going', 'completed') then raise exception 'Partecipazione non valida'; end if;

  distance_value := public.event_distance_m(sample_lat, sample_lng, target_event.lat, target_event.lng);
  if distance_value is null or distance_value > target_event.geofence_radius_m then
    raise exception 'Sei fuori dall area dell evento';
  end if;

  already_checked := participant.checked_in_at is not null;
  insert into public.event_presence_samples (
    event_id, user_id, sample_role, lat, lng, accuracy_m, speed_mps, distance_m, is_in_radius
  ) values (
    target_event_id, actor_id, 'participant', sample_lat, sample_lng,
    sample_accuracy_m, null, distance_value, true
  );

  if not already_checked then
    update public.event_participants
    set checked_in_at = now(), checked_in_by = target_event.creator_id,
        checkin_lat = sample_lat, checkin_lng = sample_lng,
        cashback_percent = greatest(cashback_percent, 60),
        stake_status = case when stake_status = 'locked' then 'verified' else stake_status end,
        updated_at = now()
    where event_id = target_event_id and user_id = actor_id;

    insert into public.event_checkins (event_id, user_id, checked_in_at, source)
    values (target_event_id, actor_id, now(), 'gps')
    on conflict (event_id, user_id) do nothing;

    insert into public.notifications (user_id, actor_id, event_id, type, title, body, payload)
    values (
      actor_id, target_event.creator_id, target_event_id,
      'event_checkin_verified', 'Presenza GPS verificata',
      'Allenamento sbloccato: +2 MOT.',
      jsonb_build_object('cashback_percent', 60, 'mot_awarded', 2, 'verification_mode', 'geo')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'checked_in_now', not already_checked,
    'checked_in_at', coalesce(participant.checked_in_at, now()),
    'cashback_percent', 60,
    'mot_awarded', case when already_checked then 0 else 2 end,
    'distance_m', round(distance_value::numeric, 1)
  );
end;
$$;

create or replace function public.start_event_workout(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  participant public.event_participants%rowtype;
  role_value text;
  session_row public.event_workout_sessions%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if target_event.creator_id = actor_id then
    role_value := 'organizer';
    if not exists (select 1 from public.event_checkins where event_id = target_event_id) and not target_event.is_personal then
      raise exception 'Scannerizza prima il QR di almeno un partecipante';
    end if;
  else
    role_value := 'participant';
    select * into participant from public.event_participants
    where event_id = target_event_id and user_id = actor_id;
    if not found or participant.status not in ('going', 'completed') or participant.checked_in_at is null then
      raise exception 'Verifica prima la presenza';
    end if;
  end if;

  insert into public.event_workout_sessions (event_id, user_id, role_key)
  values (target_event_id, actor_id, role_value)
  on conflict (event_id, user_id) do update set updated_at = now()
  returning * into session_row;

  return to_jsonb(session_row);
end;
$$;

create or replace function public.record_event_workout_progress(
  target_event_id uuid,
  progress_percent_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.event_workout_sessions%rowtype;
  checkin_source text;
  mot_awarded_value integer := 0;
begin
  select * into session_row from public.event_workout_sessions
  where event_id = target_event_id and user_id = actor_id for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;

  session_row.progress_percent := greatest(session_row.progress_percent, least(100, greatest(0, progress_percent_value)));
  select source into checkin_source from public.event_checkins
  where event_id = target_event_id and user_id = actor_id;

  if session_row.role_key = 'participant'
    and checkin_source = 'gps'
    and session_row.progress_percent >= 60
    and not session_row.mot_sixty_awarded
  then
    insert into public.mot_logs (user_id, evento_id, mot, qr_verificato, motivo, ref_key)
    values (actor_id, target_event_id, 3, true, 'workout_60_percent', 'workout:60:' || target_event_id::text)
    on conflict (user_id, ref_key) do nothing;
    if found then mot_awarded_value := 3; end if;
    session_row.mot_sixty_awarded := true;
  end if;

  update public.event_workout_sessions
  set progress_percent = session_row.progress_percent,
      mot_sixty_awarded = session_row.mot_sixty_awarded
  where event_id = target_event_id and user_id = actor_id;

  return jsonb_build_object(
    'progress_percent', session_row.progress_percent,
    'mot_sixty_awarded', session_row.mot_sixty_awarded,
    'mot_awarded', mot_awarded_value
  );
end;
$$;

create or replace function public.complete_event_workout(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.event_workout_sessions%rowtype;
  participant public.event_participants%rowtype;
  xp_awarded_value integer := 0;
  completed_at_value timestamptz := now();
begin
  select * into session_row from public.event_workout_sessions
  where event_id = target_event_id and user_id = actor_id for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;
  if session_row.progress_percent < 100 then raise exception 'Completa tutta la scheda prima di terminare'; end if;

  if session_row.role_key = 'participant' and not session_row.xp_completion_awarded then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key)
    values (actor_id, target_event_id, 25, 'Allenamento completato', 'workout:complete:' || target_event_id::text)
    on conflict (user_id, ref_key) do nothing;
    if found then xp_awarded_value := 25; end if;

    select * into participant from public.event_participants
    where event_id = target_event_id and user_id = actor_id for update;
    if found then
      update public.event_participants
      set status = 'completed', cashback_percent = 100,
          stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
          minimum_reached_at = coalesce(minimum_reached_at, completed_at_value),
          completed_at = coalesce(completed_at, completed_at_value), updated_at = now()
      where event_id = target_event_id and user_id = actor_id;

      if participant.stake_cents > 0 and participant.stake_status in ('locked', 'verified') then
        update public.wallet_accounts
        set available_cents = available_cents + participant.stake_cents,
            locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = actor_id;
      end if;
    end if;
  end if;

  update public.event_workout_sessions
  set progress_percent = 100,
      xp_completion_awarded = xp_completion_awarded or session_row.role_key = 'participant',
      completed_at = coalesce(completed_at, completed_at_value)
  where event_id = target_event_id and user_id = actor_id
  returning * into session_row;

  return jsonb_build_object(
    'completed_at', session_row.completed_at,
    'xp_completion_awarded', session_row.xp_completion_awarded,
    'xp_awarded', xp_awarded_value
  );
end;
$$;

create or replace function public.apply_profile_v3_review_bonus()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key, created_at)
  values (new.reviewer_id, new.event_id, 25, 'Questionario compagno di allenamento', 'review:' || new.event_id::text, new.created_at)
  on conflict (user_id, ref_key) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_v3_review_bonus on public.event_reviews;
create trigger on_profile_v3_review_bonus
after insert on public.event_reviews
for each row execute function public.apply_profile_v3_review_bonus();

revoke all on function public.start_event_gps_checkin(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.start_event_workout(uuid) from public, anon;
revoke all on function public.record_event_workout_progress(uuid, integer) from public, anon;
revoke all on function public.complete_event_workout(uuid) from public, anon;
grant execute on function public.start_event_gps_checkin(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.start_event_workout(uuid) to authenticated;
grant execute on function public.record_event_workout_progress(uuid, integer) to authenticated;
grant execute on function public.complete_event_workout(uuid) to authenticated;

commit;
