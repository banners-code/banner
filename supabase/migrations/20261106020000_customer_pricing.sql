begin;
create table if not exists public.billing_pricing (
  id integer primary key check(id=1),
  currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
  price_per_minute numeric(14,4) not null default 2 check(price_per_minute>0),
  enabled boolean not null default false,
  default_validity_days integer not null default 14 check(default_validity_days between 1 and 3650),
  updated_at timestamptz not null default now()
);
insert into public.billing_pricing(id) values(1) on conflict do nothing;
create table if not exists public.billing_cost_estimates (
  id integer primary key check(id=1),
  provider_usd_per_second numeric(14,6) not null default 0.02 check(provider_usd_per_second>=0),
  currency_units_per_usd numeric(18,6) not null default 1 check(currency_units_per_usd>0),
  payment_fee_percent numeric(6,3) not null default 0 check(payment_fee_percent>=0 and payment_fee_percent<100),
  other_cost_per_minute numeric(14,4) not null default 0 check(other_cost_per_minute>=0)
);
insert into public.billing_cost_estimates(id) values(1) on conflict do nothing;
create table if not exists public.pricing_time_packs (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(trim(name)) between 1 and 80),
  currency text not null check(currency ~ '^[A-Z]{3}$'), amount numeric(12,2) not null check(amount>0),
  credit_seconds bigint not null check(credit_seconds between 10 and 31536000),
  enabled boolean not null default false, sort_order integer not null default 0,
  validity_days integer not null default 14 check(validity_days between 1 and 3650),
  use_standard_rate boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.pricing_time_packs(id,name,currency,amount,credit_seconds,sort_order,validity_days,enabled) values
 ('a0600000-0000-4000-8000-000000000005','5 minutes','USD',10,300,1,3,true),
 ('a0600000-0000-4000-8000-000000000010','10 minutes','USD',20,600,2,14,true),
 ('a0600000-0000-4000-8000-000000000020','20 minutes','USD',40,1200,3,14,true) on conflict do nothing;
alter table public.billing_pricing enable row level security;
alter table public.billing_cost_estimates enable row level security;
alter table public.pricing_time_packs enable row level security;
revoke all on public.billing_pricing,public.billing_cost_estimates,public.pricing_time_packs from anon,authenticated;
grant select on public.billing_pricing,public.billing_cost_estimates,public.pricing_time_packs to authenticated;
grant insert,update on public.pricing_time_packs to authenticated;
drop policy if exists "Read published pricing or administer" on public.billing_pricing;
create policy "Read published pricing or administer" on public.billing_pricing for select to authenticated using(enabled or public.is_support_admin());
drop policy if exists "Admins read cost estimates" on public.billing_cost_estimates;
create policy "Admins read cost estimates" on public.billing_cost_estimates for select to authenticated using(public.is_support_admin());
drop policy if exists "Read published time packs or administer" on public.pricing_time_packs;
create policy "Read published time packs or administer" on public.pricing_time_packs for select to authenticated using(public.is_support_admin() or (enabled and exists(select 1 from public.billing_pricing p where p.enabled and p.currency=pricing_time_packs.currency)));
drop policy if exists "Admins insert time packs" on public.pricing_time_packs;
create policy "Admins insert time packs" on public.pricing_time_packs for insert to authenticated with check(public.is_support_admin());
drop policy if exists "Admins update time packs" on public.pricing_time_packs;
create policy "Admins update time packs" on public.pricing_time_packs for update to authenticated using(public.is_support_admin()) with check(public.is_support_admin());

create table if not exists public.funding_price_quotes (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  currency text not null, amount numeric(12,2) not null, credit_seconds bigint not null,
  price_per_minute numeric(14,4) not null, pack_name text, pack_id uuid, validity_days integer not null,
  created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default(clock_timestamp()+interval '24 hours')
);
create index if not exists funding_price_quotes_owner_created_idx on public.funding_price_quotes(owner_id,created_at desc);
create index if not exists funding_price_quotes_expiry_idx on public.funding_price_quotes(expires_at,currency);
alter table public.funding_price_quotes enable row level security;
revoke all on public.funding_price_quotes from anon,authenticated;
grant select on public.funding_price_quotes to authenticated;
drop policy if exists "Owners and admins read funding quotes" on public.funding_price_quotes;
create policy "Owners and admins read funding quotes" on public.funding_price_quotes for select to authenticated using(owner_id=auth.uid() or public.is_support_admin());
alter table public.manual_funding_requests add column if not exists quote_id uuid references public.funding_price_quotes(id);
alter table public.manual_funding_requests add column if not exists quoted_credit_seconds bigint;
alter table public.manual_funding_requests add column if not exists quoted_price_per_minute numeric(14,4);
alter table public.manual_funding_requests add column if not exists quoted_pack_name text;
alter table public.manual_funding_requests add column if not exists quoted_validity_days integer;
alter table public.manual_funding_requests add column if not exists credits_expire_at timestamptz;
alter table public.live_time_credit_grants add column if not exists expires_at timestamptz;
create unique index if not exists manual_funding_quote_once on public.manual_funding_requests(quote_id) where quote_id is not null;

