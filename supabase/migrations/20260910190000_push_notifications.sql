begin;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios', 'web')),
  device_label text not null default '' check (char_length(device_label) <= 180),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_error text not null default '' check (char_length(last_error) <= 500),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_user_active_idx
  on public.push_devices(user_id, active, last_seen_at desc);

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant select on public.push_devices to authenticated;

drop policy if exists push_devices_read_own on public.push_devices;
create policy push_devices_read_own
on public.push_devices for select to authenticated
using (user_id = auth.uid());

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  event_security boolean not null default true check (event_security),
  chat_social boolean not null default true,
  wallet_account boolean not null default true,
  promotions boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_read_own on public.notification_preferences;
create policy notification_preferences_read_own
on public.notification_preferences for select to authenticated
using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
on public.notification_preferences for insert to authenticated
with check (user_id = auth.uid() and event_security);

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
on public.notification_preferences for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and event_security);

create or replace function public.register_push_device(
  token_value text,
  platform_value text,
  device_label_value text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_token text := btrim(coalesce(token_value, ''));
  normalized_platform text := lower(btrim(coalesce(platform_value, 'android')));
  device_row public.push_devices%rowtype;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if char_length(normalized_token) < 20 then raise exception 'Token notifiche non valido'; end if;
  if normalized_platform not in ('android', 'ios', 'web') then raise exception 'Piattaforma non valida'; end if;

  insert into public.push_devices (
    user_id, token, platform, device_label, active, last_seen_at, last_error, disabled_at, updated_at
  ) values (
    actor_id,
    normalized_token,
    normalized_platform,
    left(btrim(coalesce(device_label_value, '')), 180),
    true,
    now(),
    '',
    null,
    now()
  )
  on conflict (token) do update
  set user_id = actor_id,
      platform = excluded.platform,
      device_label = excluded.device_label,
      active = true,
      last_seen_at = now(),
      last_error = '',
      disabled_at = null,
      updated_at = now()
  returning * into device_row;

  insert into public.notification_preferences (user_id)
  values (actor_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'id', device_row.id,
    'platform', device_row.platform,
    'active', device_row.active,
    'registered_at', device_row.last_seen_at
  );
end;
$$;

create or replace function public.unregister_push_device(token_value text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  affected integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  update public.push_devices
  set active = false, disabled_at = now(), updated_at = now()
  where user_id = actor_id and token = btrim(coalesce(token_value, ''));
  get diagnostics affected = row_count;
  return jsonb_build_object('success', true, 'disabled', affected);
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;

create or replace function public.notify_workout_session_milestones()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.mot_sixty_awarded and not old.mot_sixty_awarded then
    insert into public.notifications (user_id, event_id, type, title, body, payload)
    values (
      new.user_id,
      new.event_id,
      'event_workout_milestone',
      '60% dell’attività raggiunto',
      'Continua così: hai ottenuto +3 MOT.',
      jsonb_build_object('progress_percent', 60, 'mot_awarded', 3, 'action_path', '/events/' || new.event_id::text || '/activity')
    );
  end if;

  if new.completed_at is not null and old.completed_at is null then
    insert into public.notifications (user_id, event_id, type, title, body, payload)
    values (
      new.user_id,
      new.event_id,
      'event_workout_completed',
      'Attività completata',
      case when new.role_key = 'participant' then 'Allenamento concluso: +25 XP.' else 'Allenamento concluso correttamente.' end,
      jsonb_build_object(
        'progress_percent', 100,
        'xp_awarded', case when new.role_key = 'participant' then 25 else 0 end,
        'action_path', '/events/' || new.event_id::text
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists event_workout_session_push_notifications on public.event_workout_sessions;
create trigger event_workout_session_push_notifications
after update on public.event_workout_sessions
for each row execute function public.notify_workout_session_milestones();

create or replace function public.notify_money_ledger_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_type text;
  notification_title text;
  notification_body text;
  amount_value bigint := greatest(
    abs(new.available_delta),
    abs(new.locked_delta),
    abs(new.pending_delta),
    abs(new.withdrawable_delta)
  );
begin
  case new.entry_type
    when 'event_deposit_locked' then
      notification_type := 'wallet_deposit_locked';
      notification_title := 'Deposito evento bloccato';
      notification_body := 'La quota è al sicuro fino alla conclusione dell’evento.';
    when 'stake_return_released' then
      notification_type := 'wallet_deposit_returned';
      notification_title := 'Deposito restituito';
      notification_body := 'La quota è nuovamente disponibile nel wallet.';
    when 'deposit_released' then
      notification_type := 'wallet_deposit_returned';
      notification_title := 'Deposito restituito';
      notification_body := 'La quota è nuovamente disponibile nel wallet.';
    when 'no_show_share_released' then
      notification_type := 'wallet_no_show_bonus';
      notification_title := 'Bonus no-show ricevuto';
      notification_body := 'La quota redistribuita è disponibile nel wallet.';
    when 'stripe_deposit_succeeded' then
      notification_type := 'wallet_topup_completed';
      notification_title := 'Ricarica completata';
      notification_body := 'Il credito è disponibile nel wallet Motrice.';
    when 'withdrawal_requested' then
      notification_type := 'wallet_withdrawal_requested';
      notification_title := 'Prelievo richiesto';
      notification_body := 'La richiesta di prelievo è in elaborazione.';
    when 'withdrawal_paid' then
      notification_type := 'wallet_withdrawal_paid';
      notification_title := 'Prelievo completato';
      notification_body := 'Il trasferimento è stato completato.';
    when 'withdrawal_failed_restored' then
      notification_type := 'wallet_withdrawal_failed';
      notification_title := 'Prelievo non riuscito';
      notification_body := 'La somma è stata ripristinata nel wallet.';
    else
      return new;
  end case;

  insert into public.notifications (user_id, event_id, type, title, body, payload)
  values (
    new.user_id,
    new.event_id,
    notification_type,
    notification_title,
    notification_body,
    jsonb_build_object(
      'amount_cents', amount_value,
      'ledger_entry_id', new.id,
      'action_path', '/wallet/credit'
    )
  );
  return new;
end;
$$;

drop trigger if exists money_ledger_push_notifications on public.money_ledger;
create trigger money_ledger_push_notifications
after insert on public.money_ledger
for each row execute function public.notify_money_ledger_change();

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

drop trigger if exists profile_verification_push_notifications on public.profile_verification_requests;
create trigger profile_verification_push_notifications
after insert or update on public.profile_verification_requests
for each row execute function public.notify_profile_verification_change();

commit;
