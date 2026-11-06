-- Run as postgres in the SQL editor. Every fixture and grant is rolled back.
begin;
do $$
declare u uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); ref uuid:=gen_random_uuid();
  r jsonb; session_ref uuid; first_spent bigint; second_spent bigint;
begin
  insert into auth.users(id,email,created_at,raw_user_meta_data) values(u,'live-enforcement-'||u||'@example.invalid',now(),
    '{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin perform public.server_live_session(u,ref,'reserve'); raise exception 'Member called server-only accounting';
    exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.start_live_usage_session()','execute')
    or has_function_privilege('authenticated','public.touch_live_usage_session(uuid)','execute')
    or has_function_privilege('authenticated','public.stop_live_usage_session(uuid)','execute') then raise exception 'Legacy browser accounting is writable'; end if;
  if has_table_privilege('authenticated','public.live_session_leases','select') then raise exception 'Private leases exposed'; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  r:=public.server_live_session(u,ref,'reserve');
  if r->>'code' is distinct from 'insufficient_time' then raise exception 'Zero balance admitted'; end if;
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,source_reference) values(u,120,'admin','test-enforcement-'||u);
  r:=public.server_live_session(u,ref,'reserve');
  if not (r->>'active')::boolean then raise exception 'Funded account denied: %',r; end if;
  r:=public.server_live_session(u,gen_random_uuid(),'reserve');
  if r->>'code' is distinct from 'session_in_use' then raise exception 'Concurrent session admitted'; end if;
  r:=public.server_live_session(u,ref,'reserve');
  if (select count(*) from public.live_session_leases where user_id=u)<>1 then raise exception 'Retry created another lease'; end if;
  if public.account_live_seconds_used(u)<>0 then raise exception 'Pending authorization was charged'; end if;
  r:=public.server_live_session(u,ref,'authorize');
  select session_id into session_ref from public.live_session_leases where id=ref;
  update public.live_usage_sessions set started_at=now()-interval '50 seconds',last_seen_at=now() where id=session_ref;
  update public.live_session_leases set hard_expires_at=now()+interval '70 seconds',idle_expires_at=now()+interval '30 seconds' where id=ref;
  r:=public.server_live_session(u,ref,'heartbeat');
  if (r->>'remaining_seconds')::integer>70 then raise exception 'Reconnect extended balance'; end if;
  first_spent:=public.account_live_seconds_used(u);
  if first_spent not between 50 and 51 then raise exception 'Server duration incorrect: %',first_spent; end if;
  r:=public.server_live_session(u,other_id,'heartbeat');
  if r->>'code' is distinct from 'session_expired' then raise exception 'Wrong reference admitted'; end if;
  perform public.server_live_session(u,ref,'stop');
  second_spent:=public.account_live_seconds_used(u);
  perform public.server_live_session(u,ref,'stop');
  if public.account_live_seconds_used(u)<>second_spent then raise exception 'Stop billed twice'; end if;
  r:=public.server_live_session(u,ref,'reserve');
  if r->>'code' is distinct from 'session_expired' then raise exception 'Closed reference reopened'; end if;
  ref:=gen_random_uuid();
  r:=public.server_live_session(u,ref,'reserve');
  if not (r->>'active')::boolean or (r->>'remaining_seconds')::integer>70 then raise exception 'Unused time was lost'; end if;
  r:=public.server_live_session(u,ref,'authorize');
  select session_id into session_ref from public.live_session_leases where id=ref;
  update public.live_usage_sessions set started_at=now()-interval '60 seconds',last_seen_at=now()-interval '60 seconds' where id=session_ref;
  update public.live_session_leases set idle_expires_at=now()-interval '15 seconds' where id=ref;
  r:=public.server_live_session(u,ref,'heartbeat');
  if r->>'code' is distinct from 'session_expired' then raise exception 'Abandoned session resurrected'; end if;
  if public.account_live_seconds_used(u)>120 then raise exception 'Balance overspent'; end if;
  -- Exhaust the exact remainder; provider reconnect/new reserve cannot add time.
  first_spent:=120-public.account_live_seconds_used(u);
  if first_spent>=10 then
    ref:=gen_random_uuid();
    r:=public.server_live_session(u,ref,'reserve');
    r:=public.server_live_session(u,ref,'authorize');
    select session_id into session_ref from public.live_session_leases where id=ref;
    update public.live_usage_sessions set started_at=now()-make_interval(secs=>(first_spent+2)::integer),last_seen_at=now() where id=session_ref;
    update public.live_session_leases set hard_expires_at=now()-interval '2 seconds' where id=ref;
    r:=public.server_live_session(u,ref,'heartbeat');
    if r->>'code' is distinct from 'session_expired' then raise exception 'Exhausted authorization revived'; end if;
    r:=public.server_live_session(u,gen_random_uuid(),'reserve');
    if r->>'code' is distinct from 'insufficient_time' then raise exception 'Exhausted account obtained another session'; end if;
    if public.account_live_seconds_used(u)<>120 then raise exception 'Exhaustion accounting disagrees'; end if;
  end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  r:=public.get_live_usage_summary();
  if (r->>'spent_seconds')::bigint<>public.account_live_seconds_used(u) then raise exception 'Member summary disagrees with server'; end if;
end; $$;
rollback;
select 'Passed: zero balance, server-only accounting, one active lease, idempotency, server timestamps, reconnects, stop, expiry, and member summary. Fixtures rolled back.' as regression_result;