create or replace function public.admin_save_pricing(p_currency text,p_price_per_minute numeric,p_enabled boolean,p_provider_cost numeric,p_fx numeric,p_fee numeric,p_other_cost numeric,p_validity_days integer default 14)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_price_per_minute is null or p_price_per_minute<=0 or p_price_per_minute>100000000
    or p_enabled is null or p_provider_cost is null or p_provider_cost<0 or p_provider_cost>1000000 or p_fx is null or p_fx<=0 or p_fx>1000000000
    or p_fee is null or p_fee<0 or p_fee>=100 or p_other_cost is null or p_other_cost<0 or p_other_cost>100000000
    or p_validity_days is null or p_validity_days not between 1 and 3650 then raise exception 'Enter valid prices, currency, and cost estimates' using errcode='22023'; end if;
  perform 1 from public.billing_pricing where id=1 for update;
  if exists(select 1 from public.funding_price_quotes q where q.expires_at>clock_timestamp() and q.currency<>p_currency and not exists(select 1 from public.manual_funding_requests r where r.quote_id=q.id)) then
    raise exception 'Wait for outstanding 24-hour payment quotes before changing currency'; end if;
  if p_enabled and exists(select 1 from public.funding_settings where enabled and currency<>p_currency) then raise exception 'Pricing currency must match the enabled manual payment currency'; end if;
  update public.billing_pricing set currency=p_currency,price_per_minute=p_price_per_minute,enabled=p_enabled,default_validity_days=p_validity_days,updated_at=clock_timestamp() where id=1;
  update public.pricing_time_packs set amount=round(p_price_per_minute*credit_seconds/60,2),currency=p_currency,updated_at=clock_timestamp() where use_standard_rate;
  update public.billing_cost_estimates set provider_usd_per_second=p_provider_cost,currency_units_per_usd=case when p_currency='USD' then 1 else p_fx end,payment_fee_percent=p_fee,other_cost_per_minute=p_other_cost where id=1;
end $$;

create or replace function public.price_standard_time_pack()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.billing_pricing%rowtype;
begin
  if new.use_standard_rate then
    select * into p from public.billing_pricing where id=1 for share;
    new.currency:=p.currency;new.amount:=round(p.price_per_minute*new.credit_seconds/60,2);
  end if;
  return new;
end $$;
drop trigger if exists price_standard_time_pack on public.pricing_time_packs;
create trigger price_standard_time_pack before insert or update on public.pricing_time_packs for each row execute function public.price_standard_time_pack();
revoke all on function public.price_standard_time_pack() from public,anon,authenticated;

