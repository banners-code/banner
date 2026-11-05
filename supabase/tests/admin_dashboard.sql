-- All synthetic accounts, deposits, notifications, and adjustments are rolled back.
begin;
do $$
declare member_id uuid:=gen_random_uuid(); admin_id uuid; baseline jsonb;
begin
  select user_id into admin_id from public.support_admins limit 1;
  if admin_id is null then raise exception 'A designated admin is required'; end if;
  perform set_config('kinetelle.dashboard_admin',admin_id::text,true);
  perform set_config('kinetelle.dashboard_member',member_id::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  baseline:=public.admin_get_dashboard();
  perform set_config('kinetelle.dashboard_baseline',baseline::text,true);
  insert into auth.users(id,email,raw_user_meta_data,created_at) values(member_id,'dashboard-regression-'||member_id::text||'@example.invalid','{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb,now());
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,source_reference) values(member_id,600,'admin','regression:'||member_id::text);
  insert into public.automatic_payment_packs(name,provider_product_id,currency,display_amount,credit_minutes) values('Synthetic private product','regression-product','NGN',100,10);
  insert into public.manual_funding_requests(owner_id,owner_email,amount,currency,payment_reference,proof_object_path,status,credits_granted_seconds,reviewed_by,reviewed_at) values
    (member_id,'regression@example.invalid',100,'NGN','synthetic',member_id::text||'/test.png','approved',60,admin_id,now()),
    (member_id,'regression@example.invalid',2,'USD','synthetic',member_id::text||'/test.png','approved',60,admin_id,now()),
    (member_id,'regression@example.invalid',50,'NGN','synthetic',member_id::text||'/test.png','pending',null,null,null);
end; $$;
set local role authenticated;
do $$
declare member_id uuid:=current_setting('kinetelle.dashboard_member')::uuid;
  admin_id uuid:=current_setting('kinetelle.dashboard_admin')::uuid;
  reference_id uuid:=gen_random_uuid(); pending_request uuid; stats jsonb; baseline jsonb:=current_setting('kinetelle.dashboard_baseline')::jsonb; old_ngn numeric; old_usd numeric; new_ngn numeric; new_usd numeric;
begin
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  begin perform public.admin_get_dashboard(); raise exception 'Member read admin dashboard'; exception when insufficient_privilege then null; end;
  begin perform public.admin_get_user_details(admin_id); raise exception 'Member read another account details'; exception when insufficient_privilege then null; end;
  begin perform public.admin_adjust_live_time(member_id,10,'Unauthorized time grant',reference_id); raise exception 'Member granted time'; exception when insufficient_privilege then null; end;
  begin perform public.admin_get_notifications(); raise exception 'Member read admin notifications'; exception when insufficient_privilege then null; end;
  if exists(select 1 from public.automatic_payment_packs) then raise exception 'Automatic drafts exposed to member'; end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.admin_adjust_live_time(member_id,10,'Synthetic live-time addition',reference_id);
  perform public.admin_adjust_live_time(member_id,10,'Synthetic live-time addition',reference_id);
  if (public.admin_get_user_details(member_id)->>'credited_seconds')::bigint<>1200 then raise exception 'Time addition was not idempotent'; end if;
  begin perform public.admin_adjust_live_time(member_id,11,'Synthetic live-time addition',reference_id); raise exception 'Conflicting reference accepted'; exception when unique_violation then null; end;
  begin perform public.admin_adjust_live_time(member_id,-21,'Excessive removal test',gen_random_uuid()); raise exception 'Excessive removal accepted'; exception when check_violation then null; end;
  perform public.admin_adjust_live_time(member_id,-5,'Synthetic live-time removal',gen_random_uuid());
  if (public.admin_get_user_details(member_id)->>'credited_seconds')::bigint<>900 then raise exception 'Time removal failed'; end if;
  stats:=public.admin_get_dashboard();
  if (stats->>'total_users')::bigint<>(baseline->>'total_users')::bigint+1 then raise exception 'User total incorrect'; end if;
  if (stats->>'pending_deposits')::bigint<>(baseline->>'pending_deposits')::bigint+1 then raise exception 'Pending deposit total incorrect'; end if;
  select coalesce(sum((m->>'approved')::numeric),0) into old_ngn from jsonb_array_elements(baseline->'money') m where m->>'currency'='NGN';
  select coalesce(sum((m->>'approved')::numeric),0) into old_usd from jsonb_array_elements(baseline->'money') m where m->>'currency'='USD';
  select coalesce(sum((m->>'approved')::numeric),0) into new_ngn from jsonb_array_elements(stats->'money') m where m->>'currency'='NGN';
  select coalesce(sum((m->>'approved')::numeric),0) into new_usd from jsonb_array_elements(stats->'money') m where m->>'currency'='USD';
  if new_ngn-old_ngn<>100 or new_usd-old_usd<>2 then raise exception 'Deposit currencies were combined incorrectly'; end if;
  if not exists(select 1 from public.admin_audit_events where target_id=member_id and action='time.adjusted') then raise exception 'Time audit missing'; end if;
  insert into public.admin_notification_reads(admin_id,event_key) values(admin_id,'user:'||member_id::text);
  if not exists(select 1 from jsonb_array_elements(public.admin_get_notifications()) n where n->>'event_key'='user:'||member_id::text and (n->>'read')::boolean) then raise exception 'Notification read state missing'; end if;
  update public.funding_settings set payment_mode='manual',enabled=true,currency='NGN',payment_instructions='Synthetic instructions only' where id=1;
  if not (select enabled from public.funding_settings where id=1) then raise exception 'Manual mode not enabled'; end if;
  update public.funding_settings set payment_mode='off',enabled=false where id=1;
  if (select enabled from public.funding_settings where id=1) then raise exception 'Off mode not enforced'; end if;
  begin update public.funding_settings set payment_mode='automatic' where id=1; raise exception 'Unconnected automatic mode enabled'; exception when check_violation then null; end;
  select id into pending_request from public.manual_funding_requests where owner_id=member_id and status='pending' limit 1;
  perform public.review_manual_funding_request(pending_request,'rejected','Synthetic review audit check',null);
  if not exists(select 1 from public.admin_audit_events where target_id=member_id and action='deposit.rejected') then raise exception 'Deposit review audit missing'; end if;

  perform set_config('request.jwt.claim.sub',member_id::text,true);
  if (public.get_live_usage_summary()->>'credited_seconds')::bigint<>900 then raise exception 'Member balance did not include adjustments'; end if;
  begin update public.live_time_adjustments set delta_seconds=1 where user_id=member_id; raise exception 'Member changed the time ledger'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'Passed: admin authorization, time ledger/idempotency/removal, member balances, separate currency totals, notifications, and payment-mode guards. Fixtures rolled back.' as regression_result;
