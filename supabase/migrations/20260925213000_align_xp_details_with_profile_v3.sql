begin;

-- The XP details page used the legacy xp_accounts/xp_ledger system while the
-- wallet and profile use the canonical profile V3 ledger (xp_logs). Keep one
-- source of truth so totals, progress, history and sport breakdown agree.
create or replace function public.get_my_xp_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  total_xp integer := 0;
  badge_key text;
  badge_label text;
  badge_min integer := 0;
  badge_next integer;
  current_level integer := 1;
  current_level_threshold integer := 0;
  next_level_threshold integer := 250;
  progress_percent integer := 0;
  sport_totals jsonb := '{}'::jsonb;
  history_rows jsonb := '[]'::jsonb;
  attended_count integer := 0;
  no_show_count integer := 0;
  cancelled_count integer := 0;
  reliability numeric(5,2) := 100;
  last_updated timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per vedere XP e badge';
  end if;

  select coalesce(sum(log.xp), 0)::integer, max(log.created_at)
  into total_xp, last_updated
  from public.xp_logs log
  where log.user_id = actor_id;

  total_xp := greatest(coalesce(total_xp, 0), 0);
  badge_key := public.xp_badge_key(total_xp);
  badge_label := public.xp_badge_label(total_xp);

  badge_min := case badge_key
    when 'diamante' then 1000
    when 'oro' then 500
    when 'argento' then 250
    when 'bronzo' then 100
    else 0
  end;
  badge_next := case badge_key
    when 'oro' then 1000
    when 'argento' then 500
    when 'bronzo' then 250
    when 'rame' then 100
    else null
  end;

  current_level := greatest(1, floor(total_xp::numeric / 250)::integer + 1);
  current_level_threshold := (current_level - 1) * 250;
  next_level_threshold := current_level * 250;
  progress_percent := least(
    100,
    greatest(
      0,
      round(((total_xp - current_level_threshold)::numeric / 250) * 100)::integer
    )
  );

  select coalesce(jsonb_object_agg(bucket.sport_key, bucket.xp), '{}'::jsonb)
  into sport_totals
  from (
    select
      coalesce(event.sport_id::text, 'generic') as sport_key,
      sum(log.xp)::integer as xp
    from public.xp_logs log
    left join public.events event on event.id = log.evento_id
    where log.user_id = actor_id
    group by coalesce(event.sport_id::text, 'generic')
    having sum(log.xp) > 0
  ) bucket;

  select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
  into history_rows
  from (
    select
      jsonb_build_object(
        'id', log.id::text,
        'type', 'xp_award',
        'label', log.motivo,
        'points', log.xp,
        'sportId', coalesce(event.sport_id::text, 'generic'),
        'refId', log.ref_key,
        'ts', log.created_at
      ) as payload,
      log.created_at
    from public.xp_logs log
    left join public.events event on event.id = log.evento_id
    where log.user_id = actor_id
    order by log.created_at desc
    limit 100
  ) item;

  select
    count(*) filter (where participant.status = 'completed')::integer,
    count(*) filter (where participant.status = 'no_show')::integer,
    count(*) filter (where participant.status = 'cancelled')::integer
  into attended_count, no_show_count, cancelled_count
  from public.event_participants participant
  where participant.user_id = actor_id;

  select coalesce(profile.reliability_score, 100)
  into reliability
  from public.profiles profile
  where profile.id = actor_id;

  return jsonb_build_object(
    'source', 'supabase',
    'user_id', actor_id,
    'xp_global', total_xp,
    'xp_by_sport', sport_totals,
    'xp_history', history_rows,
    'badge', jsonb_build_object(
      'key', badge_key,
      'label', badge_label,
      'min', badge_min,
      'max', case when badge_next is null then null else badge_next - 1 end
    ),
    'progress', jsonb_build_object(
      'currentXp', total_xp,
      'currentThreshold', current_level_threshold,
      'nextThreshold', next_level_threshold,
      'progressPct', progress_percent,
      'level', current_level
    ),
    'limits', jsonb_build_object(
      'daily_global_cap', 200,
      'daily_sport_cap', 120
    ),
    'stats', jsonb_build_object(
      'attended', attended_count,
      'no_show', no_show_count,
      'cancelled', cancelled_count,
      'reliability', reliability
    ),
    'updated_at', last_updated
  );
end;
$$;

grant execute on function public.get_my_xp_state() to authenticated;

commit;