create or replace function public.create_funding_price_quote(p_amount numeric,p_pack_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.billing_pricing%rowtype; pack public.pricing_time_packs%rowtype; q public.funding_price_quotes%rowtype; seconds bigint;
begin
  if auth.uid() is null or not public.account_is_active() then raise exception 'Account access required' using errcode='42501'; end if;
  select * into p from public.billing_pricing where id=1 for share;
  if not p.enabled then raise exception 'Customer pricing is not published'; end if;
  if p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount with at most two decimal places'; end if;
  if not exists(select 1 from public.funding_settings where enabled and currency=p.currency and p_amount>=minimum_amount) then raise exception 'Manual payments are unavailable for this amount or currency'; end if;
  if (select count(*) from public.funding_price_quotes where owner_id=auth.uid() and created_at>clock_timestamp()-interval '1 hour')>=30 then raise exception 'Too many quotes. Reuse an existing quote or try later'; end if;
  if p_pack_id is not null then
    select * into pack from public.pricing_time_packs where id=p_pack_id for share;
    if not found or not pack.enabled or pack.currency<>p.currency or pack.amount<>p_amount then raise exception 'This pack has changed. Refresh before making payment'; end if;
    seconds:=pack.credit_seconds;
  else seconds:=floor(p_amount*60/p.price_per_minute)::bigint; end if;
  if seconds not between 10 and 31536000 then raise exception 'This amount must buy between 10 seconds and one year of live time'; end if;
  insert into public.funding_price_quotes(owner_id,currency,amount,credit_seconds,price_per_minute,pack_name,pack_id,validity_days)
    values(auth.uid(),p.currency,p_amount,seconds,p.price_per_minute,pack.name,p_pack_id,coalesce(pack.validity_days,p.default_validity_days)) returning * into q;
  return to_jsonb(q);
end $$;

create or replace function public.snapshot_funding_price()
returns trigger language plpgsql security definer set search_path='' as $$
declare q public.funding_price_quotes%rowtype;
begin
  if new.quote_id is not null then
    select * into q from public.funding_price_quotes where id=new.quote_id for update;
    if not found or q.owner_id<>new.owner_id or q.expires_at<=clock_timestamp() or q.amount<>new.amount or q.currency<>new.currency then raise exception 'Use a valid quote belonging to this payment'; end if;
    new.quoted_credit_seconds:=q.credit_seconds;new.quoted_price_per_minute:=q.price_per_minute;new.quoted_pack_name:=q.pack_name;
    new.quoted_validity_days:=q.validity_days;
  else
    if exists(select 1 from public.billing_pricing where enabled) then raise exception 'Get a price quote before submitting payment'; end if;
    new.quoted_credit_seconds:=null;new.quoted_price_per_minute:=null;new.quoted_pack_name:=null;
    new.quoted_validity_days:=null;
  end if;
  new.credits_expire_at:=null;
  return new;
end $$;
drop trigger if exists snapshot_funding_price on public.manual_funding_requests;
create trigger snapshot_funding_price before insert on public.manual_funding_requests for each row execute function public.snapshot_funding_price();

create or replace function public.guard_funding_currency()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.enabled and exists(select 1 from public.billing_pricing where enabled and currency<>new.currency) then raise exception 'Manual payment currency must match published pricing'; end if;
  if old.currency is distinct from new.currency and exists(select 1 from public.funding_price_quotes q where q.expires_at>clock_timestamp() and q.currency<>new.currency and not exists(select 1 from public.manual_funding_requests r where r.quote_id=q.id)) then raise exception 'Outstanding payment quotes lock the payment currency for up to 24 hours'; end if;
  return new;
end $$;
drop trigger if exists guard_funding_currency on public.funding_settings;
create trigger guard_funding_currency before update on public.funding_settings for each row execute function public.guard_funding_currency();

create or replace function public.review_manual_funding_request(p_request_id uuid,p_status text,p_admin_note text default '',p_credit_seconds bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare r public.manual_funding_requests%rowtype; seconds bigint;
begin
  if auth.uid() is null or not public.is_support_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_status is null or p_status not in('approved','rejected') or p_admin_note is null or char_length(p_admin_note)>1000 then raise exception 'Invalid review'; end if;
  select * into r from public.manual_funding_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
  if p_status='approved' then
    seconds:=coalesce(r.quoted_credit_seconds,p_credit_seconds);
    if seconds is null or seconds<=0 or seconds>31536000 then raise exception 'Enter valid live time to grant'; end if;
    if r.quoted_credit_seconds is not null and p_credit_seconds is not null and p_credit_seconds<>r.quoted_credit_seconds then raise exception 'Approval must honor the saved quote. Use an audited time adjustment for bonuses'; end if;
    update public.manual_funding_requests set status='approved',credits_granted_seconds=seconds,credits_expire_at=case when r.quoted_validity_days is not null then clock_timestamp()+make_interval(days=>r.quoted_validity_days) else null end,admin_note=trim(p_admin_note),reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=r.id returning * into r;
    insert into public.live_time_credit_grants(user_id,credit_seconds,source,source_reference,expires_at) values(r.owner_id,seconds,'admin','manual-funding:'||r.id,r.credits_expire_at);
  else
    if char_length(trim(p_admin_note))=0 or p_credit_seconds is not null then raise exception 'Rejection requires a reason and cannot grant time'; end if;
    update public.manual_funding_requests set status='rejected',admin_note=trim(p_admin_note),reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=r.id;
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['billing_pricing','billing_cost_estimates','pricing_time_packs'] loop
    execute format('drop trigger if exists audit_admin_settings_change on public.%I',t);
    execute format('create trigger audit_admin_settings_change after insert or update on public.%I for each row execute function public.audit_admin_settings_change()',t);
  end loop;
end $$;
revoke all on function public.admin_save_pricing(text,numeric,boolean,numeric,numeric,numeric,numeric,integer),public.create_funding_price_quote(numeric,uuid) from public,anon;
grant execute on function public.admin_save_pricing(text,numeric,boolean,numeric,numeric,numeric,numeric,integer),public.create_funding_price_quote(numeric,uuid) to authenticated;
revoke all on function public.snapshot_funding_price(),public.guard_funding_currency() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
