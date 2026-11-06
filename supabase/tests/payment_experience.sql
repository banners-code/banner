-- Transaction-only checks. Run as postgres; real settings and balances are restored.
begin;
do $$
declare u uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); admin_id uuid; q jsonb; next_q jsonb; foreign_q jsonb; request_id uuid; result jsonb;
begin
  select user_id into admin_id from public.support_admins limit 1;
  if admin_id is null then raise exception 'An existing admin is required';end if;
  insert into auth.users(id,email,created_at,raw_user_meta_data) select x,'payment-flow-'||x||'@example.invalid',now(),
    '{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb from unnest(array[u,other_id]) x;
  perform set_config('request.jwt.claim.role','authenticated',true);perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  update public.billing_pricing set enabled=false where id=1;
  update public.funding_settings set enabled=false,payment_mode='off',currency='NGN',exchange_base_currency='USD',exchange_rate=1380,minimum_amount=8500,payment_instructions='Synthetic bank instructions',bank_name='Saved bank',account_name='Test account',account_number='1234567890' where id=1;
  perform public.admin_save_pricing('USD',2,true,.02,1,0,0,14);
  update public.funding_settings set enabled=true,payment_mode='manual' where id=1;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','payment-flow-'||u||'@example.invalid','role','authenticated')::text,true);
  q:=public.create_funding_price_quote(10,'a0600000-0000-4000-8000-000000000005');
  if q->>'currency'<>'NGN' or (q->>'amount')::numeric<>13800 or (q->>'listed_amount')::numeric<>10 or q->>'listed_currency'<>'USD' or (q->>'payment_exchange_rate')::numeric<>1380 or (q->>'credit_seconds')::int<>300 then raise exception 'USD/NGN quote incorrect: %',q;end if;
  next_q:=public.create_funding_price_quote(20,'a0600000-0000-4000-8000-000000000010');if (next_q->>'amount')::numeric<>27600 then raise exception '10-minute quote incorrect';end if;
  next_q:=public.create_funding_price_quote(40,'a0600000-0000-4000-8000-000000000020');if (next_q->>'amount')::numeric<>55200 then raise exception '20-minute quote incorrect';end if;
  begin perform public.create_funding_price_quote(1,'a0600000-0000-4000-8000-000000000005');raise exception using message='Forged listed price accepted',errcode='ZX001';exception when raise_exception then null;end;
  -- Rate and bank edits affect new quotes only. Existing USD-listing quotes do not block saving USD pricing.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  update public.funding_settings set exchange_rate=1500,bank_name='Changed bank' where id=1;
  perform public.admin_save_pricing('USD',2,true,.02,1,0,0,14);
  if (select amount from public.funding_price_quotes where id=(q->>'id')::uuid)<>13800 or (select payment_details->>'bank_name' from public.funding_price_quotes where id=(q->>'id')::uuid)<>'Saved bank' then raise exception 'Existing quote changed with settings';end if;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','payment-flow-'||u||'@example.invalid','role','authenticated')::text,true);
  next_q:=public.create_funding_price_quote(10,'a0600000-0000-4000-8000-000000000005');if (next_q->>'amount')::numeric<>15000 then raise exception 'New quote ignored changed exchange rate';end if;
  perform set_config('request.jwt.claim.sub',other_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  foreign_q:=public.create_funding_price_quote(40,'a0600000-0000-4000-8000-000000000020');
  result:=public.get_open_funding_quote();if result->>'id'<>foreign_q->>'id' then raise exception 'Resume quote owner mismatch';end if;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','payment-flow-'||u||'@example.invalid','role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.get_open_funding_quote();if result->>'id'<>next_q->>'id' then raise exception 'Another user quote leaked';end if;
  if exists(select 1 from public.funding_price_quotes where owner_id=other_id) then raise exception 'Quote RLS leaked another account';end if;
  begin insert into public.manual_funding_requests(owner_id,owner_email,amount,currency,payment_reference,proof_object_path,quote_id) values(u,'payment-flow-'||u||'@example.invalid',10,'USD','FORGED',u||'/test.png',(q->>'id')::uuid);raise exception using message='Paid/listed currency confused',errcode='ZX001';exception when raise_exception then null;end;
  insert into public.manual_funding_requests(owner_id,owner_email,amount,currency,payment_reference,proof_object_path,quote_id,quoted_exchange_rate) values(u,'payment-flow-'||u||'@example.invalid',15000,'NGN','SYNTHETIC',u||'/test.png',(next_q->>'id')::uuid,1) returning id into request_id;
  result:=public.get_open_funding_quote();if result->>'id'=next_q->>'id' then raise exception 'Submitted quote offered for reuse';end if;
  execute 'reset role';
  if (select quoted_exchange_rate from public.manual_funding_requests where id=request_id)<>1500 or (select quoted_listed_currency from public.manual_funding_requests where id=request_id)<>'USD' then raise exception 'Forged exchange snapshot accepted';end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform public.review_manual_funding_request(request_id,'approved','Synthetic FX approval',300);
  if not exists(select 1 from public.live_time_credit_grants where user_id=u and source_reference='manual-funding:'||request_id and credit_seconds=300 and expires_at>now()+interval '2 days 23 hours') then raise exception 'Converted payment did not grant saved time/validity';end if;
  begin update public.funding_settings set currency='GHS',exchange_base_currency='USD',exchange_rate=10 where id=1;raise exception using message='Receiving currency changed while quotes pending',errcode='ZX001';exception when raise_exception then null;end;
  if has_function_privilege('anon','public.get_open_funding_quote()','execute') then raise exception 'Anonymous quote access';end if;
end $$;
rollback;
select 'Passed: 1380 NGN/USD conversion, immutable FX/bank snapshots, repricing, owner-only resume, consumed quote exclusion, currency validation, forged amount/rate rejection and approved time validity. All fixtures and settings rolled back.' as regression_result;
