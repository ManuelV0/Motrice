begin;

-- Le foto scelte per l'avatar vengono confrontate con la foto identita
-- privata gia approvata. Fino all'esito non diventano mai pubbliche.
create table if not exists public.profile_photo_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  identity_reference text not null check (char_length(identity_reference) between 10 and 2000),
  candidate_path text not null check (char_length(candidate_path) between 10 and 500),
  candidate_mime_type text not null default 'image/jpeg'
    check (candidate_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_method text not null default 'manual'
    check (review_method in ('manual', 'provider')),
  match_score numeric(5, 4) check (match_score is null or (match_score >= 0 and match_score <= 1)),
  consent_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text not null default '' check (char_length(rejection_reason) <= 500),
  approved_avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_photo_changes_user_submitted_idx
  on public.profile_photo_change_requests(user_id, submitted_at desc);
create index if not exists profile_photo_changes_status_submitted_idx
  on public.profile_photo_change_requests(status, submitted_at);
create unique index if not exists profile_photo_changes_one_pending_idx
  on public.profile_photo_change_requests(user_id)
  where status = 'pending';

drop trigger if exists profile_photo_change_requests_set_updated_at
  on public.profile_photo_change_requests;
create trigger profile_photo_change_requests_set_updated_at
before update on public.profile_photo_change_requests
for each row execute function public.set_updated_at();

alter table public.profile_photo_change_requests enable row level security;
revoke all on public.profile_photo_change_requests from anon, authenticated;
grant select on public.profile_photo_change_requests to authenticated;

drop policy if exists "profile_photo_changes_read_own_or_admin"
  on public.profile_photo_change_requests;
create policy "profile_photo_changes_read_own_or_admin"
on public.profile_photo_change_requests for select
to authenticated
using (user_id = auth.uid() or public.profile_verification_is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photo-candidates',
  'profile-photo-candidates',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photo_candidate_upload_own" on storage.objects;
create policy "profile_photo_candidate_upload_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photo-candidates'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_photo_candidate_read_own_or_admin" on storage.objects;
create policy "profile_photo_candidate_read_own_or_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-photo-candidates'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

drop policy if exists "profile_photo_candidate_delete_own_or_admin" on storage.objects;
create policy "profile_photo_candidate_delete_own_or_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photo-candidates'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

-- L'upsert di Storage effettua anche una SELECT. Questa policy corregge il
-- caricamento copertina esistente e consente al revisore di pubblicare solo
-- l'avatar gia approvato.
drop policy if exists "profile_avatar_read_own_or_admin" on storage.objects;
create policy "profile_avatar_read_own_or_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

drop policy if exists "profile_avatar_upload_own" on storage.objects;
create policy "profile_avatar_upload_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

drop policy if exists "profile_avatar_update_own" on storage.objects;
create policy "profile_avatar_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
)
with check (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

drop policy if exists "profile_avatar_delete_own" on storage.objects;
create policy "profile_avatar_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.profile_verification_is_admin()
  )
);

create or replace function public.get_my_profile_photo_change()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.profile_photo_change_requests%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into request_row
  from public.profile_photo_change_requests request
  where request.user_id = actor_id
  order by request.submitted_at desc
  limit 1;

  if not found then return jsonb_build_object('status', 'none'); end if;

  return jsonb_build_object(
    'request_id', request_row.id,
    'status', request_row.status,
    'submitted_at', request_row.submitted_at,
    'reviewed_at', request_row.reviewed_at,
    'review_method', request_row.review_method,
    'match_score', request_row.match_score,
    'rejection_reason', request_row.rejection_reason,
    'approved_avatar_url', request_row.approved_avatar_url
  );
end;
$$;

create or replace function public.submit_profile_photo_change(
  p_candidate_path text,
  p_candidate_mime_type text,
  p_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  identity_reference text;
  normalized_path text := trim(coalesce(p_candidate_path, ''));
  normalized_mime text := lower(trim(coalesce(p_candidate_mime_type, 'image/jpeg')));
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if coalesce(p_consent, false) is not true then raise exception 'Consenso richiesto'; end if;

  select request.profile_photo_url into identity_reference
  from public.profile_verification_requests request
  where request.user_id = actor_id
    and request.status = 'verified'
    and (request.expires_at is null or request.expires_at > now());

  if identity_reference is null then
    raise exception 'Prima completa la verifica del profilo';
  end if;
  if position(actor_id::text || '/' in normalized_path) <> 1 then
    raise exception 'Percorso foto candidato non valido';
  end if;
  if normalized_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Formato foto non supportato';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'profile-photo-candidates'
      and object.name = normalized_path
  ) then raise exception 'Foto candidato non trovata'; end if;

  if exists (
    select 1 from public.profile_photo_change_requests request
    where request.user_id = actor_id and request.status = 'pending'
  ) then raise exception 'Hai gia una foto profilo in revisione'; end if;

  insert into public.profile_photo_change_requests (
    user_id,
    identity_reference,
    candidate_path,
    candidate_mime_type,
    status,
    review_method,
    consent_at,
    submitted_at
  ) values (
    actor_id,
    identity_reference,
    normalized_path,
    normalized_mime,
    'pending',
    'manual',
    now(),
    now()
  );

  return public.get_my_profile_photo_change();
end;
$$;

