begin;

alter table public.events
  add column if not exists scheda_id uuid
  references public.personal_workout_plans(id) on delete set null;

create index if not exists events_scheda_id_idx
  on public.events(scheda_id)
  where scheda_id is not null;

drop policy if exists personal_workout_plans_select_event_attachment on public.personal_workout_plans;
create policy personal_workout_plans_select_event_attachment
on public.personal_workout_plans
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.events event
    where event.scheda_id = personal_workout_plans.id
  )
);

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
on public.events for insert
to authenticated
with check (
  auth.uid() = creator_id
  and (
    scheda_id is null
    or exists (
      select 1
      from public.personal_workout_plans plan
      where plan.id = scheda_id and plan.user_id = auth.uid()
    )
  )
);

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
on public.events for update
to authenticated
using (auth.uid() = creator_id)
with check (
  auth.uid() = creator_id
  and (
    scheda_id is null
    or exists (
      select 1
      from public.personal_workout_plans plan
      where plan.id = scheda_id and plan.user_id = auth.uid()
    )
  )
);

comment on column public.events.scheda_id is
  'Scheda personale opzionale allegata dall organizer e visibile ai partecipanti dell evento.';

commit;
