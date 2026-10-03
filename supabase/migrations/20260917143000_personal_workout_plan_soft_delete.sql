begin;

alter table public.personal_workout_plans
  add column if not exists deleted_at timestamptz;

create index if not exists personal_workout_plans_user_active_updated_idx
  on public.personal_workout_plans(user_id, updated_at desc)
  where deleted_at is null;

comment on column public.personal_workout_plans.deleted_at is
  'Rimozione logica dalla libreria personale. La scheda resta disponibile agli eventi che la usano.';

commit;
