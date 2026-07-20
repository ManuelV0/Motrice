begin;

create table if not exists public.event_chat_reads (
  event_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_chat_reads_participant_fkey
    foreign key (event_id, user_id)
    references public.event_participants(event_id, user_id)
    on delete cascade
);

create index if not exists event_chat_reads_user_updated_idx
  on public.event_chat_reads(user_id, updated_at desc);

drop trigger if exists event_chat_reads_set_updated_at on public.event_chat_reads;
create trigger event_chat_reads_set_updated_at
before update on public.event_chat_reads
for each row execute function public.set_updated_at();

alter table public.event_chat_reads enable row level security;

drop policy if exists "event_chat_reads_read_own" on public.event_chat_reads;
create policy "event_chat_reads_read_own"
on public.event_chat_reads for select
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_event_participant(event_id)
);

drop policy if exists "event_chat_reads_insert_own" on public.event_chat_reads;
create policy "event_chat_reads_insert_own"
on public.event_chat_reads for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_event_participant(event_id)
);

drop policy if exists "event_chat_reads_update_own" on public.event_chat_reads;
create policy "event_chat_reads_update_own"
on public.event_chat_reads for update
to authenticated
using (
  (select auth.uid()) = user_id
  and public.is_event_participant(event_id)
)
with check (
  (select auth.uid()) = user_id
  and public.is_event_participant(event_id)
);

create or replace function public.get_event_chat_inbox()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  city text,
  location_name text,
  event_status text,
  sport_slug text,
  sport_name text,
  participants_count bigint,
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid,
  last_sender_name text,
  unread_count bigint,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select auth.uid() as id
  ),
  memberships as (
    select participant.event_id, participant.joined_at
    from public.event_participants participant
    cross join actor
    where participant.user_id = actor.id
      and participant.status = 'going'
  )
  select
    event.id as event_id,
    event.title,
    event.starts_at,
    event.city,
    event.location_name,
    event.status as event_status,
    sport.slug as sport_slug,
    sport.name as sport_name,
    coalesce(participant_totals.total, 0)::bigint as participants_count,
    latest.body as last_message,
    latest.created_at as last_message_at,
    latest.sender_id as last_sender_id,
    latest.sender_name as last_sender_name,
    coalesce(unread.total, 0)::bigint as unread_count,
    membership.joined_at
  from memberships membership
  join public.events event on event.id = membership.event_id
  join public.sports sport on sport.id = event.sport_id
  cross join actor
  left join public.event_chat_reads read_state
    on read_state.event_id = event.id
   and read_state.user_id = actor.id
  left join lateral (
    select count(*)::bigint as total
    from public.event_participants participant
    where participant.event_id = event.id
      and participant.status = 'going'
  ) participant_totals on true
  left join lateral (
    select
      message.body,
      message.created_at,
      message.sender_id,
      profile.display_name as sender_name
    from public.event_messages message
    join public.profiles profile on profile.id = message.sender_id
    where message.event_id = event.id
    order by message.created_at desc, message.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as total
    from public.event_messages message
    where message.event_id = event.id
      and message.sender_id <> actor.id
      and message.created_at > greatest(
        membership.joined_at,
        coalesce(read_state.last_read_at, membership.joined_at)
      )
  ) unread on true
  order by
    coalesce(latest.created_at, membership.joined_at, event.created_at) desc,
    event.starts_at asc;
$$;

create or replace function public.mark_event_chat_read(
  target_event_id uuid,
  read_through timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  safe_read_at timestamptz := least(coalesce(read_through, now()), now());
  result_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Devi accedere per leggere la chat';
  end if;

  if not public.is_event_participant(target_event_id) then
    raise exception 'La chat e disponibile solo ai partecipanti attivi';
  end if;

  insert into public.event_chat_reads (event_id, user_id, last_read_at)
  values (target_event_id, actor_id, safe_read_at)
  on conflict (event_id, user_id) do update
  set last_read_at = greatest(public.event_chat_reads.last_read_at, excluded.last_read_at);

  select last_read_at
  into result_at
  from public.event_chat_reads
  where event_id = target_event_id
    and user_id = actor_id;

  return result_at;
end;
$$;

grant select, insert, update on public.event_chat_reads to authenticated;

revoke all on function public.get_event_chat_inbox() from public, anon;
grant execute on function public.get_event_chat_inbox() to authenticated;

revoke all on function public.mark_event_chat_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_event_chat_read(uuid, timestamptz) to authenticated;

alter table public.event_chat_reads replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.event_chat_reads;
exception when duplicate_object then null;
end;
$$;

commit;
