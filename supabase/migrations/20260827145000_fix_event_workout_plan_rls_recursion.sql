begin;

create or replace function public.owns_personal_workout_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    target_plan_id is null
    or exists (
      select 1
      from public.personal_workout_plans plan
      where plan.id = target_plan_id
        and plan.user_id = auth.uid()
    );
$$;

create or replace function public.is_event_workout_plan_attachment(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.events event
    where event.scheda_id = target_plan_id
  );
$$;

revoke all on function public.owns_personal_workout_plan(uuid) from public;
revoke all on function public.is_event_workout_plan_attachment(uuid) from public;
grant execute on function public.owns_personal_workout_plan(uuid) to authenticated;
grant execute on function public.is_event_workout_plan_attachment(uuid) to authenticated;

drop policy if exists personal_workout_plans_select_event_attachment on public.personal_workout_plans;
create policy personal_workout_plans_select_event_attachment
on public.personal_workout_plans
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_event_workout_plan_attachment(id)
);

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
on public.events for insert
to authenticated
with check (
  auth.uid() = creator_id
  and public.owns_personal_workout_plan(scheda_id)
);

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
on public.events for update
to authenticated
using (auth.uid() = creator_id)
with check (
  auth.uid() = creator_id
  and public.owns_personal_workout_plan(scheda_id)
);

comment on function public.owns_personal_workout_plan(uuid) is
  'Verifica senza ricorsione RLS che la scheda allegata appartenga all utente autenticato.';

comment on function public.is_event_workout_plan_attachment(uuid) is
  'Verifica senza ricorsione RLS se una scheda e allegata a un evento.';

commit;
