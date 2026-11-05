create table if not exists public.legal_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  age_confirmed boolean not null check (age_confirmed),
  accepted_at timestamptz not null default now()
);

alter table public.legal_consents enable row level security;
revoke all on table public.legal_consents from anon, authenticated;
grant select on table public.legal_consents to authenticated;

drop policy if exists "Users can read their own legal consent record" on public.legal_consents;
create policy "Users can read their own legal consent record"
  on public.legal_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

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
  if terms_version is distinct from '2026-11-05'
    or privacy_version is distinct from '2026-11-05'
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

revoke all on function public.record_kinetelle_signup_consent() from public, anon, authenticated;

drop trigger if exists record_kinetelle_signup_consent_after_insert on auth.users;
create trigger record_kinetelle_signup_consent_after_insert
  after insert on auth.users
  for each row execute function public.record_kinetelle_signup_consent();
