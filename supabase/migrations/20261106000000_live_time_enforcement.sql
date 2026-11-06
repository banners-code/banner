begin;

-- Only the application server can create, extend, or settle an authorization.
create table if not exists public.live_session_leases (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique references public.live_usage_sessions(id) on delete cascade,
  hard_expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  activated_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.live_session_leases add column if not exists activated_at timestamptz;
create unique index if not exists live_session_one_open_lease
  on public.live_session_leases(user_id) where closed_at is null;
alter table public.live_session_leases enable row level security;
revoke all on public.live_session_leases from public,anon,authenticated;
grant all on public.live_session_leases to service_role;

create or replace function public.live_session_effective_end(p_session public.live_usage_sessions)
returns timestamptz language sql stable security definer set search_path='' as $$
  select greatest(p_session.started_at,least(now(),coalesce(p_session.ended_at,p_session.last_seen_at+interval '75 seconds'),
    coalesce((select least(l.hard_expires_at,l.idle_expires_at) from public.live_session_leases l where l.session_id=p_session.id),'infinity'::timestamptz)));
$$;
create or replace function public.account_live_seconds_used(p_user_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(greatest(0,ceil(extract(epoch from (public.live_session_effective_end(s)-s.started_at))))),0)::bigint
  from public.live_usage_sessions s where s.user_id=p_user_id;
$$;
revoke all on function public.live_session_effective_end(public.live_usage_sessions),public.account_live_seconds_used(uuid) from public,anon,authenticated;

create or replace function public.server_live_session(p_user_id uuid,p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz:=clock_timestamp();
  lease public.live_session_leases%rowtype;
  usage_id uuid;
  available bigint;
  access_status text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  if p_user_id is null or p_request_id is null or p_action is null or p_action not in ('reserve','heartbeat','authorize','stop') then
    raise exception 'Invalid session request' using errcode='22023';
  end if;
  -- Shared lock with admin time adjustments; serializes all instances/tabs.
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  for lease in select * from public.live_session_leases where user_id=p_user_id and closed_at is null
    and least(hard_expires_at,idle_expires_at)<=v_now for update loop
    update public.live_usage_sessions set ended_at=case when lease.activated_at is null then started_at else greatest(started_at,least(v_now,lease.hard_expires_at,lease.idle_expires_at)) end where id=lease.session_id;
    update public.live_session_leases set closed_at=v_now,closed_reason='expired' where id=lease.id;
  end loop;
  select * into lease from public.live_session_leases where id=p_request_id and user_id=p_user_id;
  if p_action='stop' then
    if found and lease.closed_at is null then
      update public.live_usage_sessions set ended_at=case when lease.activated_at is null then started_at else greatest(started_at,least(v_now,lease.hard_expires_at,lease.idle_expires_at)) end where id=lease.session_id;
      update public.live_session_leases set closed_at=v_now,closed_reason='stopped' where id=lease.id;
    end if;
    return jsonb_build_object('active',false);
  end if;
  if found and lease.closed_at is not null then return jsonb_build_object('active',false,'code','session_expired'); end if;
  select case when m.status='suspended' and m.suspended_until<=v_now then 'active' else m.status end
    into access_status from public.account_moderation m where user_id=p_user_id;
  if coalesce(access_status,'active')<>'active' then return jsonb_build_object('active',false,'code','account_restricted'); end if;
  available:=greatest(0,public.account_total_credit_seconds(p_user_id)-public.account_live_seconds_used(p_user_id));
  if p_action='reserve' and lease.id is null then
    if exists(select 1 from public.live_session_leases where user_id=p_user_id and closed_at is null) then
      return jsonb_build_object('active',false,'code','session_in_use');
    end if;
    if available<10 then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
    -- Settle historical, unguarded sessions before the first enforced authorization.
    update public.live_usage_sessions s set ended_at=public.live_session_effective_end(s)
      where s.user_id=p_user_id and ended_at is null;
    insert into public.live_usage_sessions(user_id,started_at,last_seen_at,ended_at) values(p_user_id,v_now,v_now,v_now) returning id into usage_id;
    insert into public.live_session_leases(id,user_id,session_id,hard_expires_at,idle_expires_at)
      values(p_request_id,p_user_id,usage_id,v_now+make_interval(secs=>least(available,3600)::integer),v_now+interval '45 seconds') returning * into lease;
  elsif lease.id is null then
    return jsonb_build_object('active',false,'code','session_expired');
  end if;
  if p_action='authorize' and lease.activated_at is null then
    if available<10 then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
    lease.activated_at:=v_now;
    lease.hard_expires_at:=v_now+make_interval(secs=>least(available,3600)::integer);
    update public.live_session_leases set activated_at=v_now where id=lease.id;
    update public.live_usage_sessions set started_at=v_now,last_seen_at=v_now,ended_at=null where id=lease.session_id;
  end if;
  -- An admin removal shortens the current allowance; additions are used next session.
  lease.hard_expires_at:=least(lease.hard_expires_at,v_now+make_interval(secs=>least(available,3600)::integer));
  if lease.hard_expires_at<=v_now or available<=0 then
    update public.live_usage_sessions set ended_at=case when lease.activated_at is null then started_at else greatest(started_at,least(v_now,lease.hard_expires_at)) end where id=lease.session_id;
    update public.live_session_leases set closed_at=v_now,closed_reason='time_exhausted',hard_expires_at=lease.hard_expires_at where id=lease.id;
    return jsonb_build_object('active',false,'code','insufficient_time');
  end if;
  update public.live_session_leases set hard_expires_at=lease.hard_expires_at,idle_expires_at=least(lease.hard_expires_at,v_now+interval '45 seconds') where id=lease.id;
  update public.live_usage_sessions set last_seen_at=v_now where id=lease.session_id;
  return jsonb_build_object('active',true,'metering',lease.activated_at is not null,'session_id',lease.id,'remaining_seconds',greatest(0,floor(extract(epoch from (lease.hard_expires_at-v_now)))),
    'balance_seconds',available,'heartbeat_seconds',10,'idle_seconds',35,'server_now',v_now,'expires_at',lease.hard_expires_at);
end; $$;
revoke all on function public.server_live_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_live_session(uuid,uuid,text) to service_role;

-- Retire browser-writable accounting; old clients must upgrade.
revoke all on function public.start_live_usage_session(),public.touch_live_usage_session(uuid),public.stop_live_usage_session(uuid) from public,anon,authenticated;

create or replace function public.get_live_usage_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  return jsonb_build_object('credited_seconds',public.account_total_credit_seconds(auth.uid()),'spent_seconds',public.account_live_seconds_used(auth.uid()),
    'session_count',(select count(*) from public.live_usage_sessions where user_id=auth.uid()),
    'sessions',coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
      select s.id,s.started_at,s.ended_at,
        (s.ended_at is null and public.live_session_effective_end(s)>=now()) as active,
        greatest(0,ceil(extract(epoch from (public.live_session_effective_end(s)-s.started_at))))::bigint as duration_seconds
      from public.live_usage_sessions s where s.user_id=auth.uid() order by s.started_at desc limit 10) r),'[]'::jsonb));
