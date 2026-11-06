begin;
alter table public.live_session_leases add column if not exists connection_id uuid;
alter table public.live_session_leases add column if not exists stop_requested_at timestamptz;
alter table public.live_usage_sessions add column if not exists provider_seconds bigint not null default 0;

-- Server-role calls deliberately have no user JWT. Check the verified target instead.
create or replace function public.check_live_usage_account_access()
returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(auth.role(),'')='service_role' then
    if exists(select 1 from public.account_moderation where user_id=new.user_id
      and (status='banned' or (status='suspended' and suspended_until>clock_timestamp()))) then
      raise exception 'Account restricted from live sessions' using errcode='42501';
    end if;
  elsif new.user_id is distinct from auth.uid() or not public.account_is_active() then
    raise exception 'Account restricted from live sessions' using errcode='42501';
  end if;
  return new;
end $$;

-- Deploy after direct-token clients have stopped. Old released credentials cannot be revoked.
do $$ begin
  if exists(select 1 from public.live_session_leases where closed_at is null and activated_at is not null and connection_id is null
    and least(hard_expires_at,idle_expires_at)>now()) then
    raise exception 'Stop active direct-token sessions before deploying server signaling';
  end if;
end $$;

create table if not exists public.live_connection_tickets (
  ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_id uuid not null references public.live_session_leases(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table if not exists public.live_proxy_connections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lease_id uuid not null references public.live_session_leases(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  guard_until timestamptz not null,
  provider_session_id text,
  provider_seconds bigint not null default 0 check(provider_seconds>=0),
  provider_started_at timestamptz,
  provider_ended_at timestamptz,
  closed_at timestamptz,
  close_confirmed boolean not null default false,
  close_reason text
);
create unique index if not exists live_proxy_one_open_connection on public.live_proxy_connections(lease_id) where closed_at is null;
create index if not exists live_tickets_lease_idx on public.live_connection_tickets(lease_id);
alter table public.live_connection_tickets enable row level security;
alter table public.live_proxy_connections enable row level security;
revoke all on public.live_connection_tickets,public.live_proxy_connections from public,anon,authenticated;
grant all on public.live_connection_tickets,public.live_proxy_connections to service_role;

create or replace function public.live_session_effective_end(p_session public.live_usage_sessions)
returns timestamptz language sql stable security definer set search_path='' as $$
  select greatest(p_session.started_at,least(now(),coalesce(p_session.ended_at,'infinity'::timestamptz),
    coalesce((select case when l.connection_id is not null then least(l.hard_expires_at,c.guard_until)
      else least(l.hard_expires_at,l.idle_expires_at,p_session.last_seen_at+interval '75 seconds') end
      from public.live_session_leases l left join public.live_proxy_connections c on c.id=l.connection_id where l.session_id=p_session.id),
      p_session.last_seen_at+interval '75 seconds')));
$$;

-- Caller holds auth.users FOR UPDATE. An unconfirmed provider connection keeps the slot
-- occupied through its entire provider cap + bounded dial window, even after a server crash.
create or replace function public.settle_expired_live_leases(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare l public.live_session_leases%rowtype; guard timestamptz; cutoff timestamptz;
begin
  for l in select * from public.live_session_leases where user_id=p_user_id and closed_at is null for update loop
    if l.connection_id is not null then
      select guard_until into guard from public.live_proxy_connections where id=l.connection_id;
      if guard is null or guard>clock_timestamp() then continue; end if;
      cutoff:=least(l.hard_expires_at,guard);
      update public.live_proxy_connections set closed_at=clock_timestamp(),close_reason='guard_expired' where id=l.connection_id and closed_at is null;
    else
      cutoff:=least(l.hard_expires_at,l.idle_expires_at);
      if cutoff>clock_timestamp() then continue; end if;
    end if;
    update public.live_usage_sessions set ended_at=case when l.activated_at is null then started_at else greatest(started_at,cutoff) end where id=l.session_id;
    update public.live_session_leases set closed_at=clock_timestamp(),closed_reason='expired',connection_id=null where id=l.id;
  end loop;
end $$;

create or replace function public.live_lease_allowance(p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.live_session_leases%rowtype; available bigint; restriction text; v_now timestamptz:=clock_timestamp();
begin
  select * into l from public.live_session_leases where id=p_lease_id;
  if not found or l.closed_at is not null then return jsonb_build_object('active',false,'code','session_expired'); end if;
  if l.stop_requested_at is not null then return jsonb_build_object('active',false,'code','session_stopped'); end if;
  select case when status='suspended' and suspended_until<=v_now then 'active' else status end into restriction from public.account_moderation where user_id=l.user_id;
  if coalesce(restriction,'active')<>'active' then return jsonb_build_object('active',false,'code','account_restricted'); end if;
  available:=greatest(0,public.account_total_credit_seconds(l.user_id)-public.account_live_seconds_used(l.user_id));
  l.hard_expires_at:=least(l.hard_expires_at,v_now+make_interval(secs=>least(available,3600)::integer));
  update public.live_session_leases set hard_expires_at=l.hard_expires_at where id=l.id;
  if available<=0 or l.hard_expires_at<=v_now then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
  return jsonb_build_object('active',true,'session_id',l.id,'metering',l.activated_at is not null,
    'remaining_seconds',greatest(0,floor(extract(epoch from(l.hard_expires_at-v_now)))),
    'balance_seconds',available,'expires_at',l.hard_expires_at,'server_now',v_now);
end $$;

create or replace function public.server_live_session(p_user_id uuid,p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.live_session_leases%rowtype; available bigint; usage_id uuid; v_now timestamptz:=clock_timestamp(); result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  if p_user_id is null or p_request_id is null or p_action is null or p_action not in('reserve','heartbeat','stop') then raise exception 'Invalid session request' using errcode='22023'; end if;
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  perform public.settle_expired_live_leases(p_user_id);
  select * into l from public.live_session_leases where id=p_request_id and user_id=p_user_id;
  if p_action='stop' then
    if found and l.closed_at is null then
      if l.connection_id is not null then
        update public.live_session_leases set stop_requested_at=v_now where id=l.id;
      else
        update public.live_usage_sessions set ended_at=case when l.activated_at is null then started_at else greatest(started_at,least(v_now,l.hard_expires_at,l.idle_expires_at)) end where id=l.session_id;
        update public.live_session_leases set closed_at=v_now,closed_reason='stopped',stop_requested_at=v_now where id=l.id;
      end if;
    end if;
    return jsonb_build_object('active',false);
  end if;
  if found and l.closed_at is not null then return jsonb_build_object('active',false,'code','session_expired'); end if;
  if exists(select 1 from public.account_moderation where user_id=p_user_id
    and (status='banned' or (status='suspended' and suspended_until>v_now))) then
    return jsonb_build_object('active',false,'code','account_restricted');
  end if;
  if p_action='reserve' and l.id is null then
    if exists(select 1 from public.live_session_leases where user_id=p_user_id and closed_at is null) then return jsonb_build_object('active',false,'code','session_in_use'); end if;
    available:=greatest(0,public.account_total_credit_seconds(p_user_id)-public.account_live_seconds_used(p_user_id));
    if available<10 then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
    insert into public.live_usage_sessions(user_id,started_at,last_seen_at,ended_at) values(p_user_id,v_now,v_now,v_now) returning id into usage_id;
    insert into public.live_session_leases(id,user_id,session_id,hard_expires_at,idle_expires_at)
      values(p_request_id,p_user_id,usage_id,v_now+make_interval(secs=>least(available,3600)::integer),v_now+interval '45 seconds') returning * into l;
  elsif l.id is null then return jsonb_build_object('active',false,'code','session_expired'); end if;
  result:=public.live_lease_allowance(l.id);
  -- Browser heartbeats never keep a claimed provider connection alive.
  if (result->>'active')::boolean and l.connection_id is null then
    update public.live_session_leases set idle_expires_at=least(hard_expires_at,v_now+interval '45 seconds') where id=l.id;
    update public.live_usage_sessions set last_seen_at=v_now where id=l.session_id;
  end if;
  return result;
end $$;

create or replace function public.server_issue_connection_ticket(p_user_id uuid,p_lease_id uuid,p_ticket_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  result:=public.server_live_session(p_user_id,p_lease_id,'heartbeat');
  if not coalesce((result->>'active')::boolean,false) then return result; end if;
  if (result->>'remaining_seconds')::integer<10 then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
  insert into public.live_connection_tickets(ticket_hash,user_id,lease_id,expires_at) values(p_ticket_hash,p_user_id,p_lease_id,clock_timestamp()+interval '15 seconds');
  return result;
end $$;

create or replace function public.server_claim_connection_ticket(p_ticket_hash text,p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.live_connection_tickets%rowtype; l public.live_session_leases%rowtype; result jsonb; available bigint; v_now timestamptz; provider_cap integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  select * into t from public.live_connection_tickets where ticket_hash=p_ticket_hash;
  if not found then return jsonb_build_object('active',false,'code','ticket_invalid'); end if;
  perform 1 from auth.users where id=t.user_id for update;
  v_now:=clock_timestamp();
  select * into t from public.live_connection_tickets where ticket_hash=p_ticket_hash for update;
  if t.consumed_at is not null or t.expires_at<=v_now then return jsonb_build_object('active',false,'code','ticket_invalid'); end if;
  update public.live_connection_tickets set consumed_at=v_now where ticket_hash=p_ticket_hash;
  perform public.settle_expired_live_leases(t.user_id);
  select * into l from public.live_session_leases where id=t.lease_id;
  result:=public.live_lease_allowance(l.id);
  if not coalesce((result->>'active')::boolean,false) then return result; end if;
  if l.connection_id is not null then return jsonb_build_object('active',false,'code','session_in_use'); end if;
  if l.activated_at is null then
    available:=greatest(0,public.account_total_credit_seconds(l.user_id)-public.account_live_seconds_used(l.user_id));
    update public.live_session_leases set activated_at=v_now,hard_expires_at=v_now+make_interval(secs=>least(available,3600)::integer) where id=l.id;
    update public.live_usage_sessions set started_at=v_now,last_seen_at=v_now,ended_at=null where id=l.session_id;
    result:=public.live_lease_allowance(l.id);
  end if;
  provider_cap:=least(300,(result->>'remaining_seconds')::integer);
  if provider_cap<10 then return jsonb_build_object('active',false,'code','insufficient_time'); end if;
  insert into public.live_proxy_connections(id,user_id,lease_id,guard_until) values(p_connection_id,t.user_id,l.id,v_now+make_interval(secs=>provider_cap+60));
  update public.live_session_leases set connection_id=p_connection_id,idle_expires_at=v_now+make_interval(secs=>provider_cap+60) where id=l.id;
  return result||jsonb_build_object('user_id',t.user_id,'connection_id',p_connection_id,'provider_cap_seconds',provider_cap);
end $$;

create or replace function public.server_check_connection(p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.live_proxy_connections%rowtype; l public.live_session_leases%rowtype; result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  select * into c from public.live_proxy_connections where id=p_connection_id;
  if not found then return jsonb_build_object('active',false,'code','session_expired'); end if;
  perform 1 from auth.users where id=c.user_id for update;
  select * into l from public.live_session_leases where id=c.lease_id;
  if c.closed_at is not null or l.connection_id is distinct from c.id or c.guard_until<=clock_timestamp() then return jsonb_build_object('active',false,'code','session_expired'); end if;
  result:=public.live_lease_allowance(c.lease_id);
  if (result->>'active')::boolean then update public.live_usage_sessions set last_seen_at=clock_timestamp() where id=l.session_id; end if;
  return result;
end $$;

create or replace function public.server_record_provider_event(p_connection_id uuid,p_event text,p_seconds bigint default null,p_provider_session_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.live_proxy_connections%rowtype; delta bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  if p_event not in('session','started','tick','ended') or p_event is null or p_seconds<0 or p_seconds>86400 or char_length(p_provider_session_id)>200 then raise exception 'Invalid provider event' using errcode='22023'; end if;
  select * into c from public.live_proxy_connections where id=p_connection_id for update;
  if not found or c.closed_at is not null then return; end if;
  delta:=greatest(0,coalesce(p_seconds,c.provider_seconds)-c.provider_seconds);
  update public.live_proxy_connections set provider_seconds=provider_seconds+delta,
    provider_session_id=coalesce(provider_session_id,p_provider_session_id),
    provider_started_at=case when p_event='started' then coalesce(provider_started_at,clock_timestamp()) else provider_started_at end,
    provider_ended_at=case when p_event='ended' then coalesce(provider_ended_at,clock_timestamp()) else provider_ended_at end where id=c.id;
  update public.live_usage_sessions set provider_seconds=provider_seconds+delta where id=(select session_id from public.live_session_leases where id=c.lease_id);
end $$;

create or replace function public.server_close_connection(p_connection_id uuid,p_confirmed boolean,p_reason text default 'disconnected')
returns void language plpgsql security definer set search_path='' as $$
declare c public.live_proxy_connections%rowtype; l public.live_session_leases%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  select * into c from public.live_proxy_connections where id=p_connection_id;
  if not found then return; end if;
  perform 1 from auth.users where id=c.user_id for update;
  select * into c from public.live_proxy_connections where id=p_connection_id for update;
  if c.closed_at is not null then return; end if;
  select * into l from public.live_session_leases where id=c.lease_id;
  if p_confirmed is not true then
    update public.live_session_leases set stop_requested_at=v_now where id=l.id;
    update public.live_proxy_connections set close_reason='unconfirmed' where id=c.id;
    return;
  end if;
  update public.live_proxy_connections set closed_at=v_now,close_confirmed=true,close_reason=left(p_reason,100) where id=c.id;
  if l.connection_id is distinct from c.id then return; end if;
  update public.live_session_leases set connection_id=null,idle_expires_at=least(hard_expires_at,v_now+interval '45 seconds') where id=l.id;
  update public.live_usage_sessions set last_seen_at=v_now where id=l.session_id;
  if l.stop_requested_at is not null or l.hard_expires_at<=v_now then
    perform public.server_live_session(c.user_id,l.id,'stop');
  end if;
end $$;

revoke all on function public.settle_expired_live_leases(uuid),public.live_lease_allowance(uuid) from public,anon,authenticated,service_role;
revoke all on function public.server_live_session(uuid,uuid,text),public.server_issue_connection_ticket(uuid,uuid,text),public.server_claim_connection_ticket(text,uuid),public.server_check_connection(uuid),public.server_record_provider_event(uuid,text,bigint,text),public.server_close_connection(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.server_live_session(uuid,uuid,text),public.server_issue_connection_ticket(uuid,uuid,text),public.server_claim_connection_ticket(text,uuid),public.server_check_connection(uuid),public.server_record_provider_event(uuid,text,bigint,text),public.server_close_connection(uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
