begin;

create or replace function public.revoke_profile_verification(
  target_user_id uuid,
  reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.profile_verification_requests%rowtype;
  normalized_reason text := left(trim(coalesce(reason, '')), 500);
begin
  if not public.profile_verification_is_admin() then
    raise exception 'Accesso admin richiesto';
  end if;
  if char_length(normalized_reason) < 5 then
    raise exception 'Inserisci una motivazione chiara';
  end if;

  select * into request_row
  from public.profile_verification_requests request
  where request.user_id = target_user_id
  for update;

  if not found then
    raise exception 'Richiesta non trovata';
  end if;
  if request_row.status <> 'verified' then
    raise exception 'Solo un profilo verificato può essere riportato a non verificato';
  end if;

  update public.profile_verification_requests
  set
    status = 'unverified',
    reviewed_at = now(),
    reviewed_by = actor_id,
    rejection_reason = normalized_reason,
    verified_at = null,
    expires_at = null,
    challenge_delete_after = now() + interval '30 days',
    updated_at = now()
  where user_id = target_user_id;

  return public.get_profile_verification_status(target_user_id);
end;
$$;

revoke all on function public.revoke_profile_verification(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_profile_verification(uuid, text) to authenticated, service_role;

create or replace function public.notify_profile_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if tg_op = 'INSERT' then
    notification_type := 'profile_verification_submitted';
    notification_title := 'Verifica ricevuta';
    notification_body := 'La richiesta è stata inviata al centro verifiche.';
  elsif new.status is not distinct from old.status then
    return new;
  else
    case new.status
      when 'verified' then
        notification_type := 'profile_verified';
        notification_title := 'Profilo verificato';
        notification_body := 'Ora puoi creare e partecipare agli eventi Motrice.';
      when 'rejected' then
        notification_type := 'profile_verification_rejected';
        notification_title := 'Verifica da ripetere';
        notification_body := coalesce(nullif(new.rejection_reason, ''), 'Controlla i dati e invia nuovamente la verifica.');
      when 'suspended' then
        notification_type := 'profile_suspended';
        notification_title := 'Profilo sospeso';
        notification_body := 'Apri il centro verifiche per consultare le indicazioni.';
      when 'unverified' then
        notification_type := 'profile_verification_revoked';
        notification_title := 'Verifica profilo annullata';
        notification_body := coalesce(nullif(new.rejection_reason, ''), 'Ripeti la verifica del profilo per usare le funzioni protette.');
      else
        return new;
    end case;
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, payload)
  values (
    new.user_id,
    new.reviewed_by,
    notification_type,
    notification_title,
    notification_body,
    jsonb_build_object('status', new.status, 'action_path', '/verify-profile')
  );
  return new;
end;
$$;

commit;
