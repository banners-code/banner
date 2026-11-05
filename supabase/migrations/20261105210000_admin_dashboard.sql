begin;
create table if not exists public.live_time_adjustments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta_seconds bigint not null check(delta_seconds <> 0),
  reason text not null check(char_length(reason) between 5 and 1000),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists live_time_adjustments_user_idx on public.live_time_adjustments(user_id,created_at desc);
alter table public.live_time_adjustments enable row level security;
revoke all on public.live_time_adjustments from anon,authenticated;
grant select on public.live_time_adjustments to authenticated;
drop policy if exists "Members and admins read time adjustments" on public.live_time_adjustments;
create policy "Members and admins read time adjustments" on public.live_time_adjustments for select to authenticated using(user_id=(select auth.uid()) or public.is_support_admin());

create or replace function public.account_total_credit_seconds(p_user_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce((select sum(credit_seconds) from public.live_time_credit_grants where user_id=p_user_id),0)::bigint + coalesce((select sum(delta_seconds) from public.live_time_adjustments where user_id=p_user_id),0)::bigint;
$$;
create or replace function public.account_live_seconds_used(p_user_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(greatest(0,floor(extract(epoch from (greatest(started_at,least(now(),coalesce(ended_at,last_seen_at+interval '75 seconds')))-started_at))))),0)::bigint from public.live_usage_sessions where user_id=p_user_id;
$$;
revoke all on function public.account_total_credit_seconds(uuid),public.account_live_seconds_used(uuid) from public,anon,authenticated;

create or replace function public.admin_adjust_live_time(p_user_id uuid,p_minutes integer,p_reason text,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare existing public.live_time_adjustments%rowtype;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_minutes is null or p_minutes=0 or abs(p_minutes::bigint)>525600 or p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 or p_request_id is null then raise exception 'Enter nonzero whole minutes (maximum one year) and a reason of 5–1000 characters' using errcode='22023'; end if;
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  select * into existing from public.live_time_adjustments where id=p_request_id;
  if found then
    if existing.user_id=p_user_id and existing.actor_id=auth.uid() and existing.delta_seconds=p_minutes::bigint*60 and existing.reason=trim(p_reason) then return; end if;
    raise exception 'Adjustment reference already used' using errcode='23505';
  end if;
  if p_minutes<0 and public.account_total_credit_seconds(p_user_id)-public.account_live_seconds_used(p_user_id)<(-p_minutes::bigint*60) then raise exception 'You cannot remove more time than the account has available' using errcode='23514'; end if;
  insert into public.live_time_adjustments(id,user_id,delta_seconds,reason,actor_id) values(p_request_id,p_user_id,p_minutes::bigint*60,trim(p_reason),auth.uid());
  insert into public.admin_audit_events(actor_id,target_id,action,details) values(auth.uid(),p_user_id,'time.adjusted',jsonb_build_object('minutes',p_minutes,'reason',trim(p_reason),'request_id',p_request_id));
end; $$;

create or replace function public.admin_get_user_details(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'id',u.id,'email',u.email,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,
    'credited_seconds',public.account_total_credit_seconds(u.id),'spent_seconds',public.account_live_seconds_used(u.id),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from (select id,started_at,ended_at,greatest(0,floor(extract(epoch from (greatest(started_at,least(now(),coalesce(ended_at,last_seen_at+interval '75 seconds')))-started_at))))::bigint as duration_seconds from public.live_usage_sessions where user_id=u.id order by started_at desc limit 25) s),'[]'::jsonb),
    'deposits',coalesce((select jsonb_agg(to_jsonb(d)) from (select id,amount,currency,status,payment_reference,created_at,admin_note from public.manual_funding_requests where owner_id=u.id order by created_at desc limit 25) d),'[]'::jsonb),
    'adjustments',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,delta_seconds,reason,actor_id,created_at from public.live_time_adjustments where user_id=u.id order by created_at desc limit 25) a),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(to_jsonb(g)) from (select id,credit_seconds,source,created_at from public.live_time_credit_grants where user_id=u.id order by created_at desc limit 25) g),'[]'::jsonb)
  ) into result from auth.users u where u.id=p_user_id;
  if result is null then raise exception 'Account not found' using errcode='P0002'; end if;
  return result;
