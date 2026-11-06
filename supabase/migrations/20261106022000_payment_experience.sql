begin;
alter table public.funding_settings add column if not exists exchange_base_currency text not null default '' check(exchange_base_currency='' or exchange_base_currency ~ '^[A-Z]{3}$');
alter table public.funding_settings add column if not exists exchange_rate numeric(18,6) check(exchange_rate>0 and exchange_rate<=1000000000);
alter table public.funding_settings add column if not exists bank_name text not null default '' check(char_length(bank_name)<=120);
alter table public.funding_settings add column if not exists account_name text not null default '' check(char_length(account_name)<=180);
alter table public.funding_settings add column if not exists account_number text not null default '' check(char_length(account_number)<=80);
alter table public.funding_settings add column if not exists review_notice text not null default 'Your receipt is reviewed by our team. Live time is added after payment is verified.' check(char_length(review_notice)<=500);
-- Explicit owner-approved initial USD/NGN rate. Preserve later administrator changes.
update public.funding_settings set exchange_base_currency='USD',exchange_rate=1380 where currency='NGN' and exchange_rate is null and exchange_base_currency='';
alter table public.funding_price_quotes add column if not exists listed_currency text;
alter table public.funding_price_quotes add column if not exists listed_amount numeric(12,2);
alter table public.funding_price_quotes add column if not exists payment_exchange_rate numeric(18,6);
alter table public.funding_price_quotes add column if not exists payment_details jsonb;
alter table public.manual_funding_requests add column if not exists quoted_listed_currency text;
alter table public.manual_funding_requests add column if not exists quoted_listed_amount numeric(12,2);
alter table public.manual_funding_requests add column if not exists quoted_exchange_rate numeric(18,6);
create or replace function public.admin_save_pricing(p_currency text,p_price_per_minute numeric,p_enabled boolean,p_provider_cost numeric,p_fx numeric,p_fee numeric,p_other_cost numeric,p_validity_days integer default 14)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_price_per_minute is null or p_price_per_minute<=0 or p_price_per_minute>100000000
    or p_enabled is null or p_provider_cost is null or p_provider_cost<0 or p_provider_cost>1000000 or p_fx is null or p_fx<=0 or p_fx>1000000000
    or p_fee is null or p_fee<0 or p_fee>=100 or p_other_cost is null or p_other_cost<0 or p_other_cost>100000000
    or p_validity_days is null or p_validity_days not between 1 and 3650 then raise exception 'Enter valid prices, currency, and cost estimates' using errcode='22023'; end if;
  perform 1 from public.billing_pricing where id=1 for update;
  if exists(select 1 from public.funding_price_quotes q where q.expires_at>clock_timestamp() and coalesce(q.listed_currency,q.currency)<>p_currency and not exists(select 1 from public.manual_funding_requests r where r.quote_id=q.id)) then
    raise exception 'Wait for outstanding 24-hour payment quotes before changing currency'; end if;
  if p_enabled and exists(select 1 from public.funding_settings where enabled and currency<>p_currency and (exchange_base_currency<>p_currency or exchange_rate is null)) then raise exception 'Set a manual-payment exchange rate for this pricing currency before publishing'; end if;
  update public.billing_pricing set currency=p_currency,price_per_minute=p_price_per_minute,enabled=p_enabled,default_validity_days=p_validity_days,updated_at=clock_timestamp() where id=1;
  update public.pricing_time_packs set amount=round(p_price_per_minute*credit_seconds/60,2),currency=p_currency,updated_at=clock_timestamp() where use_standard_rate;
  update public.billing_cost_estimates set provider_usd_per_second=p_provider_cost,currency_units_per_usd=case when p_currency='USD' then 1 else p_fx end,payment_fee_percent=p_fee,other_cost_per_minute=p_other_cost where id=1;
end $$;


create or replace function public.guard_funding_currency()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.enabled and exists(select 1 from public.billing_pricing where enabled and currency<>new.currency and (currency<>new.exchange_base_currency or new.exchange_rate is null)) then raise exception 'Set the exchange rate from the published pricing currency to the manual payment currency'; end if;
  if old.currency is distinct from new.currency and exists(select 1 from public.funding_price_quotes q where q.expires_at>clock_timestamp() and q.currency<>new.currency and not exists(select 1 from public.manual_funding_requests r where r.quote_id=q.id)) then raise exception 'Outstanding quotes lock the receiving currency for up to 24 hours'; end if;
  return new;
