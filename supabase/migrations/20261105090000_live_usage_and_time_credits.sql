create table if not exists public.live_usage_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint live_usage_sessions_time_order check (ended_at is null or ended_at >= started_at)
);

create index if not exists live_usage_sessions_user_started_idx
  on public.live_usage_sessions (user_id, started_at desc);

alter table public.live_usage_sessions enable row level security;
revoke all on table public.live_usage_sessions from anon, authenticated;
grant select on table public.live_usage_sessions to authenticated;

drop policy if exists "Users can read their own live usage sessions" on public.live_usage_sessions;
create policy "Users can read their own live usage sessions"
  on public.live_usage_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.live_time_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_seconds bigint not null check (credit_seconds > 0),
  source text not null check (source in ('admin', 'bachs')),
  source_reference text,
  created_at timestamptz not null default now()
);

create index if not exists live_time_credit_grants_user_created_idx
  on public.live_time_credit_grants (user_id, created_at desc);

create unique index if not exists live_time_credit_grants_source_reference_idx
  on public.live_time_credit_grants (source, source_reference)
  where source_reference is not null;

alter table public.live_time_credit_grants enable row level security;
revoke all on table public.live_time_credit_grants from anon, authenticated;
grant select on table public.live_time_credit_grants to authenticated;

drop policy if exists "Users can read their own live time credits" on public.live_time_credit_grants;
create policy "Users can read their own live time credits"
  on public.live_time_credit_grants
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.start_live_usage_session()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  session_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if viewer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.live_usage_sessions
  set ended_at = greatest(started_at, least(v_now, last_seen_at + interval '75 seconds'))
  where user_id = viewer_id and ended_at is null;

  insert into public.live_usage_sessions (user_id, started_at, last_seen_at)
  values (viewer_id, v_now, v_now)
  returning id into session_id;

  return session_id;
end;
$$;

create or replace function public.touch_live_usage_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.live_usage_sessions
  set last_seen_at = clock_timestamp()
  where id = p_session_id and user_id = viewer_id and ended_at is null;
end;
$$;

create or replace function public.stop_live_usage_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.live_usage_sessions
  set ended_at = clock_timestamp()
  where id = p_session_id and user_id = viewer_id and ended_at is null;
end;
$$;

create or replace function public.get_live_usage_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  result jsonb;
begin
  if viewer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  with usage as (
    select
      id,
      started_at,
      ended_at,
      last_seen_at,
      greatest(started_at, least(v_now, coalesce(ended_at, last_seen_at + interval '75 seconds'))) as effective_end
    from public.live_usage_sessions
    where user_id = viewer_id
  ),
  recent as (
    select
      id,
      started_at,
      ended_at,
      effective_end,
      (ended_at is null and last_seen_at >= v_now - interval '75 seconds') as active,
      greatest(0, floor(extract(epoch from (effective_end - started_at))))::bigint as duration_seconds
    from usage
    order by started_at desc
    limit 10
  )
  select jsonb_build_object(
    'credited_seconds', coalesce((
      select sum(credit_seconds) from public.live_time_credit_grants where user_id = viewer_id
    ), 0),
    'spent_seconds', coalesce((
      select sum(greatest(0, floor(extract(epoch from (effective_end - started_at))))::bigint) from usage
    ), 0),
    'session_count', (select count(*) from usage),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'started_at', started_at,
        'ended_at', ended_at,
        'active', active,
        'duration_seconds', duration_seconds
      ) order by started_at desc)
      from recent
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.start_live_usage_session() from public, anon;
revoke all on function public.touch_live_usage_session(uuid) from public, anon;
revoke all on function public.stop_live_usage_session(uuid) from public, anon;
revoke all on function public.get_live_usage_summary() from public, anon;
grant execute on function public.start_live_usage_session() to authenticated;
grant execute on function public.touch_live_usage_session(uuid) to authenticated;
grant execute on function public.stop_live_usage_session(uuid) to authenticated;
grant execute on function public.get_live_usage_summary() to authenticated;