end; $$;

alter table public.funding_settings add column if not exists payment_mode text not null default 'off' check(payment_mode in ('off','manual','automatic'));
update public.funding_settings set payment_mode=case when enabled then 'manual' else 'off' end where payment_mode='off';
create or replace function public.sync_funding_payment_mode()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.payment_mode='automatic' then raise exception 'Automatic checkout is not connected. Configure products now and complete the provider integration before activating it.' using errcode='23514'; end if;
  if new.payment_mode is not distinct from old.payment_mode and new.enabled is distinct from old.enabled then new.payment_mode:=case when new.enabled then 'manual' else 'off' end; end if;
  new.enabled:=(new.payment_mode='manual');
  if new.enabled and (new.currency !~ '^[A-Z]{3}$' or char_length(trim(new.payment_instructions))=0) then raise exception 'Set a currency and payment instructions before enabling manual funding' using errcode='23514'; end if;
  return new;
end; $$;
revoke all on function public.sync_funding_payment_mode() from public,anon,authenticated;
drop trigger if exists sync_funding_payment_mode on public.funding_settings;
create trigger sync_funding_payment_mode before update on public.funding_settings for each row execute function public.sync_funding_payment_mode();

create table if not exists public.automatic_payment_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 80),
  provider text not null default 'bachs' check(provider='bachs'),
  provider_product_id text not null check(char_length(provider_product_id) between 1 and 200),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  display_amount numeric(12,2) not null check(display_amount>0),
  credit_minutes integer not null check(credit_minutes between 1 and 525600),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.automatic_payment_packs enable row level security;
revoke all on public.automatic_payment_packs from anon,authenticated;
grant select,insert,update on public.automatic_payment_packs to authenticated;
drop policy if exists "Admins manage automatic payment drafts" on public.automatic_payment_packs;
create policy "Admins manage automatic payment drafts" on public.automatic_payment_packs for all to authenticated using(public.is_support_admin()) with check(public.is_support_admin());

create table if not exists public.admin_notification_reads (
  admin_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check(char_length(event_key) between 1 and 100),
  read_at timestamptz not null default now(),
  primary key(admin_id,event_key)
);
alter table public.admin_notification_reads enable row level security;
revoke all on public.admin_notification_reads from anon,authenticated;
grant select,insert on public.admin_notification_reads to authenticated;
drop policy if exists "Admins manage own notification reads" on public.admin_notification_reads;
create policy "Admins manage own notification reads" on public.admin_notification_reads for all to authenticated using(admin_id=(select auth.uid()) and public.is_support_admin()) with check(admin_id=(select auth.uid()) and public.is_support_admin());

create or replace function public.admin_get_notifications()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  with events as (
    select 'deposit:'||id::text as event_key,'deposit' as kind,'Pending deposit from '||owner_email as title,created_at,'deposits' as destination from public.manual_funding_requests where status='pending'
    union all select 'report:'||id::text,'report','Abuse report awaiting review',created_at,'reports' from public.abuse_reports where status in ('open','reviewing')
    union all select 'message:'||m.id::text,'support','New message: '||c.subject,m.created_at,'support' from public.support_messages m join public.support_conversations c on c.id=m.conversation_id where m.sender_role='customer' and c.status='open'
    union all select 'user:'||id::text,'user','New account: '||coalesce(email,'member'),created_at,'users' from auth.users where created_at>now()-interval '7 days'
  ), recent as (select * from events order by created_at desc,event_key limit 100)
  select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.admin_notification_reads n where n.admin_id=auth.uid() and n.event_key=r.event_key)) order by r.created_at desc),'[]'::jsonb) into result from recent r;
  return result;
