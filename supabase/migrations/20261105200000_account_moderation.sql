begin;

create or replace function public.record_kinetelle_signup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_version text := new.raw_user_meta_data ->> 'kinetelle_terms_version';
  privacy_version text := new.raw_user_meta_data ->> 'kinetelle_privacy_version';
  age_confirmed text := new.raw_user_meta_data ->> 'kinetelle_age_over_18';
begin
  if terms_version is distinct from '2026-11-05-v3'
    or privacy_version is distinct from '2026-11-05-v3'
    or age_confirmed is distinct from 'true' then
    raise exception 'Kinetelle Terms acceptance and age confirmation are required.'
      using errcode = '23514';
  end if;

  insert into public.legal_consents (
    user_id, terms_version, privacy_version, age_confirmed, accepted_at
  ) values (
    new.id, terms_version, privacy_version, true, clock_timestamp()
  ) on conflict (user_id) do nothing;

  return new;
end;
$$;


create table if not exists public.account_moderation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active','suspended','banned')),
  reason text not null check (char_length(reason) between 5 and 1000),
  suspended_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((status = 'suspended' and suspended_until is not null) or (status <> 'suspended' and suspended_until is null))
);
create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_events_created_idx on public.admin_audit_events(created_at desc);
create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_identity text not null check (char_length(reported_identity) between 3 and 254),
  details text not null check (char_length(details) between 10 and 4000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists abuse_reports_created_idx on public.abuse_reports(created_at desc);
alter table public.account_moderation enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.abuse_reports enable row level security;
revoke all on public.account_moderation, public.admin_audit_events, public.abuse_reports from anon, authenticated;
grant select on public.account_moderation, public.admin_audit_events, public.abuse_reports to authenticated;
drop policy if exists "Read own restriction or administer" on public.account_moderation;
create policy "Read own restriction or administer" on public.account_moderation for select to authenticated using (user_id = (select auth.uid()) or public.is_support_admin());
drop policy if exists "Admins read audit history" on public.admin_audit_events;
create policy "Admins read audit history" on public.admin_audit_events for select to authenticated using (public.is_support_admin());
drop policy if exists "Report owners and admins read reports" on public.abuse_reports;
create policy "Report owners and admins read reports" on public.abuse_reports for select to authenticated using (reporter_id = (select auth.uid()) or public.is_support_admin());

create or replace function public.get_account_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare restriction public.account_moderation%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into restriction from public.account_moderation where user_id = auth.uid();
  if not found or restriction.status = 'active' or (restriction.status = 'suspended' and restriction.suspended_until <= now()) then
    return jsonb_build_object('status','active','reason',null,'suspended_until',null);
  end if;
  return jsonb_build_object('status',restriction.status,'reason',restriction.reason,'suspended_until',restriction.suspended_until);
end; $$;
create or replace function public.account_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.get_account_access()->>'status') = 'active';
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
      coalesce((select sum(g.credit_seconds) from public.live_time_credit_grants g where g.user_id=u.id),0) as credited_seconds,
      coalesce((select sum(greatest(0,extract(epoch from (coalesce(s.ended_at,least(now(),s.last_seen_at+interval '75 seconds'))-s.started_at))))::bigint from public.live_usage_sessions s where s.user_id=u.id),0) as spent_seconds
    from auth.users u left join public.account_moderation m on m.user_id=u.id
    where position(lower(trim(p_query)) in lower(coalesce(u.email,'')))>0 or u.id::text=trim(p_query)
    order by u.created_at desc,u.id limit 51 offset p_offset
  )
  select jsonb_build_object('users',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from candidates limit 50) r),'[]'::jsonb),'has_more',(select count(*)>50 from candidates)) into result;
  return result;
end; $$;

