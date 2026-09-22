begin;

-- La quota di creazione non puo essere affidata al solo localStorage del
-- dispositivo. Questa tabella e la fonte server per eventuali eccezioni al
-- piano Free; in assenza di una riga l'utente resta Free (3 eventi/mese).
create table if not exists public.user_event_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'free_only', 'premium')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  current_period_end timestamptz,
  max_events_per_month integer check (max_events_per_month is null or max_events_per_month >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_event_entitlements enable row level security;

drop policy if exists user_event_entitlements_read_own on public.user_event_entitlements;
create policy user_event_entitlements_read_own
on public.user_event_entitlements for select
to authenticated
using (user_id = auth.uid());

revoke insert, update, delete on public.user_event_entitlements from anon, authenticated;
grant select on public.user_event_entitlements to authenticated;

create or replace function public.resolve_event_creation_limit(target_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  entitlement public.user_event_entitlements%rowtype;
begin
  select * into entitlement
  from public.user_event_entitlements
  where user_id = target_user_id;

  if entitlement.user_id is null
    or entitlement.status <> 'active'
    or (entitlement.current_period_end is not null and entitlement.current_period_end <= now()) then
    return 3;
  end if;

  if entitlement.max_events_per_month is not null then
    return entitlement.max_events_per_month;
  end if;

  if entitlement.plan = 'premium' then
    return null;
  end if;

  return 3;
end;
$$;

create or replace function public.enforce_event_creation_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  creation_limit integer;
  creations integer;
  month_start timestamptz := date_trunc('month', now());
  next_month timestamptz := date_trunc('month', now()) + interval '1 month';
begin
  -- Import e operazioni service-role non hanno un utente JWT e vengono
  -- lasciati alla responsabilita del backend amministrativo.
  if actor_id is null then
    return new;
  end if;

  if new.creator_id is distinct from actor_id then
    raise exception 'Non puoi creare eventi per un altro utente' using errcode = '42501';
  end if;

  creation_limit := public.resolve_event_creation_limit(actor_id);
  if creation_limit is null then
    return new;
  end if;

  -- Blocca inserimenti concorrenti dello stesso utente: due richieste nello
  -- stesso istante non possono entrambe superare il limite.
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  select count(*)::integer into creations
  from public.events
  where creator_id = actor_id
    and created_at >= month_start
    and created_at < next_month;

  if creations >= creation_limit then
    raise exception 'Piano Free: massimo % eventi al mese', creation_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists events_00_enforce_creation_quota on public.events;
create trigger events_00_enforce_creation_quota
before insert on public.events
for each row execute function public.enforce_event_creation_quota();

create or replace function public.get_my_event_creation_quota()
returns table (
  month text,
  created_this_month integer,
  max_events_per_month integer,
  is_unlimited boolean,
  plan text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  creation_limit integer;
  current_plan text := 'free';
  month_start timestamptz := date_trunc('month', now());
begin
  if actor_id is null then
    raise exception 'Autenticazione richiesta' using errcode = '42501';
  end if;

  creation_limit := public.resolve_event_creation_limit(actor_id);

  select entitlement.plan into current_plan
  from public.user_event_entitlements entitlement
  where entitlement.user_id = actor_id
    and entitlement.status = 'active'
    and (entitlement.current_period_end is null or entitlement.current_period_end > now());

  return query
  select
    to_char(month_start, 'YYYY-MM'),
    count(event.id)::integer,
    creation_limit,
    creation_limit is null,
    coalesce(current_plan, 'free')
  from public.events event
  where event.creator_id = actor_id
    and event.created_at >= month_start
    and event.created_at < month_start + interval '1 month';
end;
$$;

revoke all on function public.resolve_event_creation_limit(uuid) from public, anon, authenticated;
revoke all on function public.enforce_event_creation_quota() from public, anon, authenticated;
revoke all on function public.get_my_event_creation_quota() from public, anon;
grant execute on function public.get_my_event_creation_quota() to authenticated;

comment on table public.user_event_entitlements is
  'Fonte server per i limiti mensili di creazione eventi. Assenza riga = piano Free.';

commit;
