begin;

-- La foto acquisita nel flusso di verifica e un documento privato di
-- moderazione: non deve diventare l'avatar pubblico dell'utente. Il nome del
-- parametro e della colonna resta invariato per compatibilita con le versioni
-- beta gia installate; per le nuove richieste contiene un percorso nel bucket
-- privato profile-verification-private.
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
  identity_reference text := trim(coalesce(p_profile_photo_url, ''));
  identity_is_private boolean := false;
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
    select 1
    from storage.objects object
    where object.bucket_id = 'profile-verification-private'
      and object.name = trim(p_challenge_photo_path)
  ) then raise exception 'Foto challenge non trovata'; end if;

  select exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'profile-verification-private'
      and object.name = identity_reference
      and split_part(object.name, '/', 1) = actor_id::text
  ) into identity_is_private;

  -- Accetta i riferimenti pubblici prodotti dalle beta precedenti, senza piu
  -- copiarli nel profilo. Le nuove versioni salvano solo il percorso privato.
  if not identity_is_private
    and position('/profile-avatars/' || actor_id::text || '/' in identity_reference) = 0 then
    raise exception 'Foto di verifica non valida';
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
    identity_reference,
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
    level = normalized_level,
    updated_at = now()
  where id = actor_id;

  return public.get_my_profile_verification();
end;
$$;

revoke all on function public.submit_profile_verification(text, text, date, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.submit_profile_verification(text, text, date, text, text, text, text, text, text, text)
  to authenticated;

commit;