end; $$;

-- Reuse the same duration calculation throughout the admin.
create or replace function public.admin_get_user_details(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,
    'credited_seconds',public.account_total_credit_seconds(u.id),'spent_seconds',public.account_live_seconds_used(u.id),
    'sessions',coalesce((select jsonb_agg(to_jsonb(r)) from (select s.id,s.started_at,s.ended_at,greatest(0,ceil(extract(epoch from (public.live_session_effective_end(s)-s.started_at))))::bigint as duration_seconds from public.live_usage_sessions s where s.user_id=u.id order by s.started_at desc limit 25) r),'[]'::jsonb),
    'deposits',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,amount,currency,status,payment_reference,created_at,admin_note from public.manual_funding_requests where owner_id=u.id order by created_at desc limit 25) r),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,delta_seconds,reason,actor_id,created_at from public.live_time_adjustments where user_id=u.id order by created_at desc limit 25) r),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,credit_seconds,source,created_at from public.live_time_credit_grants where user_id=u.id order by created_at desc limit 25) r),'[]'::jsonb)
  ) into result from auth.users u where u.id=p_user_id;
  if result is null then raise exception 'Account not found' using errcode='P0002'; end if;
  return result;
end; $$;
create or replace function public.admin_get_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object('total_users',(select count(*) from auth.users),
    'active_users',(select count(distinct user_id) from public.live_usage_sessions s where ended_at is null and public.live_session_effective_end(s)>=now()),
    'active_sessions',(select count(*) from public.live_usage_sessions s where ended_at is null and public.live_session_effective_end(s)>=now()),
    'total_sessions',(select count(*) from public.live_usage_sessions),
    'spent_seconds',(select coalesce(sum(public.account_live_seconds_used(u.id)),0) from auth.users u),
    'pending_deposits',(select count(*) from public.manual_funding_requests where status='pending'),
    'open_reports',(select count(*) from public.abuse_reports where status in ('open','reviewing')),
    'open_support',(select count(*) from public.support_conversations where status='open'),
    'money',coalesce((select jsonb_agg(to_jsonb(m)) from (select currency,coalesce(sum(amount) filter(where status='approved'),0) as approved,coalesce(sum(amount) filter(where status='pending'),0) as pending from public.manual_funding_requests group by currency order by currency) m),'[]'::jsonb));
end; $$;
create or replace function public.admin_search_users(p_query text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_query is null or char_length(p_query)>254 or p_offset is null or p_offset<0 then raise exception 'Invalid search' using errcode='22023'; end if;
  with candidates as (select u.id,u.email,u.created_at,u.last_sign_in_at,exists(select 1 from public.support_admins a where a.user_id=u.id) as is_admin,
    case when m.status='suspended' and m.suspended_until<=now() then 'active' else coalesce(m.status,'active') end as status,m.reason,m.suspended_until,
    public.account_total_credit_seconds(u.id) as credited_seconds,public.account_live_seconds_used(u.id) as spent_seconds
    from auth.users u left join public.account_moderation m on m.user_id=u.id
    where position(lower(trim(p_query)) in lower(coalesce(u.email,'')))>0 or u.id::text=trim(p_query)
    order by u.created_at desc,u.id limit 51 offset p_offset)
  select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from candidates limit 50) r),'[]'::jsonb),'has_more',(select count(*)>50 from candidates)) into result;
  return result;
end; $$;
notify pgrst,'reload schema';
commit;
