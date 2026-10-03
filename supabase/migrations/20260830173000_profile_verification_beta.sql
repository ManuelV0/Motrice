begin;

create table if not exists public.profile_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('unverified', 'pending', 'verified', 'rejected', 'expired', 'suspended')),
  first_name text not null check (char_length(first_name) between 2 and 40),
  last_name text not null check (char_length(last_name) between 2 and 40),
  birth_date date not null,
  city text not null check (char_length(city) between 2 and 80),
  primary_sport text not null check (char_length(primary_sport) between 2 and 60),
  sport_level text not null default 'beginner'
    check (sport_level in ('beginner', 'intermediate', 'advanced')),
  bio text not null default '' check (char_length(bio) <= 600),
  profile_photo_url text not null check (char_length(profile_photo_url) between 10 and 2000),
  challenge_photo_path text not null check (char_length(challenge_photo_path) between 10 and 500),
  challenge_type text not null check (challenge_type in ('open_hand', 'thumb_up', 'two_fingers')),
  consent_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text not null default '' check (char_length(rejection_reason) <= 500),
  verified_at timestamptz,
  expires_at timestamptz,
  challenge_delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_verification_status_submitted_idx
  on public.profile_verification_requests(status, submitted_at);

-- Rollout controllato: durante la beta raccogliamo e revisioniamo le verifiche
-- senza bloccare immediatamente gli account gia esistenti. L'obbligo puo essere
-- attivato dall'amministratore dopo il collaudo tra dispositivi.
create table if not exists public.profile_verification_settings (
  singleton boolean primary key default true check (singleton),
  enforcement_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.profile_verification_settings (singleton, enforcement_enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.profile_verification_settings enable row level security;
revoke all on public.profile_verification_settings from anon, authenticated;

drop trigger if exists profile_verification_requests_set_updated_at
  on public.profile_verification_requests;
create trigger profile_verification_requests_set_updated_at
before update on public.profile_verification_requests
for each row execute function public.set_updated_at();

alter table public.profile_verification_requests enable row level security;

create or replace function public.profile_verification_is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.role() = 'service_role', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'moderator'), false);
$$;

drop policy if exists "profile_verification_read_own"
  on public.profile_verification_requests;
create policy "profile_verification_read_own"
on public.profile_verification_requests for select
to authenticated
using (user_id = auth.uid() or public.profile_verification_is_admin());

-- Le scritture passano esclusivamente dalle RPC validate sotto.
revoke all on public.profile_verification_requests from anon, authenticated;
grant select on public.profile_verification_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-verification-private',
  'profile-verification-private',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_verification_upload_own" on storage.objects;
create policy "profile_verification_upload_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-verification-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_verification_read_own_or_admin" on storage.objects;
create policy "profile_verification_read_own_or_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-verification-private'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

drop policy if exists "profile_verification_delete_own" on storage.objects;
create policy "profile_verification_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-verification-private'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_avatar_upload_own" on storage.objects;
create policy "profile_avatar_upload_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_avatar_update_own" on storage.objects;
create policy "profile_avatar_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_avatar_delete_own" on storage.objects;
create policy "profile_avatar_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create or replace function public.get_my_profile_verification()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.profile_verification_requests%rowtype;
  effective_status text;
  enforcement_enabled boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select settings.enforcement_enabled into enforcement_enabled
  from public.profile_verification_settings settings
  where settings.singleton = true;

  enforcement_enabled := coalesce(enforcement_enabled, false);

  select * into request_row
  from public.profile_verification_requests
  where user_id = actor_id;

  if not found then
    return jsonb_build_object(
      'status', 'unverified',
      'enforcement_enabled', enforcement_enabled,
      'can_use_verified_actions', not enforcement_enabled
    );
  end if;

  effective_status := case
    when request_row.status = 'verified'
      and request_row.expires_at is not null
      and request_row.expires_at <= now()
      then 'expired'
    else request_row.status
  end;

  return jsonb_build_object(
    'status', effective_status,
    'submitted_at', request_row.submitted_at,
    'verified_at', request_row.verified_at,
    'expires_at', request_row.expires_at,
    'rejection_reason', request_row.rejection_reason,
    'challenge_type', request_row.challenge_type,
    'enforcement_enabled', enforcement_enabled,
    'can_use_verified_actions', not enforcement_enabled or effective_status = 'verified'
  );
