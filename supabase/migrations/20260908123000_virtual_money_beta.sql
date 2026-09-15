begin;

-- Beta economy: all balances are ledger-backed test credits. No card charge or
-- payout can be created while this provider mode is active.
alter table public.money_system_settings
  drop constraint if exists money_system_settings_provider_mode_check;

alter table public.money_system_settings
  add constraint money_system_settings_provider_mode_check
  check (provider_mode in ('virtual_beta', 'stripe_test', 'stripe_live_disabled'));

update public.money_system_settings
set provider_mode = 'virtual_beta',
    deposits_enabled = true,
    withdrawals_enabled = false,
    updated_at = now()
where singleton;

create or replace function public.add_virtual_wallet_credit(
  client_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  settings public.money_system_settings%rowtype;
  request_key text := trim(coalesce(client_request_id, ''));
  ledger_key text;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if char_length(request_key) < 8 or char_length(request_key) > 120 then
    raise exception 'Identificativo richiesta non valido';
  end if;

  select * into settings
  from public.money_system_settings
  where singleton;

  if settings.provider_mode <> 'virtual_beta' or not settings.deposits_enabled then
    raise exception 'Credito virtuale beta non attivo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
  perform public.ensure_money_account(actor_id);
  ledger_key := 'virtual-credit:' || actor_id::text || ':' || request_key;

  -- Same client request can be retried safely after network interruptions.
  if exists (
    select 1 from public.money_ledger where idempotency_key = ledger_key
  ) then
    return public.get_my_money_wallet();
  end if;

  update public.money_accounts
  set available_cents = available_cents + settings.deposit_cents,
      version = version + 1,
      updated_at = now()
  where user_id = actor_id and account_status = 'active';

  if not found then raise exception 'Wallet non disponibile'; end if;

  insert into public.money_ledger (
    user_id,
    entry_type,
    available_delta,
    idempotency_key,
    metadata
  ) values (
    actor_id,
    'virtual_credit_added',
    settings.deposit_cents,
    ledger_key,
    jsonb_build_object(
      'provider_mode', 'virtual_beta',
      'real_charge', false,
      'label', 'Credito virtuale beta'
    )
  );

  return public.get_my_money_wallet();
end;
$$;

comment on function public.add_virtual_wallet_credit(text) is
  'Adds the fixed 10 EUR-equivalent test credit in virtual_beta mode. No real payment is performed.';

revoke all on function public.add_virtual_wallet_credit(text) from public, anon;
grant execute on function public.add_virtual_wallet_credit(text) to authenticated;

commit;
