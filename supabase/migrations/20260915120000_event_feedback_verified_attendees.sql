-- Post-event feedback is available only between people whose attendance was
-- actually verified. In particular, creating an event is not enough to make
-- the organizer a valid review target.

create or replace function public.event_organizer_presence_verified(
  target_event_id uuid,
  organizer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.event_presence_samples sample
    where sample.event_id = target_event_id
      and sample.user_id = organizer_id
      and sample.sample_role = 'organizer'
      and sample.is_in_radius
  ) or exists (
    select 1
    from public.event_participants participant
    where participant.event_id = target_event_id
      and participant.checked_in_by = organizer_id
      and participant.checked_in_at is not null
  );
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

  actor_is_eligible := (
      actor_id = target_event.creator_id
      and public.event_organizer_presence_verified(target_event_id, actor_id)
    ) or exists (
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
      (
        select min(sample.recorded_at)
        from public.event_presence_samples sample
        where sample.event_id = target_event_id
          and sample.user_id = target_event.creator_id
          and sample.sample_role = 'organizer'
          and sample.is_in_radius
      ) as candidate_checkin
    where public.event_organizer_presence_verified(target_event_id, target_event.creator_id)
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

create or replace function public.enforce_verified_event_review_parties()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = new.event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  if new.reviewer_id = target_event.creator_id
    and not public.event_organizer_presence_verified(new.event_id, new.reviewer_id)
  then
    raise exception 'La presenza dell organizzatore non risulta verificata';
  end if;

  if new.reviewee_id = target_event.creator_id
    and not public.event_organizer_presence_verified(new.event_id, new.reviewee_id)
  then
    raise exception 'Puoi valutare solo presenze verificate';
  end if;

  return new;
end;
$$;

drop trigger if exists event_user_reviews_verified_parties on public.event_user_reviews;
create trigger event_user_reviews_verified_parties
before insert on public.event_user_reviews
for each row execute function public.enforce_verified_event_review_parties();

revoke all on function public.event_organizer_presence_verified(uuid, uuid) from public, anon;
revoke all on function public.enforce_verified_event_review_parties() from public, anon;
grant execute on function public.event_organizer_presence_verified(uuid, uuid) to authenticated;