create or replace function public.list_profile_photo_changes(
  filter_status text default 'pending'
)
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  current_avatar_url text,
  identity_reference text,
  candidate_path text,
  candidate_mime_type text,
  status text,
  review_method text,
  match_score numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_filter text := lower(trim(coalesce(filter_status, 'pending')));
begin
  if not public.profile_verification_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  if normalized_filter not in ('pending', 'reviewed', 'all') then raise exception 'Filtro non valido'; end if;

  return query
  select
    request.id,
    request.user_id,
    coalesce(nullif(trim(profile.display_name), ''), 'Utente Motrice'),
    coalesce(profile.avatar_url, ''),
    request.identity_reference,
    request.candidate_path,
    request.candidate_mime_type,
    request.status,
    request.review_method,
    request.match_score,
    request.submitted_at,
    request.reviewed_at,
    request.rejection_reason
  from public.profile_photo_change_requests request
  join public.profiles profile on profile.id = request.user_id
  where
    normalized_filter = 'all'
    or (normalized_filter = 'pending' and request.status = 'pending')
    or (normalized_filter = 'reviewed' and request.status in ('approved', 'rejected'))
  order by
    case when request.status = 'pending' then 0 else 1 end,
    coalesce(request.reviewed_at, request.submitted_at) desc;
end;
$$;

create or replace function public.review_profile_photo_change(
  p_request_id uuid,
  p_decision text,
  p_avatar_path text default '',
  p_avatar_url text default '',
  p_reason text default '',
  p_match_score numeric default null,
  p_review_method text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.profile_photo_change_requests%rowtype;
  normalized_decision text := lower(trim(coalesce(p_decision, '')));
  normalized_method text := lower(trim(coalesce(p_review_method, 'manual')));
  normalized_avatar_path text := trim(coalesce(p_avatar_path, ''));
  normalized_avatar_url text := trim(coalesce(p_avatar_url, ''));
begin
  if not public.profile_verification_is_admin() then raise exception 'Accesso admin richiesto'; end if;
  if normalized_decision not in ('approved', 'rejected') then raise exception 'Esito non valido'; end if;
  if normalized_method not in ('manual', 'provider') then raise exception 'Metodo revisione non valido'; end if;
  if p_match_score is not null and (p_match_score < 0 or p_match_score > 1) then
    raise exception 'Punteggio confronto non valido';
  end if;

  select * into request_row
  from public.profile_photo_change_requests request
  where request.id = p_request_id
  for update;
  if not found then raise exception 'Richiesta non trovata'; end if;
  if request_row.status <> 'pending' then raise exception 'Richiesta gia revisionata'; end if;

  if normalized_decision = 'approved' then
    if position(request_row.user_id::text || '/' in normalized_avatar_path) <> 1 then
      raise exception 'Percorso avatar approvato non valido';
    end if;
    if not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'profile-avatars'
        and object.name = normalized_avatar_path
    ) then raise exception 'Avatar approvato non trovato'; end if;
    if position('/storage/v1/object/public/profile-avatars/' in normalized_avatar_url) = 0 then
      raise exception 'URL avatar approvato non valido';
    end if;

    update public.profiles
    set avatar_url = normalized_avatar_url, updated_at = now()
    where id = request_row.user_id;
  elsif char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Inserisci una motivazione chiara';
  end if;

  update public.profile_photo_change_requests
  set
    status = normalized_decision,
    reviewed_at = now(),
    reviewed_by = actor_id,
    review_method = normalized_method,
    match_score = p_match_score,
    rejection_reason = case when normalized_decision = 'rejected' then left(trim(p_reason), 500) else '' end,
    approved_avatar_url = case when normalized_decision = 'approved' then normalized_avatar_url else '' end,
    updated_at = now()
  where id = request_row.id;

  return jsonb_build_object(
    'request_id', request_row.id,
    'user_id', request_row.user_id,
    'status', normalized_decision,
    'avatar_url', case when normalized_decision = 'approved' then normalized_avatar_url else '' end
  );
end;
$$;

-- Un utente autenticato non puo aggirare la revisione scrivendo direttamente
-- profiles.avatar_url. Gli aggiornamenti eseguiti da admin/service role e la
-- funzione di approvazione restano consentiti.
create or replace function public.guard_profile_avatar_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.avatar_url is distinct from old.avatar_url
    and auth.uid() = new.id
    and not public.profile_verification_is_admin() then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILE_PHOTO_REVIEW_REQUIRED: la nuova foto deve essere approvata';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_avatar_change_on_profiles on public.profiles;
create trigger guard_profile_avatar_change_on_profiles
before update of avatar_url on public.profiles
for each row execute function public.guard_profile_avatar_change();

revoke all on function public.get_my_profile_photo_change() from public, anon;
revoke all on function public.submit_profile_photo_change(text, text, boolean) from public, anon;
revoke all on function public.list_profile_photo_changes(text) from public, anon, authenticated;
revoke all on function public.review_profile_photo_change(uuid, text, text, text, text, numeric, text) from public, anon, authenticated;

grant execute on function public.get_my_profile_photo_change() to authenticated;
grant execute on function public.submit_profile_photo_change(text, text, boolean) to authenticated;
grant execute on function public.list_profile_photo_changes(text) to authenticated, service_role;
grant execute on function public.review_profile_photo_change(uuid, text, text, text, text, numeric, text) to authenticated, service_role;

commit;
