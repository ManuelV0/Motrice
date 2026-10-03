begin;

-- A group organizer who completes a verified workout follows the same
-- anti-cheating gates as a participant and earns the same 25 XP reward.
-- Personal workouts keep their separate, lower-frequency reward policy.
create or replace function public.complete_event_workout(target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  session_row public.event_workout_sessions%rowtype;
  participant public.event_participants%rowtype;
  completion_reward_eligible boolean := false;
  xp_awarded_value integer := 0;
  completed_at_value timestamptz := clock_timestamp();
  minimum_seconds integer;
  remaining_seconds integer;
begin
  if actor_id is null then raise exception 'Devi accedere'; end if;

  select * into target_event
  from public.events
  where id = target_event_id;
  if not found then raise exception 'Evento non trovato'; end if;

  select * into session_row
  from public.event_workout_sessions
  where event_id = target_event_id and user_id = actor_id
  for update;
  if not found then raise exception 'Avvia prima l allenamento'; end if;
  if session_row.progress_percent < 100 then
    raise exception 'Completa tutta la scheda prima di terminare';
  end if;

  minimum_seconds := public.event_workout_minimum_seconds(target_event.duration_minutes::integer);
  remaining_seconds := greatest(
    0,
    ceil(extract(epoch from (session_row.started_at + make_interval(secs => minimum_seconds) - completed_at_value)))::integer
  );
  if remaining_seconds > 0 then
    raise exception 'Allenamento troppo breve: attendi ancora % minuti', ceil(remaining_seconds::numeric / 60)::integer;
  end if;

  completion_reward_eligible := session_row.role_key = 'participant'
    or (session_row.role_key = 'organizer' and not coalesce(target_event.is_personal, false));

  if completion_reward_eligible and not session_row.xp_completion_awarded then
    insert into public.xp_logs (user_id, evento_id, xp, motivo, ref_key)
    values (actor_id, target_event_id, 25, 'Allenamento completato', 'workout:complete:' || target_event_id::text)
    on conflict (user_id, ref_key) do nothing;
    if found then xp_awarded_value := 25; end if;
  end if;

  if session_row.role_key = 'participant' then
    select * into participant
    from public.event_participants
    where event_id = target_event_id and user_id = actor_id
    for update;

    if found then
      update public.event_participants
      set status = 'completed',
          cashback_percent = 100,
          stake_status = case when stake_cents > 0 then 'released' else 'waived' end,
          minimum_reached_at = coalesce(minimum_reached_at, completed_at_value),
          completed_at = coalesce(completed_at, completed_at_value),
          updated_at = now()
      where event_id = target_event_id and user_id = actor_id;

      if participant.stake_cents > 0 and participant.stake_status in ('locked', 'verified') then
        update public.wallet_accounts
        set available_cents = available_cents + participant.stake_cents,
            locked_cents = greatest(0, locked_cents - participant.stake_cents)
        where user_id = actor_id;
      end if;
    end if;
  end if;

  update public.event_workout_sessions
  set progress_percent = 100,
      xp_completion_awarded = xp_completion_awarded or completion_reward_eligible,
      completed_at = coalesce(completed_at, completed_at_value)
  where event_id = target_event_id and user_id = actor_id
  returning * into session_row;

  return jsonb_build_object(
    'completed_at', session_row.completed_at,
    'xp_completion_awarded', session_row.xp_completion_awarded,
    'xp_awarded', xp_awarded_value,
    'minimum_duration_seconds', minimum_seconds,
    'minimum_completion_at', session_row.started_at + make_interval(secs => minimum_seconds),
    'minimum_time_reached', true,
    'remaining_seconds', 0
  );
end;
$$;

create or replace function public.notify_workout_session_milestones()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.mot_sixty_awarded and not old.mot_sixty_awarded then
    insert into public.notifications (user_id, event_id, type, title, body, payload)
    values (
      new.user_id,
      new.event_id,
      'event_workout_milestone',
      '60% dell’attività raggiunto',
      'Continua così: hai ottenuto +3 MOT.',
      jsonb_build_object('progress_percent', 60, 'mot_awarded', 3, 'action_path', '/events/' || new.event_id::text || '/activity')
    );
  end if;

  if new.completed_at is not null and old.completed_at is null then
    insert into public.notifications (user_id, event_id, type, title, body, payload)
    values (
      new.user_id,
      new.event_id,
      'event_workout_completed',
      'Attività completata',
      case when new.xp_completion_awarded then 'Allenamento concluso: +25 XP.' else 'Allenamento concluso correttamente.' end,
      jsonb_build_object(
        'progress_percent', 100,
        'xp_awarded', case when new.xp_completion_awarded then 25 else 0 end,
        'action_path', '/events/' || new.event_id::text
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.complete_event_workout(uuid) from public, anon;
grant execute on function public.complete_event_workout(uuid) to authenticated;

commit;
