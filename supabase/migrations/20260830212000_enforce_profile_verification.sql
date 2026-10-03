begin;

-- La procedura di verifica e il pannello amministratore sono ora disponibili
-- nella beta. Da questo momento le azioni sensibili richiedono un profilo
-- verificato anche lato database, non soltanto nell'interfaccia.
insert into public.profile_verification_settings (
  singleton,
  enforcement_enabled,
  updated_at,
  updated_by
) values (
  true,
  true,
  now(),
  null
)
on conflict (singleton) do update set
  enforcement_enabled = true,
  updated_at = excluded.updated_at;

-- Anche gli amministratori devono verificare il proprio profilo prima di
-- creare o partecipare a eventi. Il ruolo admin resta valido esclusivamente
-- per revisionare le richieste tramite le RPC dedicate.
create or replace function public.require_verified_profile_for_event_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user uuid;
begin
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

commit;
