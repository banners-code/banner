-- Run as postgres in the SQL editor. All fixtures and actions are rolled back.
begin;
do $$
declare member_id uuid := gen_random_uuid(); admin_id uuid;
begin
  select user_id into admin_id from public.support_admins limit 1;
  if admin_id is null then raise exception 'A designated admin is required for this regression check'; end if;
  perform set_config('kinetelle.test_admin',admin_id::text,true);
  perform set_config('kinetelle.test_member',member_id::text,true);
  insert into auth.users(id,email,raw_user_meta_data) values(member_id,'moderation-regression-'||member_id::text||'@example.invalid','{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb);
end; $$;
set local role authenticated;
do $$
declare member_id uuid := current_setting('kinetelle.test_member')::uuid;
  admin_id uuid := current_setting('kinetelle.test_admin')::uuid;
  report_id uuid;
begin
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  if public.get_account_access()->>'status' <> 'active' then raise exception 'New member must start active'; end if;
  begin perform public.admin_search_users(''); raise exception 'Member accessed admin directory'; exception when insufficient_privilege then null; end;
  begin perform public.admin_set_account_status(admin_id,'banned','Unauthorized test'); raise exception 'Member changed moderation'; exception when insufficient_privilege then null; end;
  for i in 1..5 loop report_id := public.submit_abuse_report('regression-target','Synthetic regression report, rolled back after this test.'); end loop;
  begin perform public.submit_abuse_report('regression-target','Sixth synthetic report should be blocked.'); raise exception 'Report limit was bypassed'; exception when check_violation then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  if jsonb_array_length(public.admin_search_users(member_id::text)->'users') <> 1 then raise exception 'Admin search failed'; end if;
  begin perform public.admin_set_account_status(admin_id,'banned','Protected administrator test'); raise exception 'Admin protection failed'; exception when insufficient_privilege then null; end;
  perform public.admin_set_account_status(member_id,'banned','Synthetic restriction test');
  perform public.admin_review_abuse_report(report_id,'resolved','Synthetic report review');
  if not exists(select 1 from public.admin_audit_events where target_id=member_id and action='account.banned') then raise exception 'Missing audit event'; end if;

  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  if public.get_account_access()->>'status' <> 'banned' then raise exception 'Ban was not enforced'; end if;
  if exists(select 1 from public.admin_audit_events) then raise exception 'Audit rows exposed to member'; end if;
  begin insert into public.saved_directions(user_id,title,prompt,preset_id) values(member_id,'Blocked','Blocked creative write','photorealistic-human'); raise exception 'Restricted member saved content'; exception when insufficient_privilege then null; end;
  begin perform public.start_live_usage_session(); raise exception 'Restricted member started live usage'; exception when insufficient_privilege then null; end;
  begin update public.account_moderation set status='active' where user_id=member_id; raise exception 'Member edited moderation table'; exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform public.admin_set_account_status(member_id,'active','Synthetic restoration test');
  perform public.admin_set_account_status(member_id,'suspended','Synthetic suspension test',now()+interval '1 hour');
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  if public.get_account_access()->>'status' <> 'suspended' then raise exception 'Suspension was not enforced'; end if;
end; $$;
reset role;
update public.account_moderation set suspended_until=now()-interval '1 minute' where user_id=current_setting('kinetelle.test_member')::uuid;
set local role authenticated;
do $$ begin
  if public.get_account_access()->>'status' <> 'active' then raise exception 'Expired suspension did not restore access'; end if;
end; $$;
reset role;
rollback;
select 'Passed: directory authorization, admin protection, report limit, ban/suspension/restoration, RLS, live usage, audit privacy, expiry. All fixtures rolled back.' as regression_result;
