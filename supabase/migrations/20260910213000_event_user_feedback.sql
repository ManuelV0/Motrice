begin;

create table if not exists public.event_user_reviews (
  event_id uuid not null references public.events(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  punctuality_stars smallint,
  respect_stars smallint,
  collaboration_stars smallint,
  communication_stars smallint,
  organization_stars smallint,
  tags text[] not null default '{}'::text[],
  private_report_note text not null default '' check (char_length(private_report_note) <= 500),
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id),
  check (cardinality(tags) <= 4),
  check (
    (skipped and punctuality_stars is null and respect_stars is null
      and collaboration_stars is null and communication_stars is null
      and organization_stars is null)
    or
    (not skipped and punctuality_stars is not null and respect_stars is not null
      and collaboration_stars is not null and communication_stars is not null
      and punctuality_stars between 1 and 5 and respect_stars between 1 and 5
      and collaboration_stars between 1 and 5 and communication_stars between 1 and 5
      and (organization_stars is null or organization_stars between 1 and 5))
  )
);

create index if not exists event_user_reviews_reviewee_created_idx
  on public.event_user_reviews(reviewee_id, created_at desc)
  where not skipped;

alter table public.event_user_reviews enable row level security;

drop policy if exists event_user_reviews_read_own on public.event_user_reviews;
create policy event_user_reviews_read_own
on public.event_user_reviews for select to authenticated
using (
  reviewer_id = (select auth.uid())
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

revoke insert, update, delete on public.event_user_reviews from anon, authenticated;
grant select on public.event_user_reviews to authenticated;

create or replace function public.refresh_profile_v3_reliability(target_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account public.profile_v3_accounts%rowtype;
  total_outcomes integer := 0;
  objective_score numeric := 100;
  peer_average numeric := null;
  peer_count integer := 0;
  peer_score numeric := null;
  peer_weight numeric := 0;
  final_score numeric := 100;
begin
  perform public.ensure_profile_v3_account(target_user_id);
  select * into account from public.profile_v3_accounts where user_id = target_user_id;

  total_outcomes := coalesce(account.present_count, 0)
    + coalesce(account.no_show_count, 0)
    + coalesce(account.late_cancellation_count, 0);

  if total_outcomes > 0 then
    objective_score := (
      coalesce(account.present_count, 0) * 100.0
      + coalesce(account.late_cancellation_count, 0) * 70.0
    ) / total_outcomes;
  end if;

  select
    avg(
      (
        review.punctuality_stars
        + review.respect_stars
        + review.collaboration_stars
        + review.communication_stars
        + coalesce(review.organization_stars, 0)
      )::numeric
      / (4 + case when review.organization_stars is null then 0 else 1 end)
    ),
    count(*)::integer
  into peer_average, peer_count
  from public.event_user_reviews review
  where review.reviewee_id = target_user_id
    and not review.skipped;

  if peer_average is null then
    final_score := objective_score;
  else
    peer_score := peer_average * 20.0;
    -- Ogni giudizio vale al massimo il 2%; solo dopo 10 eventi il peso arriva al 20%.
    -- Questo impedisce a una singola recensione di alterare bruscamente l'affidabilita.
    peer_weight := least(0.20, peer_count * 0.02);
    final_score := objective_score * (1 - peer_weight) + peer_score * peer_weight;
  end if;

  final_score := round(greatest(0, least(100, final_score)), 2);
  update public.profiles
  set reliability_score = final_score
  where id = target_user_id;
  return final_score;
end;
$$;

create or replace function public.get_profile_reputation(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  profile_id uuid := coalesce(target_user_id, actor_id);
  account public.profile_v3_accounts%rowtype;
  score numeric := 100;
  rating_average numeric := 0;
  rating_count integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if not exists (select 1 from public.profiles where id = profile_id) then
    raise exception 'Profilo non trovato';
  end if;

  score := public.refresh_profile_v3_reliability(profile_id);
  select * into account from public.profile_v3_accounts where user_id = profile_id;

  select
    coalesce(round(avg(
      (
        review.punctuality_stars
        + review.respect_stars
        + review.collaboration_stars
        + review.communication_stars
        + coalesce(review.organization_stars, 0)
      )::numeric
      / (4 + case when review.organization_stars is null then 0 else 1 end)
    ), 2), 0),
    count(*)::integer
  into rating_average, rating_count
  from public.event_user_reviews review
  where review.reviewee_id = profile_id
    and not review.skipped;

  return jsonb_build_object(
    'reliability', jsonb_build_object(
      'score', score,
      'present', coalesce(account.present_count, 0),
      'no_show', coalesce(account.no_show_count, 0),
      'late_cancellations', coalesce(account.late_cancellation_count, 0)
    ),
    'ratings', jsonb_build_object(
      'average', rating_average,
      'verified_count', rating_count
    )
  );
end;
$$;

create or replace function public.list_event_review_targets(target_event_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role_key text,
  checked_in_at timestamptz,
  reviewed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  actor_is_eligible boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  actor_is_eligible := actor_id = target_event.creator_id
    or exists (
      select 1 from public.event_participants participant
      where participant.event_id = target_event_id
        and participant.user_id = actor_id
        and participant.status = 'completed'
        and participant.cashback_percent = 100
    );

  if not actor_is_eligible then
    raise exception 'Completa la partecipazione prima di valutare';
  end if;

  if target_event.status <> 'completed'
    and now() < target_event.starts_at + make_interval(mins => target_event.duration_minutes::integer)
    and not exists (
      select 1 from public.event_workout_sessions session
      where session.event_id = target_event_id
        and session.user_id = actor_id
        and session.completed_at is not null
    )
  then
    raise exception 'La valutazione sara disponibile al termine dell evento';
  end if;

  return query
  with candidates as (
    select
      target_event.creator_id as candidate_id,
      'organizer'::text as candidate_role,
      null::timestamptz as candidate_checkin
    union all
    select
      participant.user_id,
      'participant'::text,
      participant.checked_in_at
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id <> target_event.creator_id
      and participant.status = 'completed'
      and participant.cashback_percent = 100
  )
  select
    candidate.candidate_id,
    profile.display_name,
    coalesce(profile.avatar_url, ''),
    candidate.candidate_role,
    candidate.candidate_checkin,
    exists (
      select 1 from public.event_user_reviews review
      where review.event_id = target_event_id
        and review.reviewer_id = actor_id
        and review.reviewee_id = candidate.candidate_id
    )
  from candidates candidate
  join public.profiles profile on profile.id = candidate.candidate_id
  where candidate.candidate_id <> actor_id
  order by case when candidate.candidate_role = 'organizer' then 0 else 1 end, profile.display_name;
end;
$$;

create or replace function public.submit_event_user_review(
  target_event_id uuid,
  target_user_id uuid,
  punctuality_value smallint,
  respect_value smallint,
  collaboration_value smallint,
  communication_value smallint,
  organization_value smallint,
  review_tags text[],
  report_note text,
  skip_interaction boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  actor_is_eligible boolean := false;
  target_is_eligible boolean := false;
  target_is_organizer boolean := false;
  safe_tags text[] := '{}'::text[];
  inserted_count integer := 0;
  reviewed_count integer := 0;
  target_count integer := 0;
  bonus_xp integer := 0;
  updated_reliability numeric := null;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Utente da valutare non valido';
  end if;

  select * into target_event from public.events where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  actor_is_eligible := actor_id = target_event.creator_id
    or exists (
      select 1 from public.event_participants participant
      where participant.event_id = target_event_id
        and participant.user_id = actor_id
        and participant.status = 'completed'
        and participant.cashback_percent = 100
    );
  if not actor_is_eligible then raise exception 'Completa la partecipazione prima di valutare'; end if;

  if target_event.status <> 'completed'
    and now() < target_event.starts_at + make_interval(mins => target_event.duration_minutes::integer)
    and not exists (
      select 1 from public.event_workout_sessions session
      where session.event_id = target_event_id
        and session.user_id = actor_id
        and session.completed_at is not null
    )
  then
    raise exception 'La valutazione sara disponibile al termine dell evento';
  end if;

  target_is_organizer := target_user_id = target_event.creator_id;
  target_is_eligible := target_is_organizer or exists (
    select 1 from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id = target_user_id
      and participant.status = 'completed'
      and participant.cashback_percent = 100
  );
  if not target_is_eligible then raise exception 'Puoi valutare solo presenze verificate'; end if;

  if not skip_interaction then
    if punctuality_value is null or punctuality_value not between 1 and 5
      or respect_value is null or respect_value not between 1 and 5
      or collaboration_value is null or collaboration_value not between 1 and 5
      or communication_value is null or communication_value not between 1 and 5
      or (target_is_organizer and (organization_value is null or organization_value not between 1 and 5))
    then
      raise exception 'Completa tutti i parametri della valutazione';
    end if;
  end if;

  select coalesce(array_agg(tag order by tag), '{}'::text[])
  into safe_tags
  from (
    select distinct lower(trim(raw_tag)) as tag
    from unnest(coalesce(review_tags, '{}'::text[])) raw_tag
    where lower(trim(raw_tag)) in (
      'puntuale', 'collaborativo', 'motivante', 'rispettoso',
      'comunicazione_chiara', 'poco_comunicativo', 'indicazioni_chiare'
    )
    limit 4
  ) allowed_tags;

  insert into public.event_user_reviews (
    event_id,
    reviewer_id,
    reviewee_id,
    punctuality_stars,
    respect_stars,
    collaboration_stars,
    communication_stars,
    organization_stars,
    tags,
    private_report_note,
    skipped
  ) values (
    target_event_id,
    actor_id,
    target_user_id,
    case when skip_interaction then null else punctuality_value end,
    case when skip_interaction then null else respect_value end,
    case when skip_interaction then null else collaboration_value end,
    case when skip_interaction then null else communication_value end,
    case when skip_interaction or not target_is_organizer then null else organization_value end,
    case when skip_interaction then '{}'::text[] else safe_tags end,
    case when skip_interaction then '' else left(coalesce(report_note, ''), 500) end,
    skip_interaction
  )
  on conflict (event_id, reviewer_id, reviewee_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 and not skip_interaction then
    updated_reliability := public.refresh_profile_v3_reliability(target_user_id);
  end if;

  with candidates as (
    select target_event.creator_id as candidate_id
    union
    select participant.user_id
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.user_id <> target_event.creator_id
      and participant.status = 'completed'
      and participant.cashback_percent = 100
  )
  select
    count(*) filter (where candidate_id <> actor_id)::integer,
    count(*) filter (
      where candidate_id <> actor_id
        and exists (
          select 1 from public.event_user_reviews review
          where review.event_id = target_event_id
            and review.reviewer_id = actor_id
            and review.reviewee_id = candidate_id
        )
    )::integer
  into target_count, reviewed_count
  from candidates;

  if target_count > 0 and reviewed_count >= target_count then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key)
    select
      actor_id,
      target_event_id,
      coalesce(target_event.review_bonus_xp, 25),
      'Valutazioni post evento completate',
      'feedback:' || target_event_id::text
    where not exists (
      select 1 from public.xp_logs existing_reward
      where existing_reward.user_id = actor_id
        and existing_reward.evento_id = target_event_id
        and existing_reward.ref_key in (
          'review:' || target_event_id::text,
          'feedback:' || target_event_id::text
        )
    )
    on conflict (user_id, ref_key) do nothing;
    if found then bonus_xp := coalesce(target_event.review_bonus_xp, 25); end if;

    update public.event_participants
    set review_bonus_awarded = true, updated_at = now()
    where event_id = target_event_id and user_id = actor_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'already_submitted', inserted_count = 0,
    'skipped', skip_interaction,
    'reviewed_count', reviewed_count,
    'target_count', target_count,
    'all_completed', target_count > 0 and reviewed_count >= target_count,
    'bonus_xp', bonus_xp,
    'reviewee_reliability', updated_reliability
  );
end;
$$;

revoke all on function public.refresh_profile_v3_reliability(uuid) from public, anon, authenticated;
revoke all on function public.get_profile_reputation(uuid) from public, anon;
revoke all on function public.list_event_review_targets(uuid) from public, anon;
revoke all on function public.submit_event_user_review(uuid, uuid, smallint, smallint, smallint, smallint, smallint, text[], text, boolean) from public, anon;

grant execute on function public.get_profile_reputation(uuid) to authenticated;
grant execute on function public.list_event_review_targets(uuid) to authenticated;
grant execute on function public.submit_event_user_review(uuid, uuid, smallint, smallint, smallint, smallint, smallint, text[], text, boolean) to authenticated;

commit;
