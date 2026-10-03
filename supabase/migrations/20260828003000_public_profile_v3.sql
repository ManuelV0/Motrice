begin;

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
  total_outcomes integer := 0;
  score integer := 0;
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
    from public.events
    where creator_id = target_user_id and created_at >= account.started_at;

    select count(*)::integer into host_participants
    from public.event_participants participant
    join public.events event on event.id = participant.event_id
    where event.creator_id = target_user_id
      and event.created_at >= account.started_at
      and participant.user_id <> target_user_id;
  end if;

  total_outcomes := coalesce(account.present_count, 0)
    + coalesce(account.no_show_count, 0)
    + coalesce(account.late_cancellation_count, 0);
  score := case
    when total_outcomes = 0 then 0
    else round(coalesce(account.present_count, 0) * 100.0 / total_outcomes)::integer
  end;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'display_name', coalesce(profile_row.display_name, 'Atleta Motrice'),
      'avatar_url', coalesce(profile_row.avatar_url, ''),
      'bio', coalesce(profile_row.bio, ''),
      'city', coalesce(nullif(profile_row.city, ''), 'Ascoli Piceno'),
      'sports', jsonb_build_array('Calisthenics', 'Running'),
      'member_since', 'Mar 2026'
    ),
    'verified_checkins', coalesce(account.present_count, 0),
    'reliability', jsonb_build_object(
      'score', score,
      'present', coalesce(account.present_count, 0),
      'no_show', coalesce(account.no_show_count, 0),
      'late_cancellations', coalesce(account.late_cancellation_count, 0)
    ),
    'mot', jsonb_build_object(
      'total', mot_total,
      'logs', coalesce((
        select jsonb_agg(row_to_json(log_row) order by log_row.created_at desc)
        from (
          select id, mot, qr_verificato, motivo, created_at
          from public.mot_logs
          where user_id = target_user_id and qr_verificato
          order by created_at desc
          limit 10
        ) log_row
      ), '[]'::jsonb)
    ),
    'ratings', jsonb_build_object('average', 0, 'verified_count', 0),
    'host', jsonb_build_object('events', host_events, 'participants', host_participants),
    'xp', jsonb_build_object('total', xp_total, 'logs', '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', 'mot-' || log.id::text,
          'title', 'Check-in QR',
          'subtitle', '+' || log.mot::text || ' MOT · presenza verificata',
          'created_at', log.created_at
        ) order by log.created_at desc
      )
      from (
        select id, mot, created_at
        from public.mot_logs
        where user_id = target_user_id and qr_verificato
        order by created_at desc
        limit 5
      ) log
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_profile_v3(uuid) from public, anon;
grant execute on function public.get_public_profile_v3(uuid) to authenticated;

commit;
