begin;

-- The profile must expose only verified, explainable values. In particular,
-- recent activity derives XP from the XP ledger instead of displaying a fixed
-- reward, and host statistics exclude personal/cancelled events.
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
  punctuality_average numeric := 0;
  respect_average numeric := 0;
  collaboration_average numeric := 0;
  communication_average numeric := 0;
  organization_average numeric := 0;
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
    count(*)::integer,
    coalesce(round(avg(review.punctuality_stars), 2), 0),
    coalesce(round(avg(review.respect_stars), 2), 0),
    coalesce(round(avg(review.collaboration_stars), 2), 0),
    coalesce(round(avg(review.communication_stars), 2), 0),
    coalesce(round(avg(review.organization_stars), 2), 0)
  into
    rating_average,
    rating_count,
    punctuality_average,
    respect_average,
    collaboration_average,
    communication_average,
    organization_average
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
      'verified_count', rating_count,
      'breakdown', jsonb_build_object(
        'punctuality', punctuality_average,
        'respect', respect_average,
        'collaboration', collaboration_average,
        'communication', communication_average,
        'organization', organization_average
      )
    )
  );
end;
$$;

create or replace function public.get_my_profile_v3()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  account public.profile_v3_accounts%rowtype;
  wallet public.credit_wallet%rowtype;
  profile_row public.profiles%rowtype;
  mot_total integer := 0;
  xp_total integer := 0;
  host_events integer := 0;
  host_participants integer := 0;
  total_outcomes integer := 0;
  score integer := 0;
  demo_used boolean := false;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  perform public.ensure_profile_v3_account(actor_id);
  select * into account from public.profile_v3_accounts where user_id = actor_id;
  select * into wallet from public.credit_wallet where user_id = actor_id;
  select * into profile_row from public.profiles where id = actor_id;

  select coalesce(sum(log.mot), 0)::integer into mot_total
  from public.mot_logs log
  where log.user_id = actor_id and log.qr_verificato;

  select coalesce(sum(log.xp), 0)::integer into xp_total
  from public.xp_logs log
  where log.user_id = actor_id;

  select count(*)::integer into host_events
  from public.events event
  where event.creator_id = actor_id
    and event.created_at >= account.started_at
    and not coalesce(event.is_personal, false)
    and event.status in ('scheduled', 'completed');

  select count(distinct participant.user_id)::integer into host_participants
  from public.event_participants participant
  join public.events event on event.id = participant.event_id
  where event.creator_id = actor_id
    and event.created_at >= account.started_at
    and not coalesce(event.is_personal, false)
    and event.status = 'completed'
    and participant.user_id <> actor_id
    and participant.status = 'completed'
    and participant.cashback_percent = 100;

  total_outcomes := account.present_count + account.no_show_count + account.late_cancellation_count;
  score := case when total_outcomes = 0 then 0 else round(account.present_count * 100.0 / total_outcomes)::integer end;
  select exists (select 1 from public.mot_logs where user_id = actor_id and ref_key = 'demo:checkin') into demo_used;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'display_name', coalesce(nullif(trim(profile_row.display_name), ''), 'Atleta Motrice'),
      'avatar_url', coalesce(profile_row.avatar_url, ''),
      'cover_url', coalesce(profile_row.cover_url, ''),
      'bio', coalesce(profile_row.bio, ''),
      'city', coalesce(profile_row.city, ''),
      'sports', coalesce((
        select jsonb_agg(item.value ->> 'name')
        from jsonb_array_elements(coalesce(profile_row.sport_profiles, '[]'::jsonb)) item(value)
        where nullif(trim(item.value ->> 'name'), '') is not null
      ), '[]'::jsonb),
      'sport_profiles', coalesce(profile_row.sport_profiles, '[]'::jsonb),
      'training_goal', coalesce(profile_row.training_goal, ''),
      'looking_for', coalesce(profile_row.looking_for, ''),
      'training_preferences', to_jsonb(coalesce(profile_row.training_preferences, '{}'::text[])),
      'member_since', profile_row.created_at
    ),
    'verified_checkins', account.present_count,
    'reliability', jsonb_build_object(
      'score', score,
      'present', account.present_count,
      'no_show', account.no_show_count,
      'late_cancellations', account.late_cancellation_count
    ),
    'mot', jsonb_build_object(
      'total', mot_total,
      'logs', coalesce((
        select jsonb_agg(row_to_json(log_row) order by log_row.created_at desc)
        from (
          select id, evento_id, mot, qr_verificato, motivo, ref_key, created_at
          from public.mot_logs
          where user_id = actor_id
          order by created_at desc
          limit 10
        ) log_row
      ), '[]'::jsonb)
    ),
    'host', jsonb_build_object('events', host_events, 'participants', host_participants),
    'xp', jsonb_build_object(
      'total', xp_total,
      'logs', coalesce((
        select jsonb_agg(row_to_json(xp_row) order by xp_row.created_at desc)
        from (
          select id, evento_id, xp, motivo, ref_key, created_at
          from public.xp_logs
          where user_id = actor_id
          order by created_at desc
          limit 10
        ) xp_row
      ), '[]'::jsonb)
    ),
    'credit_wallet', jsonb_build_object(
      'available_cents', wallet.available_cents,
      'locked_cents', wallet.locked_cents
    ),
    'recent_activity', coalesce((
      select jsonb_agg(activity.payload order by activity.created_at desc)
      from (
        select *
        from (
          select
            mot.created_at,
            jsonb_build_object(
              'id', 'mot-' || mot.id::text,
              'title', coalesce(event.title, case when mot.motivo like '%gps%' then 'Check-in GPS' else 'Attivita verificata' end),
              'subtitle',
                (case when mot.mot > 0 then '+' else '' end) || mot.mot::text || ' MOT'
                || case when xp.xp is null then '' else ' · ' || (case when xp.xp > 0 then '+' else '' end) || xp.xp::text || ' XP' end,
              'created_at', mot.created_at
            ) as payload
          from public.mot_logs mot
          left join public.xp_logs xp
            on xp.user_id = mot.user_id and xp.ref_key = mot.ref_key
          left join public.events event on event.id = mot.evento_id
          where mot.user_id = actor_id and mot.qr_verificato

          union all

          select
            xp.created_at,
            jsonb_build_object(
              'id', 'xp-' || xp.id::text,
              'title', coalesce(event.title, xp.motivo),
              'subtitle', (case when xp.xp > 0 then '+' else '' end) || xp.xp::text || ' XP',
              'created_at', xp.created_at
            ) as payload
          from public.xp_logs xp
          left join public.events event on event.id = xp.evento_id
          where xp.user_id = actor_id
            and not exists (
              select 1 from public.mot_logs mot
              where mot.user_id = xp.user_id and mot.ref_key = xp.ref_key
            )
        ) feed
        order by feed.created_at desc
        limit 8
      ) activity
    ), '[]'::jsonb),
    'demo_used', demo_used
  );