create or replace function public.admin_set_account_status(p_user_id uuid,p_status text,p_reason text,p_suspended_until timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare previous jsonb;
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('active','suspended','banned') or p_reason is null or char_length(trim(p_reason)) not between 5 and 1000 then raise exception 'Choose a status and provide a reason of 5–1000 characters' using errcode='22023'; end if;
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  if exists(select 1 from public.support_admins where user_id=p_user_id) then raise exception 'Administrator accounts cannot be restricted here' using errcode='42501'; end if;
  if p_status='suspended' and (p_suspended_until is null or p_suspended_until<=now()) then raise exception 'Choose a future suspension expiry' using errcode='22023'; end if;
  select to_jsonb(m) into previous from public.account_moderation m where user_id=p_user_id;
  insert into public.account_moderation(user_id,status,reason,suspended_until,updated_by)
  values(p_user_id,p_status,trim(p_reason),case when p_status='suspended' then p_suspended_until else null end,auth.uid())
  on conflict(user_id) do update set status=excluded.status,reason=excluded.reason,suspended_until=excluded.suspended_until,updated_by=excluded.updated_by,updated_at=now();
  if p_status <> 'active' then
    update public.live_usage_sessions set ended_at=greatest(started_at,least(now(),last_seen_at+interval '75 seconds')) where user_id=p_user_id and ended_at is null;
  end if;
  insert into public.admin_audit_events(actor_id,target_id,action,details) values(auth.uid(),p_user_id,'account.'||p_status,jsonb_build_object('previous',previous,'reason',trim(p_reason),'suspended_until',case when p_status='suspended' then p_suspended_until else null end));
end; $$;

create or replace function public.submit_abuse_report(p_identity text,p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,17));
  if (select count(*) from public.abuse_reports where reporter_id=auth.uid() and created_at>now()-interval '24 hours')>=5 then raise exception 'You can submit up to five reports per day. Contact support for urgent follow-up.' using errcode='23514'; end if;
  if p_identity is null or char_length(trim(p_identity)) not between 3 and 254 or p_details is null or char_length(trim(p_details)) not between 10 and 4000 then raise exception 'Provide an account identifier and details of the concern' using errcode='22023'; end if;
  insert into public.abuse_reports(reporter_id,reported_identity,details) values(auth.uid(),trim(p_identity),trim(p_details)) returning id into report_id;
  return report_id;
end; $$;
create or replace function public.admin_review_abuse_report(p_report_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('reviewing','resolved','dismissed') or p_note is null or char_length(trim(p_note)) not between 5 and 1000 then raise exception 'Choose a review outcome and provide a note' using errcode='22023'; end if;
  update public.abuse_reports set status=p_status,admin_note=trim(p_note),reviewed_by=auth.uid(),updated_at=now() where id=p_report_id;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  insert into public.admin_audit_events(actor_id,action,details) values(auth.uid(),'report.'||p_status,jsonb_build_object('report_id',p_report_id,'note',trim(p_note)));
end; $$;

-- Restrictive policies combine with existing owner policies, preserving data export/deletion and Support.
drop policy if exists "Active accounts create preferences" on public.studio_preferences;
create policy "Active accounts create preferences" on public.studio_preferences as restrictive for insert to authenticated with check(public.account_is_active());
drop policy if exists "Active accounts update preferences" on public.studio_preferences;
create policy "Active accounts update preferences" on public.studio_preferences as restrictive for update to authenticated using(public.account_is_active()) with check(public.account_is_active());
drop policy if exists "Active accounts create directions" on public.saved_directions;
create policy "Active accounts create directions" on public.saved_directions as restrictive for insert to authenticated with check(public.account_is_active());
drop policy if exists "Active accounts update directions" on public.saved_directions;
create policy "Active accounts update directions" on public.saved_directions as restrictive for update to authenticated using(public.account_is_active()) with check(public.account_is_active());
drop policy if exists "Active accounts submit funding" on public.manual_funding_requests;
create policy "Active accounts submit funding" on public.manual_funding_requests as restrictive for insert to authenticated with check(public.account_is_active());
drop policy if exists "Active accounts upload payment proofs" on storage.objects;
create policy "Active accounts upload payment proofs" on storage.objects as restrictive for insert to authenticated with check(bucket_id <> 'payment-proofs' or public.account_is_active());

create or replace function public.check_live_usage_account_access()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.account_is_active() then raise exception 'Account restricted from live sessions' using errcode='42501'; end if;
  return new;
end; $$;
revoke all on function public.check_live_usage_account_access() from public,anon,authenticated;
drop trigger if exists check_live_usage_account_access on public.live_usage_sessions;
create trigger check_live_usage_account_access before insert on public.live_usage_sessions for each row execute function public.check_live_usage_account_access();

revoke all on function public.get_account_access(),public.account_is_active(),public.admin_search_users(text,integer),public.admin_set_account_status(uuid,text,text,timestamptz),public.submit_abuse_report(text,text),public.admin_review_abuse_report(uuid,text,text) from public,anon;
grant execute on function public.get_account_access(),public.account_is_active(),public.admin_search_users(text,integer),public.admin_set_account_status(uuid,text,text,timestamptz),public.submit_abuse_report(text,text),public.admin_review_abuse_report(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
