-- Run as postgres after both customer-pricing migrations. No fixture or setting persists.
begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); admin_id uuid;
  t timestamptz:=now()-interval '10 days'; b jsonb; q jsonb; request_id uuid; r public.manual_funding_requests%rowtype;
  pack_id uuid:='a0600000-0000-4000-8000-000000000005'; lease uuid:=gen_random_uuid(); result jsonb;
begin
  select user_id into admin_id from public.support_admins limit 1;
  if admin_id is null then raise exception 'An existing admin is required for the transaction-only test'; end if;
  insert into auth.users(id,email,created_at,raw_user_meta_data) select x,'pricing-'||x||'@example.invalid',now(),
    '{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb from unnest(array[u,v,legacy]) x;
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claim.role','service_role',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  -- Older permanent grant plus newer purchased pack: purchased time must be used first.
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,created_at,expires_at) values
    (u,600,'admin',t,null),(u,300,'admin',t+interval '1 day',t+interval '3 days');
  insert into public.live_usage_sessions(user_id,started_at,last_seen_at,ended_at) values(u,t+interval '2 days',t+interval '2 days 2 minutes',t+interval '2 days 2 minutes');
  b:=public.account_credit_balance(u,t+interval '2 days 1 hour');
  if (b->>'available_seconds')::int<>780 or (b->'expiring_credits'->0->>'remaining_seconds')::int<>180 then raise exception 'Soonest-expiring allocation incorrect: %',b; end if;
  b:=public.account_credit_balance(u,t+interval '4 days');
  if (b->>'available_seconds')::int<>600 or (b->>'expired_seconds')::int<>180 then raise exception 'Expiry double charged consumed time: %',b; end if;
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,created_at,expires_at) values(u,120,'admin',t+interval '5 days',t+interval '7 days');
  insert into public.live_usage_sessions(user_id,started_at,last_seen_at,ended_at) values(u,t+interval '6 days',t+interval '6 days 1 minute',t+interval '6 days 1 minute');
  b:=public.account_credit_balance(u);
  if (b->>'available_seconds')::int<>600 or (b->>'expired_seconds')::int<>240 then raise exception 'New funding resurrected expired time: %',b; end if;
  if public.account_total_credit_seconds(u)-public.account_live_seconds_used(u)<>600 or public.account_lifetime_credit_seconds(u)<>1020 then raise exception 'Authorization/lifetime summary incorrect'; end if;
  insert into public.live_time_adjustments(id,user_id,delta_seconds,reason,created_at) values(gen_random_uuid(),u,-60,'Synthetic removal',t+interval '8 days');
  if (public.account_credit_balance(u)->>'available_seconds')::int<>540 then raise exception 'Audited removal incorrect'; end if;
  -- Historical use before grant still offsets the old non-expiring ledger.
  insert into public.live_usage_sessions(user_id,started_at,last_seen_at,ended_at) values(legacy,t,t+interval '30 seconds',t+interval '30 seconds');
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,created_at) values(legacy,300,'admin',t+interval '1 day');
  if (public.account_credit_balance(legacy)->>'available_seconds')::int<>270 then raise exception 'Legacy balance changed'; end if;
  -- A near-expiry purchase caps a provider authorization even with a large balance.
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,expires_at) values(v,600,'admin',now()+interval '60 seconds');
  result:=public.server_live_session(v,lease,'reserve');
  if not (result->>'active')::boolean or (result->>'expires_at')::timestamptz>now()+interval '60 seconds' then raise exception 'Lease exceeded credit validity: %',result; end if;
  -- Draft pricing and private cost estimates must not be visible to a member.
  update public.billing_pricing set enabled=false where id=1;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','pricing-'||u||'@example.invalid','role','authenticated')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.billing_pricing)<>0 or (select count(*) from public.billing_cost_estimates)<>0 or (select count(*) from public.pricing_time_packs)<>0 then raise exception 'Member can read drafts/costs'; end if;
  begin perform public.admin_save_pricing('USD',2,false,.02,1,0,0,14);raise exception using message='Member changed pricing',errcode='ZX001';exception when insufficient_privilege then null;end;
  begin insert into public.funding_price_quotes(owner_id,currency,amount,credit_seconds,price_per_minute,validity_days) values(u,'USD',1,100000,2,14);raise exception using message='Member forged quote',errcode='ZX001';exception when insufficient_privilege then null;end;
  execute 'reset role';
  -- Publish only inside this rolled-back transaction, using the existing admin.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  update public.funding_settings set enabled=false,payment_mode='off',currency='USD',minimum_amount=0,payment_instructions='Synthetic transaction-only test' where id=1;
  perform public.admin_save_pricing('USD',2,true,.02,1,0,0,14);
  update public.funding_settings set enabled=true,payment_mode='manual' where id=1;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','pricing-'||u||'@example.invalid','role','authenticated')::text,true);
  execute 'set local role authenticated';
  q:=public.create_funding_price_quote(10,pack_id);
  if (q->>'credit_seconds')::int<>300 or (q->>'validity_days')::int<>3 then raise exception 'Pack quote incorrect: %',q; end if;
  insert into public.manual_funding_requests(owner_id,owner_email,amount,currency,payment_reference,proof_object_path,quote_id,quoted_credit_seconds,quoted_validity_days)
    values(u,'pricing-'||u||'@example.invalid',10,'USD','SYNTHETIC',u||'/test.png',(q->>'id')::uuid,9999999,9999) returning id into request_id;
  execute 'reset role';
  select * into r from public.manual_funding_requests where id=request_id;
  if r.quoted_credit_seconds<>300 or r.quoted_validity_days<>3 or r.credits_expire_at is not null then raise exception 'Browser forged quote allocation or started expiry early';end if;
  -- A later rate/validity change cannot rewrite the submitted quote.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform public.admin_save_pricing('USD',3,true,.02,1,0,0,20);
  if (select amount from public.pricing_time_packs where id=pack_id)<>15 then raise exception 'Standard packs did not follow selling rate';end if;
  begin perform public.review_manual_funding_request(request_id,'approved','',600);raise exception using message='Admin overrode saved quote',errcode='ZX001';exception when raise_exception then null;end;
  perform public.review_manual_funding_request(request_id,'approved','Synthetic approval',300);
  select * into r from public.manual_funding_requests where id=request_id;
  if r.credits_granted_seconds<>300 or abs(extract(epoch from(r.credits_expire_at-r.reviewed_at))-3*86400)>1 then raise exception 'Approval did not start saved three-day validity';end if;
  if not exists(select 1 from public.live_time_credit_grants where source_reference='manual-funding:'||request_id and expires_at=r.credits_expire_at and credit_seconds=300) then raise exception 'Grant expiry differs from request';end if;
  begin perform public.review_manual_funding_request(request_id,'approved','',300);raise exception using message='Repeated approval granted twice',errcode='ZX001';exception when raise_exception then null;end;
  if (select count(*) from public.live_time_credit_grants where source_reference='manual-funding:'||request_id)<>1 then raise exception 'Duplicate grant';end if;
  -- Active quote currency lock prevents sending members stale payment details.
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  q:=public.create_funding_price_quote(15,pack_id);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  begin perform public.admin_save_pricing('NGN',2,false,.02,1,0,0,14);raise exception using message='Currency lock ignored',errcode='ZX001';exception when raise_exception then null;end;
  update public.funding_price_quotes set expires_at=clock_timestamp()-interval '1 second' where id=(q->>'id')::uuid;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','pricing-'||u||'@example.invalid','role','authenticated')::text,true);
  begin insert into public.manual_funding_requests(owner_id,owner_email,amount,currency,payment_reference,proof_object_path,quote_id)
    values(u,'pricing-'||u||'@example.invalid',15,'USD','EXPIRED',u||'/test.png',(q->>'id')::uuid);raise exception using message='Expired quote accepted',errcode='ZX001';exception when raise_exception then null;end;
  b:=public.get_live_usage_summary();
  if not b ? 'expiring_credits' or not b ? 'lifetime_credited_seconds' then raise exception 'Member expiry summary missing';end if;
end; $$;
rollback;
select 'Passed: pricing RLS, immutable quotes, standard pack repricing, approval validity, duplicate prevention, earliest expiry consumption, legacy credits, balance enforcement and provider expiry cutoff. All fixtures and settings rolled back.' as regression_result;
