begin;

-- Account amministratore principale Motrice. La condizione sull'email evita
-- di assegnare il ruolo se l'UUID venisse riutilizzato in un altro ambiente.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
where id = '4d68a2d5-da3e-4275-9110-53a7be5b2b1a'::uuid
  and lower(email) = 'aletarqui@libero.it';

create or replace function public.get_profile_verification_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.profile_verification_is_admin();
$$;

create or replace function public.set_profile_verification_enforcement(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.profile_verification_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;

  insert into public.profile_verification_settings (
    singleton,
    enforcement_enabled,
    updated_at,
    updated_by
  ) values (
    true,
    coalesce(enabled, false),
    now(),
    auth.uid()
  )
  on conflict (singleton) do update set
    enforcement_enabled = excluded.enforcement_enabled,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  return coalesce(enabled, false);
end;
$$;

create or replace function public.list_profile_verifications(
  filter_status text default 'pending'
)
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  birth_date date,
  city text,
  primary_sport text,
  sport_level text,
  bio text,
  profile_photo_url text,
  challenge_photo_path text,
  challenge_type text,
  status text,
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
  if not public.profile_verification_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if normalized_filter not in ('pending', 'reviewed', 'all') then
    raise exception 'Filtro non valido';
  end if;

  return query
  select
    request.id,
    request.user_id,
    trim(request.first_name || ' ' || request.last_name),
    request.birth_date,
    request.city,
    request.primary_sport,
    request.sport_level,
    request.bio,
    request.profile_photo_url,
    request.challenge_photo_path,
    request.challenge_type,
    request.status,
    request.submitted_at,
    request.reviewed_at,
    request.rejection_reason
  from public.profile_verification_requests request
  where
    normalized_filter = 'all'
    or (normalized_filter = 'pending' and request.status = 'pending')
    or (normalized_filter = 'reviewed' and request.status <> 'pending')
  order by
    case when request.status = 'pending' then 0 else 1 end,
    coalesce(request.reviewed_at, request.submitted_at) desc;
end;
$$;

revoke all on function public.get_profile_verification_admin_access() from public, anon;
revoke all on function public.set_profile_verification_enforcement(boolean) from public, anon, authenticated;
revoke all on function public.list_profile_verifications(text) from public, anon, authenticated;

grant execute on function public.get_profile_verification_admin_access() to authenticated;
grant execute on function public.set_profile_verification_enforcement(boolean) to authenticated, service_role;
grant execute on function public.list_profile_verifications(text) to authenticated, service_role;

commit;
