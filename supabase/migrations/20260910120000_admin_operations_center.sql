begin;

-- Registro pronto per le future azioni operative. La prima versione del centro
-- amministrativo resta intenzionalmente in sola lettura.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  target_type text not null check (char_length(target_type) between 3 and 60),
  target_id text not null check (char_length(target_id) between 1 and 180),
  reason text not null check (char_length(reason) between 5 and 500),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_type, target_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_read_admin on public.admin_audit_logs;
create policy admin_audit_logs_read_admin
on public.admin_audit_logs for select
to authenticated
using (public.profile_verification_is_admin());

revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

create or replace function public.get_admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.profile_verification_is_admin() then
    raise exception 'Accesso admin richiesto' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'source', 'admin_rpc',
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'users_total', (select count(*) from public.profiles),
      'users_verified', (
        select count(*) from public.profile_verification_requests request
        where request.status = 'verified'
      ),
      'verification_pending', (
        select count(*) from public.profile_verification_requests request
        where request.status = 'pending'
      ),
      'events_total', (select count(*) from public.events),
      'events_today', (
        select count(*) from public.events event
        where event.starts_at >= date_trunc('day', now())
          and event.starts_at < date_trunc('day', now()) + interval '1 day'
          and event.status <> 'cancelled'
      ),
      'events_active', (
        select count(*) from public.events event
        where event.status <> 'cancelled'
          and coalesce(event.lifecycle_state, 'published') in ('checkin_open', 'active')
      ),
      'events_attention', (
        select count(*) from public.events event
        where event.status = 'scheduled'
          and coalesce(event.lifecycle_state, 'published') not in ('completed', 'cancelled', 'archived')
          and coalesce(
            event.ends_at,
            event.starts_at + make_interval(mins => event.duration_minutes::integer)
          ) < now()
      )
    ),
    'verification', jsonb_build_object(
      'pending', (select count(*) from public.profile_verification_requests where status = 'pending'),
      'verified', (select count(*) from public.profile_verification_requests where status = 'verified'),
      'suspended', (select count(*) from public.profile_verification_requests where status = 'suspended'),
      'rejected', (select count(*) from public.profile_verification_requests where status = 'rejected')
    ),
    'wallet', jsonb_build_object(
      'available_cents', coalesce((select sum(available_cents) from public.money_accounts), 0),
      'locked_cents', coalesce((select sum(locked_cents) from public.money_accounts), 0),
      'pending_cents', coalesce((select sum(pending_cents) from public.money_accounts), 0),
      'withdrawable_cents', coalesce((select sum(withdrawable_cents) from public.money_accounts), 0),
      'active_holds', (
        select count(*) from public.event_money_holds hold
        where hold.status in ('trial', 'locked', 'pending_return')
      ),
      'active_holds_cents', coalesce((
        select sum(hold.amount_cents) from public.event_money_holds hold
        where hold.status in ('locked', 'pending_return')
      ), 0)
    ),
    'users', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select
          profile.id,
          profile.display_name,
          auth_user.email,
          profile.city,
          profile.avatar_url,
          profile.reliability_score,
          coalesce(request.status, 'unverified') as verification_status,
          coalesce(account.account_status, 'active') as account_status,
          coalesce(account.available_cents + account.withdrawable_cents, 0) as balance_cents,
          count(distinct event.id)::integer as events_created,
          profile.created_at
        from public.profiles profile
        left join auth.users auth_user on auth_user.id = profile.id
        left join public.profile_verification_requests request on request.user_id = profile.id
        left join public.money_accounts account on account.user_id = profile.id
        left join public.events event on event.creator_id = profile.id
        group by profile.id, auth_user.email, request.status, account.account_status,
          account.available_cents, account.withdrawable_cents
        order by profile.created_at desc
        limit 100
      ) item
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.starts_at desc)
      from (
        select
          event.id,
          event.creator_id,
          event.title,
          sport.name as sport_name,
          event.city,
          event.location_name,
          event.starts_at,
          event.duration_minutes,
          event.status,
          case
            when event.status = 'cancelled' then 'cancelled'
            when coalesce(event.lifecycle_state, 'published') in ('completed', 'archived') then 'completed'
            when event.status = 'scheduled'
              and coalesce(event.lifecycle_state, 'published') not in ('completed', 'cancelled', 'archived')
              and coalesce(event.ends_at, event.starts_at + make_interval(mins => event.duration_minutes::integer)) < now()
              then 'attention'
            else coalesce(event.lifecycle_state, 'published')
          end as lifecycle_state,
          creator.display_name as creator_name,
          count(participant.user_id) filter (where participant.status <> 'cancelled')::integer as participants_count,
          count(participant.user_id) filter (where participant.checked_in_at is not null)::integer as checked_in_count,
          count(participant.user_id) filter (where participant.status = 'no_show' or participant.lifecycle_state = 'no_show')::integer as no_show_count,
          event.max_participants
        from public.events event
        join public.sports sport on sport.id = event.sport_id
        join public.profiles creator on creator.id = event.creator_id
        left join public.event_participants participant on participant.event_id = event.id
        group by event.id, sport.name, creator.display_name
        order by event.starts_at desc
        limit 120
      ) item
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select
          ledger.id,
          ledger.user_id,
          profile.display_name,
          ledger.event_id,
          ledger.entry_type,
          ledger.available_delta,
          ledger.locked_delta,
          ledger.pending_delta,
          ledger.withdrawable_delta,
          ledger.created_at
        from public.money_ledger ledger
        join public.profiles profile on profile.id = ledger.user_id
        order by ledger.created_at desc
        limit 40
      ) item
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select audit.id, audit.actor_id, actor.display_name as actor_name,
          audit.action, audit.target_type, audit.target_id, audit.reason, audit.created_at
        from public.admin_audit_logs audit
        left join public.profiles actor on actor.id = audit.actor_id
        order by audit.created_at desc
        limit 30
      ) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_operations_snapshot() from public, anon;
grant execute on function public.get_admin_operations_snapshot() to authenticated, service_role;

commit;