end $$;

create or replace function public.create_funding_price_quote(p_amount numeric,p_pack_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.billing_pricing%rowtype; f public.funding_settings%rowtype; pack public.pricing_time_packs%rowtype;
  q public.funding_price_quotes%rowtype; seconds bigint; factor numeric; payable numeric;
begin
  if auth.uid() is null or not public.account_is_active() then raise exception 'Account access required' using errcode='42501'; end if;
  select * into p from public.billing_pricing where id=1 for share;
  select * into f from public.funding_settings where id=1 for share;
  if not p.enabled then raise exception 'Customer pricing is not published'; end if;
  if not f.enabled then raise exception 'Manual payments are paused'; end if;
  if p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive listed amount with at most two decimal places'; end if;
  factor:=case when p.currency=f.currency then 1 when f.exchange_base_currency=p.currency then f.exchange_rate else null end;
  if factor is null then raise exception 'The manual payment exchange rate is not configured. Contact support'; end if;
  payable:=round(p_amount*factor,2);
  if payable<f.minimum_amount or payable<=0 or payable>9999999999.99 then raise exception 'This pack is outside the supported manual payment amount'; end if;
  if (select count(*) from public.funding_price_quotes where owner_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Too many quotes. Reuse an existing quote or try later'; end if;
  if p_pack_id is not null then
    select * into pack from public.pricing_time_packs where id=p_pack_id for share;
    if not found or not pack.enabled or pack.currency<>p.currency or pack.amount<>p_amount then raise exception 'This pack has changed. Refresh before making payment'; end if;
    seconds:=pack.credit_seconds;
  else seconds:=floor(p_amount*60/p.price_per_minute)::bigint; end if;
  if seconds not between 10 and 31536000 then raise exception 'This amount must buy between 10 seconds and one year of live time'; end if;
  insert into public.funding_price_quotes(owner_id,currency,amount,credit_seconds,price_per_minute,pack_name,pack_id,validity_days,listed_currency,listed_amount,payment_exchange_rate,payment_details)
    values(auth.uid(),f.currency,payable,seconds,p.price_per_minute,pack.name,p_pack_id,coalesce(pack.validity_days,p.default_validity_days),p.currency,p_amount,factor,
      jsonb_build_object('bank_name',f.bank_name,'account_name',f.account_name,'account_number',f.account_number,'payment_instructions',f.payment_instructions,'reference_instructions',f.reference_instructions,'review_notice',f.review_notice)) returning * into q;
  return to_jsonb(q);
end $$;

create or replace function public.snapshot_funding_price()
returns trigger language plpgsql security definer set search_path='' as $$
declare q public.funding_price_quotes%rowtype;
begin
  if new.quote_id is not null then
    select * into q from public.funding_price_quotes where id=new.quote_id for update;
    if not found or q.owner_id<>new.owner_id or q.expires_at<=clock_timestamp() or q.amount<>new.amount or q.currency<>new.currency then raise exception 'Use a valid quote belonging to this payment'; end if;
    new.quoted_credit_seconds:=q.credit_seconds;new.quoted_price_per_minute:=q.price_per_minute;new.quoted_pack_name:=q.pack_name;new.quoted_validity_days:=q.validity_days;
    new.quoted_listed_currency:=coalesce(q.listed_currency,q.currency);new.quoted_listed_amount:=coalesce(q.listed_amount,q.amount);new.quoted_exchange_rate:=coalesce(q.payment_exchange_rate,1);
  else
    if exists(select 1 from public.billing_pricing where enabled) then raise exception 'Get a price quote before submitting payment'; end if;
    new.quoted_credit_seconds:=null;new.quoted_price_per_minute:=null;new.quoted_pack_name:=null;new.quoted_validity_days:=null;
    new.quoted_listed_currency:=null;new.quoted_listed_amount:=null;new.quoted_exchange_rate:=null;
  end if;
  new.credits_expire_at:=null;
  return new;
end $$;
create or replace function public.get_open_funding_quote()
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(q) from public.funding_price_quotes q where owner_id=auth.uid() and expires_at>now()
    and not exists(select 1 from public.manual_funding_requests r where r.quote_id=q.id) order by created_at desc limit 1;
$$;
revoke all on function public.get_open_funding_quote() from public,anon;
grant execute on function public.get_open_funding_quote() to authenticated;
notify pgrst,'reload schema';
commit;
