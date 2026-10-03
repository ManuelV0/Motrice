begin;

alter table public.profiles
  add column if not exists sport_profiles jsonb not null default '[]'::jsonb,
  add column if not exists training_goal text not null default '',
  add column if not exists looking_for text not null default '',
  add column if not exists training_preferences text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_sport_profiles_array_check'
  ) then
    alter table public.profiles
      add constraint profiles_sport_profiles_array_check
      check (jsonb_typeof(sport_profiles) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_training_goal_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_training_goal_length_check
      check (char_length(training_goal) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_looking_for_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_looking_for_length_check
      check (char_length(looking_for) <= 300);
  end if;
end
$$;

comment on column public.profiles.sport_profiles is
  'Sport dichiarati dall utente con relativo livello. Non contiene statistiche calcolate.';
comment on column public.profiles.training_goal is
  'Obiettivo sportivo personale modificabile dall utente.';
comment on column public.profiles.looking_for is
  'Preferenze testuali sul tipo di compagni o allenamenti cercati.';
comment on column public.profiles.training_preferences is
  'Tag personali sullo stile e sugli orari di allenamento.';

commit;
