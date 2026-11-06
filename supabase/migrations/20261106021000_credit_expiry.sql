begin;
create index if not exists live_time_grant_expiry_idx on public.live_time_credit_grants(user_id,expires_at) where expires_at is not null;
-- Immutable ledgers remain the source of truth. Replay funding/expiry boundaries,
-- consuming the soonest-expiring valid lot first. No historical grants are changed.
create or replace function public.debit_credit_lots(p_lots jsonb,p_amount numeric)
returns jsonb language plpgsql immutable set search_path='' as $$
declare row record; remaining numeric:=greatest(0,p_amount); take numeric;
begin
  for row in select value,ordinality-1 as idx from jsonb_array_elements(p_lots) with ordinality
    order by coalesce(value->>'expires_at','infinity')::timestamptz,ordinality loop
    exit when remaining<=0;
    take:=least(remaining,(row.value->>'remaining')::numeric);
    p_lots:=jsonb_set(p_lots,array[row.idx::text,'remaining'],to_jsonb((row.value->>'remaining')::numeric-take));
    remaining:=remaining-take;
  end loop;
  return jsonb_build_object('lots',p_lots,'uncovered',remaining);
end $$;

create or replace function public.account_lifetime_credit_seconds(p_user_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce((select sum(credit_seconds) from public.live_time_credit_grants where user_id=p_user_id),0)::bigint
    +coalesce((select sum(delta_seconds) from public.live_time_adjustments where user_id=p_user_id),0)::bigint;
$$;
create or replace function public.account_credit_balance(p_user_id uuid,p_asof timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare boundary timestamptz; previous timestamptz; event record; lot record; lots jsonb:='[]'::jsonb; debit jsonb;
  spent numeric; debt numeric:=0; amount numeric; pay_debt numeric; expired numeric:=0; available numeric; upcoming jsonb;
begin
  select least(p_asof,
    coalesce((select min(started_at) from public.live_usage_sessions where user_id=p_user_id),p_asof),
    coalesce((select min(created_at) from public.live_time_credit_grants where user_id=p_user_id),p_asof),
    coalesce((select min(created_at) from public.live_time_adjustments where user_id=p_user_id),p_asof)) - interval '1 microsecond' into previous;
  for boundary in select t from (
    select created_at as t from public.live_time_credit_grants where user_id=p_user_id and created_at<=p_asof
    union select expires_at from public.live_time_credit_grants where user_id=p_user_id and expires_at<=p_asof
    union select created_at from public.live_time_adjustments where user_id=p_user_id and created_at<=p_asof
    union select p_asof) points order by t loop
    select coalesce(sum(
      greatest(0,ceil(extract(epoch from (least(boundary,public.live_session_effective_end(s))-s.started_at))))
      -greatest(0,ceil(extract(epoch from (least(previous,public.live_session_effective_end(s))-s.started_at))))),0)
      into spent from public.live_usage_sessions s where user_id=p_user_id;
    debit:=public.debit_credit_lots(lots,spent);lots:=debit->'lots';debt:=debt+(debit->>'uncovered')::numeric;
    for lot in select value,ordinality-1 as idx from jsonb_array_elements(lots) with ordinality loop
      if (lot.value->>'expires_at')::timestamptz<=boundary and (lot.value->>'remaining')::numeric>0 then
        expired:=expired+(lot.value->>'remaining')::numeric;
        lots:=jsonb_set(lots,array[lot.idx::text,'remaining'],'0'::jsonb);
      end if;
    end loop;
    for event in select credit_seconds as delta,expires_at,id,1 as kind from public.live_time_credit_grants where user_id=p_user_id and created_at=boundary
      union all select delta_seconds,null,id,2 from public.live_time_adjustments where user_id=p_user_id and created_at=boundary order by kind,id loop
      if event.delta>0 then
        amount:=event.delta;pay_debt:=least(debt,amount);debt:=debt-pay_debt;amount:=amount-pay_debt;
        lots:=lots||jsonb_build_array(jsonb_build_object('id',event.id,'remaining',amount,'expires_at',event.expires_at));
        if event.expires_at<=boundary then expired:=expired+amount;lots:=jsonb_set(lots,array[(jsonb_array_length(lots)-1)::text,'remaining'],'0'::jsonb); end if;
      else
        debit:=public.debit_credit_lots(lots,-event.delta);lots:=debit->'lots';debt:=debt+(debit->>'uncovered')::numeric;
      end if;
    end loop;
    previous:=boundary;
  end loop;
  select coalesce(sum((value->>'remaining')::numeric),0) into available from jsonb_array_elements(lots);
  select coalesce(jsonb_agg(jsonb_build_object('remaining_seconds',floor((value->>'remaining')::numeric),'expires_at',value->>'expires_at') order by (value->>'expires_at')::timestamptz),'[]'::jsonb)
    into upcoming from jsonb_array_elements(lots) where value->>'expires_at' is not null and (value->>'remaining')::numeric>0;
  return jsonb_build_object('available_seconds',greatest(0,floor(available)),'expired_seconds',floor(expired),'expiring_credits',upcoming);
end $$;

-- Existing authorization functions subtract spent from this private helper. Returning
-- spent + spendable balance preserves that boundary while excluding expired leftovers.
create or replace function public.account_total_credit_seconds(p_user_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select public.account_live_seconds_used(p_user_id)+(public.account_credit_balance(p_user_id)->>'available_seconds')::bigint;
$$;

-- Add lifetime totals and expiry information without changing prior session history.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.get_live_usage_summary()'::regprocedure);
  if position('lifetime_credited_seconds' in definition)=0 then
    definition:=replace(definition,'''credited_seconds'',','''lifetime_credited_seconds'',public.account_lifetime_credit_seconds(auth.uid()),''expired_seconds'',(public.account_credit_balance(auth.uid())->>''expired_seconds'')::bigint,''expiring_credits'',public.account_credit_balance(auth.uid())->''expiring_credits'',''credited_seconds'',');
  end if;
  execute definition;
  definition:=pg_get_functiondef('public.admin_get_user_details(uuid)'::regprocedure);
  if position('lifetime_credited_seconds' in definition)=0 then
    definition:=replace(definition,'''credited_seconds'',','''lifetime_credited_seconds'',public.account_lifetime_credit_seconds(p_user_id),''credited_seconds'',');
  end if;
  execute definition;
  -- Bound provider authorizations by the first remaining credit expiry as well as
  -- the balance. A connection cannot outlive a purchased pack's validity.
  definition:=pg_get_functiondef('public.live_lease_allowance(uuid)'::regprocedure);
  if position('expiring_credits' in definition)=0 then
    definition:=replace(definition,'l.hard_expires_at:=least(l.hard_expires_at,',
      'l.hard_expires_at:=least(l.hard_expires_at,coalesce((select min((value->>''expires_at'')::timestamptz) from jsonb_array_elements(public.account_credit_balance(l.user_id)->''expiring_credits'')),''infinity''::timestamptz),');
  end if;
  execute definition;
end $$;
revoke all on function public.debit_credit_lots(jsonb,numeric),public.account_lifetime_credit_seconds(uuid),public.account_credit_balance(uuid,timestamptz),public.account_total_credit_seconds(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
