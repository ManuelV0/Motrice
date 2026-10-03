begin;

-- Durante la beta la verifica assegna un segnale di fiducia, ma non blocca
-- creazione eventi, partecipazione, chat o check-in. Una sospensione esplicita
-- del Centro operativo continua invece a impedire le azioni sensibili.
insert into public.profile_verification_settings (
  singleton,
  enforcement_enabled,
  updated_at,
  updated_by
) values (
  true,
  false,
  now(),
  null
)
on conflict (singleton) do update set
  enforcement_enabled = false,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;

create or replace function public.can_access_verified_actions(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    not exists (
      select 1
      from public.profile_verification_requests suspended_request
      where suspended_request.user_id = target_user_id
        and suspended_request.status = 'suspended'
    )
    and (
      not coalesce((
        select settings.enforcement_enabled
        from public.profile_verification_settings settings
        where settings.singleton = true
      ), false)
      or exists (
        select 1
        from public.profile_verification_requests verified_request
        where verified_request.user_id = target_user_id
          and verified_request.status = 'verified'
          and (verified_request.expires_at is null or verified_request.expires_at > now())
      )
    );
$$;

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
    'can_use_verified_actions', effective_status <> 'suspended'
      and (not enforcement_enabled or effective_status = 'verified')
  );
end;
$$;

commit;
