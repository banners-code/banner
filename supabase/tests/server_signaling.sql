-- Transaction-only synthetic account. Run as postgres after the Phase 11 migration.
begin;
do $$
declare u uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid();
  r jsonb; original_deadline timestamptz; usage_id uuid;
begin
  insert into auth.users(id,email,created_at,raw_user_meta_data) values(u,'proxy-check-'||u||'@example.invalid',now(),
    '{"kinetelle_terms_version":"2026-11-05-v3","kinetelle_privacy_version":"2026-11-05-v3","kinetelle_age_over_18":true}'::jsonb);
  if has_table_privilege('authenticated','public.live_connection_tickets','select') or has_table_privilege('authenticated','public.live_proxy_connections','select') then raise exception 'Private signaling tables exposed'; end if;
  if has_function_privilege('authenticated','public.server_claim_connection_ticket(text,uuid)','execute')
    or has_function_privilege('authenticated','public.server_record_provider_event(uuid,text,bigint,text)','execute')
    or has_function_privilege('authenticated','public.server_close_connection(uuid,boolean,text)','execute') then raise exception 'Browser can control server accounting'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  if auth.uid() is not null then raise exception 'Server fixture unexpectedly has a user JWT'; end if;
  r:=public.server_live_session(u,lease,'reserve');
  if r->>'code' is distinct from 'insufficient_time' then raise exception 'Zero balance admitted'; end if;
  insert into public.live_time_credit_grants(user_id,credit_seconds,source,source_reference) values(u,180,'admin','proxy-check-'||u);
  insert into public.account_moderation(user_id,status,reason) values(u,'banned','Synthetic restriction check');
  r:=public.server_live_session(u,lease,'reserve');
  if r->>'code' is distinct from 'account_restricted' then raise exception 'Restricted server-role account admitted'; end if;
  begin insert into public.live_usage_sessions(user_id) values(u); raise exception 'Insert trigger ignored target restriction'; exception when insufficient_privilege then null; end;
  update public.account_moderation set status='active',reason='Synthetic restoration check' where user_id=u;
  r:=public.server_live_session(u,lease,'reserve');
  if not (r->>'active')::boolean or (r->>'metering')::boolean then raise exception 'Pending reservation incorrect'; end if;
  r:=public.server_issue_connection_ticket(u,lease,repeat('a',64));
  if not (r->>'active')::boolean or public.account_live_seconds_used(u)<>0 then raise exception 'Issuing an app ticket charged time'; end if;
  r:=public.server_claim_connection_ticket(repeat('a',64),c1);
  if not (r->>'active')::boolean or not (r->>'metering')::boolean then raise exception 'Claim failed: %',r; end if;
  select hard_expires_at,session_id into original_deadline,usage_id from public.live_session_leases where id=lease;
  r:=public.server_claim_connection_ticket(repeat('a',64),gen_random_uuid());
  if r->>'code' is distinct from 'ticket_invalid' then raise exception 'Ticket replay succeeded'; end if;
  perform public.server_issue_connection_ticket(u,lease,repeat('b',64));
  r:=public.server_claim_connection_ticket(repeat('b',64),gen_random_uuid());
  if r->>'code' is distinct from 'session_in_use' then raise exception 'Two provider connections admitted'; end if;
  perform public.server_record_provider_event(c1,'started');
  perform public.server_record_provider_event(c1,'tick',20,'provider-fixture');
  perform public.server_record_provider_event(c1,'tick',19);
  perform public.server_record_provider_event(c1,'tick',20);
  if (select provider_seconds from public.live_usage_sessions where id=usage_id)<>20 then raise exception 'Provider ticks counted twice'; end if;
  perform public.server_close_connection(c1,true,'provider_window');
  perform public.server_issue_connection_ticket(u,lease,repeat('c',64));
  r:=public.server_claim_connection_ticket(repeat('c',64),c2);
  if not (r->>'active')::boolean then raise exception 'Reconnect failed'; end if;
  if (select hard_expires_at from public.live_session_leases where id=lease)>original_deadline then raise exception 'Reconnect extended allowance'; end if;
  perform public.server_close_connection(c1,true,'stale_callback');
  if (select connection_id from public.live_session_leases where id=lease) is distinct from c2 then raise exception 'Stale callback cleared newer connection'; end if;
  perform public.server_issue_connection_ticket(u,lease,repeat('d',64));
  update public.live_connection_tickets set expires_at=now()-interval '1 second' where ticket_hash=repeat('d',64);
  r:=public.server_claim_connection_ticket(repeat('d',64),gen_random_uuid());
  if r->>'code' is distinct from 'ticket_invalid' then raise exception 'Expired ticket admitted'; end if;
  -- Stop does not release the slot while another server may still own the provider socket.
  perform public.server_live_session(u,lease,'stop');
  if (select closed_at from public.live_session_leases where id=lease) is not null then raise exception 'Stop released an open provider'; end if;
  r:=public.server_check_connection(c2);
  if r->>'code' is distinct from 'session_stopped' then raise exception 'Server cannot observe stop request'; end if;
  perform public.server_close_connection(c2,false,'network_lost');
  r:=public.server_live_session(u,gen_random_uuid(),'reserve');
  if r->>'code' is distinct from 'session_in_use' then raise exception 'Unconfirmed closure released balance'; end if;
  perform public.server_close_connection(c2,true,'closed');
  if (select closed_at from public.live_session_leases where id=lease) is null then raise exception 'Confirmed stop not settled'; end if;
  lease:=gen_random_uuid();
  r:=public.server_live_session(u,lease,'reserve');
  if not (r->>'active')::boolean then raise exception 'Unused time not returned'; end if;
  perform public.server_issue_connection_ticket(u,lease,repeat('e',64));
  perform public.server_claim_connection_ticket(repeat('e',64),c3);
  -- A process loss cannot release a slot based only on a browser heartbeat timeout.
  update public.live_session_leases set idle_expires_at=now()-interval '1 second' where id=lease;
  r:=public.server_live_session(u,gen_random_uuid(),'reserve');
  if r->>'code' is distinct from 'session_in_use' then raise exception 'Browser timeout bypassed provider guard'; end if;
  update public.live_proxy_connections set guard_until=now()-interval '1 second' where id=c3;
  r:=public.server_live_session(u,gen_random_uuid(),'reserve');
  if not (r->>'active')::boolean then raise exception 'Expired provider guard did not recover slot'; end if;
  if public.account_live_seconds_used(u)>180 then raise exception 'Account overspent'; end if;
  begin perform public.server_live_session(u,gen_random_uuid(),'authorize'); raise exception 'Legacy authorization still available'; exception when invalid_parameter_value then null; end;
end $$;
rollback;
select 'Passed: ticket expiry/replay, one provider connection, reconnect deadline, stale callbacks, trusted usage, confirmed stop, crash guard, zero balance, and private privileges. Fixtures rolled back.' as regression_result;