end;
$$;

create or replace function public.get_public_profile_v3(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  account public.profile_v3_accounts%rowtype;
  profile_row public.profiles%rowtype;
  mot_total integer := 0;
  xp_total integer := 0;
  host_events integer := 0;
  host_participants integer := 0;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;
  select * into profile_row from public.profiles where id = target_user_id;
  if not found then raise exception 'Profilo non trovato'; end if;
  select * into account from public.profile_v3_accounts where user_id = target_user_id;

  select coalesce(sum(mot), 0)::integer into mot_total
  from public.mot_logs where user_id = target_user_id and qr_verificato;
  select coalesce(sum(xp), 0)::integer into xp_total
  from public.xp_logs where user_id = target_user_id;

  if account.user_id is not null then
    select count(*)::integer into host_events
    from public.events event
    where event.creator_id = target_user_id
      and event.created_at >= account.started_at
      and not coalesce(event.is_personal, false)
      and event.status in ('scheduled', 'completed');

    select count(distinct participant.user_id)::integer into host_participants
    from public.event_participants participant
    join public.events event on event.id = participant.event_id
    where event.creator_id = target_user_id
      and event.created_at >= account.started_at
      and not coalesce(event.is_personal, false)
      and event.status = 'completed'
      and participant.user_id <> target_user_id
      and participant.status = 'completed'
      and participant.cashback_percent = 100;
  end if;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'display_name', coalesce(nullif(trim(profile_row.display_name), ''), 'Atleta Motrice'),
      'avatar_url', coalesce(profile_row.avatar_url, ''),
      'cover_url', coalesce(profile_row.cover_url, ''),
      'bio', coalesce(profile_row.bio, ''),
      'city', coalesce(profile_row.city, ''),
      'sports', coalesce((
        select jsonb_agg(item.value ->> 'name')
        from jsonb_array_elements(coalesce(profile_row.sport_profiles, '[]'::jsonb)) item(value)
        where nullif(trim(item.value ->> 'name'), '') is not null
      ), '[]'::jsonb),
      'sport_profiles', coalesce(profile_row.sport_profiles, '[]'::jsonb),
      'training_goal', coalesce(profile_row.training_goal, ''),
      'looking_for', coalesce(profile_row.looking_for, ''),
      'training_preferences', to_jsonb(coalesce(profile_row.training_preferences, '{}'::text[])),
      'member_since', profile_row.created_at
    ),
    'verified_checkins', coalesce(account.present_count, 0),
    'reliability', jsonb_build_object(
      'present', coalesce(account.present_count, 0),
      'no_show', coalesce(account.no_show_count, 0),
      'late_cancellations', coalesce(account.late_cancellation_count, 0)
    ),
    'mot', jsonb_build_object(
      'total', mot_total,
      'logs', coalesce((
        select jsonb_agg(row_to_json(log_row) order by log_row.created_at desc)
        from (
          select id, evento_id, mot, qr_verificato, motivo, ref_key, created_at
          from public.mot_logs
          where user_id = target_user_id and qr_verificato
          order by created_at desc
          limit 8
        ) log_row
      ), '[]'::jsonb)
    ),
    'host', jsonb_build_object('events', host_events, 'participants', host_participants),
    'xp', jsonb_build_object('total', xp_total, 'logs', '[]'::jsonb),
    'recent_activity', '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_my_profile_v3() from public, anon;
revoke all on function public.get_public_profile_v3(uuid) from public, anon;
revoke all on function public.get_profile_reputation(uuid) from public, anon;
grant execute on function public.get_my_profile_v3() to authenticated;
grant execute on function public.get_public_profile_v3(uuid) to authenticated;
grant execute on function public.get_profile_reputation(uuid) to authenticated;

commit;
