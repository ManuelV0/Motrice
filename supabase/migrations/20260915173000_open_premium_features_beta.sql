begin;

-- During the internal beta every user can create events without the Premium
-- monthly quota. A future migration can restore the plan-based resolver while
-- preserving the entitlement table and all existing subscription data.
create or replace function public.resolve_event_creation_limit(target_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return null;
end;
$$;

comment on function public.resolve_event_creation_limit(uuid) is
  'Beta aperta: nessun limite mensile di creazione eventi. Il parametro resta disponibile per la futura riattivazione dei piani.';

commit;