end; $$;
create or replace function public.admin_get_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'total_users',(select count(*) from auth.users),
    'active_users',(select count(distinct user_id) from public.live_usage_sessions where ended_at is null and last_seen_at>now()-interval '75 seconds'),
    'active_sessions',(select count(*) from public.live_usage_sessions where ended_at is null and last_seen_at>now()-interval '75 seconds'),
    'total_sessions',(select count(*) from public.live_usage_sessions),
    'spent_seconds',(select coalesce(sum(greatest(0,floor(extract(epoch from (greatest(started_at,least(now(),coalesce(ended_at,last_seen_at+interval '75 seconds')))-started_at))))),0) from public.live_usage_sessions),
    'pending_deposits',(select count(*) from public.manual_funding_requests where status='pending'),
    'open_reports',(select count(*) from public.abuse_reports where status in ('open','reviewing')),
    'open_support',(select count(*) from public.support_conversations where status='open'),
    'money',coalesce((select jsonb_agg(to_jsonb(m)) from (select currency,coalesce(sum(amount) filter(where status='approved'),0) as approved,coalesce(sum(amount) filter(where status='pending'),0) as pending from public.manual_funding_requests group by currency order by currency) m),'[]'::jsonb)
  );
end; $$;

create or replace function public.audit_admin_settings_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and public.is_support_admin() then
    insert into public.admin_audit_events(actor_id,action,details) values(auth.uid(),'settings.'||tg_table_name,jsonb_build_object('record_id',new.id));
  end if;
  return new;
end; $$;
revoke all on function public.audit_admin_settings_change() from public,anon,authenticated;
do $$ declare table_name text; begin
  foreach table_name in array array['homepage_settings','funding_settings','support_contact_settings','automatic_payment_packs'] loop
    execute format('drop trigger if exists audit_admin_settings_change on public.%I',table_name);
    execute format('create trigger audit_admin_settings_change after insert or update on public.%I for each row execute function public.audit_admin_settings_change()',table_name);
  end loop;
end; $$;

revoke all on function public.admin_adjust_live_time(uuid,integer,text,uuid),public.admin_get_user_details(uuid),public.admin_get_notifications(),public.admin_get_dashboard() from public,anon;
grant execute on function public.admin_adjust_live_time(uuid,integer,text,uuid),public.admin_get_user_details(uuid),public.admin_get_notifications(),public.admin_get_dashboard() to authenticated;

-- Account summary and user directory replacements are appended below.

create or replace function public.get_live_usage_summary()
returns jsonb
language plpgsql
stable
security definer
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
      select public.account_total_credit_seconds(viewer_id)
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


create or replace function public.admin_search_users(p_query text default '', p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_query is null or char_length(p_query)>254 or p_offset is null or p_offset<0 then raise exception 'Invalid search' using errcode='22023'; end if;
  with candidates as (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      exists(select 1 from public.support_admins a where a.user_id=u.id) as is_admin,
      case when m.status='suspended' and m.suspended_until<=now() then 'active' else coalesce(m.status,'active') end as status,
      m.reason, m.suspended_until,
      public.account_total_credit_seconds(u.id) as credited_seconds,
      coalesce((select sum(greatest(0,extract(epoch from (coalesce(s.ended_at,least(now(),s.last_seen_at+interval '75 seconds'))-s.started_at))))::bigint from public.live_usage_sessions s where s.user_id=u.id),0) as spent_seconds
    from auth.users u left join public.account_moderation m on m.user_id=u.id
    where position(lower(trim(p_query)) in lower(coalesce(u.email,'')))>0 or u.id::text=trim(p_query)
    order by u.created_at desc,u.id limit 51 offset p_offset
  )
  select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from candidates limit 50) r),'[]'::jsonb),'has_more',(select count(*)>50 from candidates)) into result;
  return result;
end; $$;


notify pgrst,'reload schema';
commit;