end;
$$;

create or replace function public.get_profile_verification_status(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.profile_verification_requests%rowtype;
  effective_status text;
begin
  select * into request_row
  from public.profile_verification_requests
  where user_id = target_user_id;

  if not found then return jsonb_build_object('status', 'unverified'); end if;

  effective_status := case
    when request_row.status = 'verified'
      and request_row.expires_at is not null
      and request_row.expires_at <= now()
      then 'expired'
    else request_row.status
  end;

  return jsonb_build_object(
    'status', effective_status,
    'verified_at', request_row.verified_at,
    'expires_at', request_row.expires_at
  );
end;
$$;

create or replace function public.can_access_verified_actions(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    not coalesce((
      select settings.enforcement_enabled
      from public.profile_verification_settings settings
      where settings.singleton = true
    ), false)
    or exists (
      select 1
      from public.profile_verification_requests request
      where request.user_id = target_user_id
        and request.status = 'verified'
        and (request.expires_at is null or request.expires_at > now())
    );
$$;

create or replace function public.submit_profile_verification(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_city text,
  p_primary_sport text,
  p_sport_level text,
  p_bio text,
  p_profile_photo_url text,
  p_challenge_photo_path text,
  p_challenge_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_level text;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if char_length(trim(coalesce(p_first_name, ''))) < 2 then raise exception 'Nome non valido'; end if;
  if char_length(trim(coalesce(p_last_name, ''))) < 2 then raise exception 'Cognome non valido'; end if;
  if p_birth_date is null or p_birth_date > current_date then raise exception 'Data di nascita non valida'; end if;
  if char_length(trim(coalesce(p_city, ''))) < 2 then raise exception 'Citta non valida'; end if;
  if char_length(trim(coalesce(p_primary_sport, ''))) < 2 then raise exception 'Sport non valido'; end if;
  if p_challenge_type not in ('open_hand', 'thumb_up', 'two_fingers') then raise exception 'Challenge non valida'; end if;
  if position(actor_id::text || '/' in coalesce(p_challenge_photo_path, '')) <> 1 then
    raise exception 'Percorso challenge non valido';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'profile-verification-private'
      and object.name = trim(p_challenge_photo_path)
  ) then raise exception 'Foto challenge non trovata'; end if;
  if position('/profile-avatars/' || actor_id::text || '/' in coalesce(p_profile_photo_url, '')) = 0 then
    raise exception 'Foto profilo non valida';
  end if;

  normalized_level := case lower(trim(coalesce(p_sport_level, '')))
    when 'intermediate' then 'intermediate'
    when 'advanced' then 'advanced'
    else 'beginner'
  end;

  insert into public.profile_verification_requests (
    user_id,
    status,
    first_name,
    last_name,
    birth_date,
    city,
    primary_sport,
    sport_level,
    bio,
    profile_photo_url,
    challenge_photo_path,
    challenge_type,
    consent_at,
    submitted_at,
    reviewed_at,
    reviewed_by,
    rejection_reason,
    verified_at,
    expires_at,
    challenge_delete_after
  ) values (
    actor_id,
    'pending',
    left(trim(p_first_name), 40),
    left(trim(p_last_name), 40),
    p_birth_date,
    left(trim(p_city), 80),
    left(trim(p_primary_sport), 60),
    normalized_level,
    left(trim(coalesce(p_bio, '')), 600),
    trim(p_profile_photo_url),
    trim(p_challenge_photo_path),
    p_challenge_type,
    now(),
    now(),
    null,
    null,
    '',
    null,
    null,
    null
  )
  on conflict (user_id) do update set
    status = 'pending',
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    birth_date = excluded.birth_date,
    city = excluded.city,
    primary_sport = excluded.primary_sport,
    sport_level = excluded.sport_level,
    bio = excluded.bio,
    profile_photo_url = excluded.profile_photo_url,
    challenge_photo_path = excluded.challenge_photo_path,
    challenge_type = excluded.challenge_type,
    consent_at = now(),
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    rejection_reason = '',
    verified_at = null,
    expires_at = null,
    challenge_delete_after = null,
    updated_at = now();

  update public.profiles
  set
    display_name = left(trim(p_first_name) || ' ' || trim(p_last_name), 40),
    city = left(trim(p_city), 80),
    bio = left(trim(coalesce(p_bio, '')), 600),
    avatar_url = trim(p_profile_photo_url),
    level = normalized_level,
    updated_at = now()
  where id = actor_id;

  return public.get_my_profile_verification();
end;
$$;

create or replace function public.list_pending_profile_verifications()
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  city text,
  primary_sport text,
  sport_level text,
  profile_photo_url text,
  challenge_photo_path text,
  challenge_type text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.profile_verification_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  return query
  select
    request.id,
    request.user_id,
    trim(request.first_name || ' ' || request.last_name),
    request.city,
    request.primary_sport,
    request.sport_level,
    request.profile_photo_url,
    request.challenge_photo_path,
    request.challenge_type,
    request.submitted_at
  from public.profile_verification_requests request
  where request.status = 'pending'
  order by request.submitted_at;
end;
$$;

create or replace function public.review_profile_verification(
  target_user_id uuid,
  decision text,
  reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_decision text := lower(trim(coalesce(decision, '')));
begin
  if not public.profile_verification_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  if normalized_decision not in ('verified', 'rejected', 'suspended') then raise exception 'Esito non valido'; end if;

  update public.profile_verification_requests
  set
    status = normalized_decision,
    reviewed_at = now(),
    reviewed_by = actor_id,
    rejection_reason = case when normalized_decision = 'verified' then '' else left(trim(coalesce(reason, '')), 500) end,
    verified_at = case when normalized_decision = 'verified' then now() else null end,
    expires_at = case when normalized_decision = 'verified' then now() + interval '24 months' else null end,
    challenge_delete_after = now() + interval '30 days',
    updated_at = now()
  where user_id = target_user_id;

  if not found then raise exception 'Richiesta non trovata'; end if;

  return public.get_profile_verification_status(target_user_id);
end;
$$;

create or replace function public.require_verified_profile_for_event_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid;
begin
  if public.profile_verification_is_admin() then return new; end if;

  if tg_table_name = 'events' then target_user := new.creator_id;
  elsif tg_table_name = 'event_messages' then target_user := new.sender_id;
  elsif tg_table_name = 'event_checkin_sessions' then target_user := new.organizer_id;
  elsif tg_table_name = 'event_host_qr_sessions' then target_user := new.host_id;
  else target_user := new.user_id;
  end if;

  if target_user is null or not public.can_access_verified_actions(target_user) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILE_VERIFICATION_REQUIRED: verifica il profilo per usare questa funzione';
  end if;

  return new;
end;
$$;

drop trigger if exists require_verified_profile_on_event_create on public.events;
create trigger require_verified_profile_on_event_create
before insert on public.events
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_event_join on public.event_participants;
create trigger require_verified_profile_on_event_join
before insert on public.event_participants
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_join_request on public.event_join_requests;
create trigger require_verified_profile_on_join_request
before insert on public.event_join_requests
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_checkin on public.event_checkins;
create trigger require_verified_profile_on_checkin
before insert on public.event_checkins
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_checkin_session on public.event_checkin_sessions;
create trigger require_verified_profile_on_checkin_session
before insert on public.event_checkin_sessions
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_host_qr_session on public.event_host_qr_sessions;
create trigger require_verified_profile_on_host_qr_session
before insert on public.event_host_qr_sessions
for each row execute function public.require_verified_profile_for_event_write();

drop trigger if exists require_verified_profile_on_event_message on public.event_messages;
create trigger require_verified_profile_on_event_message
before insert on public.event_messages
for each row execute function public.require_verified_profile_for_event_write();

revoke all on function public.get_my_profile_verification() from public, anon;
revoke all on function public.get_profile_verification_status(uuid) from public, anon;
revoke all on function public.can_access_verified_actions(uuid) from public, anon;
revoke all on function public.submit_profile_verification(text, text, date, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.list_pending_profile_verifications() from public, anon, authenticated;
revoke all on function public.review_profile_verification(uuid, text, text) from public, anon, authenticated;

grant execute on function public.get_my_profile_verification() to authenticated;
grant execute on function public.get_profile_verification_status(uuid) to authenticated;
grant execute on function public.can_access_verified_actions(uuid) to authenticated;
grant execute on function public.submit_profile_verification(text, text, date, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.list_pending_profile_verifications() to authenticated, service_role;
grant execute on function public.review_profile_verification(uuid, text, text) to authenticated, service_role;

commit;
