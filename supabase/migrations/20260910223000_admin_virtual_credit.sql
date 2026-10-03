begin;

-- La beta assegna un saldo iniziale di 30 EUR virtuali. Gli utenti non possono
-- ricaricarsi da soli: ogni aumento successivo passa dal centro amministrativo.
alter table public.money_accounts
  alter column available_cents set default 3000;

update public.money_system_settings
set deposits_enabled = false,
    withdrawals_enabled = false,
    updated_at = now()
where singleton and provider_mode = 'virtual_beta';

-- Crea il wallet anche per i profili che non lo hanno ancora aperto. Il CTE
-- seguente porta una sola volta il valore complessivo almeno a 30 EUR, senza
-- cancellare somme già disponibili, vincolate o maturate.
insert into public.money_accounts (user_id, available_cents)
select profile.id, 0
from public.profiles profile
on conflict (user_id) do nothing;

with opening_candidates as (
  select
    account.user_id,
    greatest(
      0::bigint,
      3000::bigint - account.available_cents - account.locked_cents
        - account.pending_cents - account.withdrawable_cents
    ) as opening_delta
  from public.money_accounts account
  where not exists (
    select 1
    from public.money_ledger ledger
    where ledger.idempotency_key = 'virtual-opening-credit:v1:' || account.user_id::text
  )
), logged_opening as (
  insert into public.money_ledger (
    user_id,
    entry_type,
    available_delta,
    idempotency_key,
    metadata
  )
  select
    candidate.user_id,
    'virtual_opening_credit',
    candidate.opening_delta,
    'virtual-opening-credit:v1:' || candidate.user_id::text,
    jsonb_build_object(
      'provider_mode', 'virtual_beta',
      'real_charge', false,
      'opening_balance_cents', 3000,
      'label', 'Credito iniziale beta'
    )
  from opening_candidates candidate
  where candidate.opening_delta > 0
  on conflict (idempotency_key) do nothing
  returning user_id, available_delta
)
update public.money_accounts account
set available_cents = account.available_cents + opening.available_delta,
    version = account.version + 1,
    updated_at = now()
from logged_opening opening
where account.user_id = opening.user_id;

create or replace function public.ensure_money_account(target_user_id uuid)
returns public.money_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.money_accounts%rowtype;
  account_created boolean := false;
begin
  if target_user_id is null then raise exception 'Utente non valido'; end if;

  insert into public.money_accounts (user_id, available_cents)
  values (target_user_id, 3000)
  on conflict (user_id) do nothing
  returning * into account;

  account_created := found;

  if account_created then
    insert into public.money_ledger (
      user_id,
      entry_type,
      available_delta,
      idempotency_key,
      metadata
    ) values (
      target_user_id,
      'virtual_opening_credit',
      3000,
      'virtual-opening-credit:v1:' || target_user_id::text,
      jsonb_build_object(
        'provider_mode', 'virtual_beta',
        'real_charge', false,
        'opening_balance_cents', 3000,
        'label', 'Credito iniziale beta'
      )
    ) on conflict (idempotency_key) do nothing;
  end if;

  select * into account
  from public.money_accounts
  where user_id = target_user_id
  for update;

  return account;
end;
$$;

create or replace function public.admin_increase_virtual_wallet_credit(
  target_user_id uuid,
  amount_cents bigint,
  client_request_id text,
  operation_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_key text := trim(coalesce(client_request_id, ''));
  reason_text text := trim(coalesce(operation_reason, ''));
  credit_delta bigint := amount_cents;
  ledger_key text;
  before_account public.money_accounts%rowtype;
  after_account public.money_accounts%rowtype;
  already_processed boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere' using errcode = '42501'; end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Accesso amministratore richiesto' using errcode = '42501';
  end if;
  if target_user_id is null or not exists (
    select 1 from public.profiles profile where profile.id = target_user_id
  ) then
    raise exception 'Utente non valido';
  end if;
  if credit_delta < 100 or credit_delta > 100000 then
    raise exception 'Importo consentito: da 1 EUR a 1.000 EUR';
  end if;
  if char_length(request_key) < 8 or char_length(request_key) > 120 then
    raise exception 'Identificativo richiesta non valido';
  end if;
  if char_length(reason_text) < 5 or char_length(reason_text) > 500 then
    raise exception 'Motivazione non valida';
  end if;
  if not exists (
    select 1
    from public.money_system_settings settings
    where settings.singleton and settings.provider_mode = 'virtual_beta'
  ) then
    raise exception 'Il credito virtuale beta non è attivo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 91002));
  before_account := public.ensure_money_account(target_user_id);
  ledger_key := 'admin-virtual-credit:' || actor_id::text || ':' || target_user_id::text || ':' || request_key;

  select exists (
    select 1 from public.money_ledger ledger where ledger.idempotency_key = ledger_key
  ) into already_processed;

  if already_processed then
    select * into after_account from public.money_accounts where user_id = target_user_id;
    return jsonb_build_object(
      'user_id', target_user_id,
      'credited_cents', 0,
      'already_processed', true,
      'available_cents', after_account.available_cents,
      'locked_cents', after_account.locked_cents,
      'pending_cents', after_account.pending_cents,
      'withdrawable_cents', after_account.withdrawable_cents
    );
  end if;

  if before_account.account_status <> 'active' then
    raise exception 'Wallet utente non disponibile';
  end if;

  update public.money_accounts
  set available_cents = available_cents + credit_delta,
      version = version + 1,
      updated_at = now()
  where user_id = target_user_id
  returning * into after_account;

  insert into public.money_ledger (
    user_id,
    entry_type,
    available_delta,
    idempotency_key,
    metadata
  ) values (
    target_user_id,
    'admin_virtual_credit_added',
    credit_delta,
    ledger_key,
    jsonb_build_object(
      'actor_id', actor_id,
      'provider_mode', 'virtual_beta',
      'real_charge', false,
      'reason', reason_text
    )
  );

  insert into public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    actor_id,
    'virtual_credit_increased',
    'money_account',
    target_user_id::text,
    reason_text,
    jsonb_build_object('available_cents', before_account.available_cents),
    jsonb_build_object('available_cents', after_account.available_cents),
    jsonb_build_object('credited_cents', credit_delta, 'real_charge', false)
  );

  return jsonb_build_object(
    'user_id', target_user_id,
    'credited_cents', credit_delta,
    'already_processed', false,
    'available_cents', after_account.available_cents,
    'locked_cents', after_account.locked_cents,
    'pending_cents', after_account.pending_cents,
    'withdrawable_cents', after_account.withdrawable_cents
  );
end;
$$;

comment on function public.admin_increase_virtual_wallet_credit(uuid, bigint, text, text) is
  'Increases a beta virtual wallet balance. Admin-only, idempotent and audit logged.';

-- Chiude definitivamente il precedente percorso di autoricarica utente.
revoke all on function public.add_virtual_wallet_credit(text) from public, anon, authenticated;
revoke all on function public.admin_increase_virtual_wallet_credit(uuid, bigint, text, text)
  from public, anon;
grant execute on function public.admin_increase_virtual_wallet_credit(uuid, bigint, text, text)
  to authenticated, service_role;

commit;
