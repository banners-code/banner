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
  if terms_version is distinct from '2026-11-05-v2'
    or privacy_version is distinct from '2026-11-05-v2'
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

create table if not exists public.homepage_settings (
  id smallint primary key default 1 check (id = 1),
  hero_eyebrow text not null default 'A LIVE VISUAL STUDIO' check (char_length(hero_eyebrow) between 1 and 80),
  hero_title_line_one text not null default 'Live image.' check (char_length(hero_title_line_one) between 1 and 100),
  hero_title_line_two text not null default 'New possibility.' check (char_length(hero_title_line_two) between 1 and 100),
  hero_intro text not null default 'A focused creative space for seeing a familiar frame in a different light. Shape a direction, keep the moment live.' check (char_length(hero_intro) between 1 and 500),
  hero_primary_action text not null default 'Enter the Studio' check (char_length(hero_primary_action) between 1 and 60),
  hero_secondary_action text not null default 'Discover how it works' check (char_length(hero_secondary_action) between 1 and 80),
  hero_media_kind text not null default 'image' check (hero_media_kind in ('image', 'video')),
  hero_media_url text not null default '' check (char_length(hero_media_url) <= 2048),
  workflow_eyebrow text not null default 'HOW IT WORKS' check (char_length(workflow_eyebrow) between 1 and 80),
  workflow_heading_one text not null default 'From camera to' check (char_length(workflow_heading_one) between 1 and 100),
  workflow_heading_two text not null default 'live direction.' check (char_length(workflow_heading_two) between 1 and 100),
  workflow_intro text not null default 'The Studio keeps setup simple and lets you decide when to move from local preview to a live Decart session.' check (char_length(workflow_intro) between 1 and 500),
  workflow_steps jsonb not null default '[{"title":"Preview your source","copy":"Enable your camera, choose an available input, and check your framing locally in the browser."},{"title":"Shape the direction","copy":"Start with Photorealistic Human, refine the prompt, and add an optional image reference."},{"title":"Go live when ready","copy":"Sign in and start a Decart session. Adjust your direction as it runs, then stop when you are done."}]'::jsonb check (jsonb_typeof(workflow_steps) = 'array' and jsonb_array_length(workflow_steps) between 1 and 6),
  feature_eyebrow text not null default 'TOOLS FOR A LIVE FRAME' check (char_length(feature_eyebrow) between 1 and 80),
  feature_heading_one text not null default 'Thoughtful controls.' check (char_length(feature_heading_one) between 1 and 100),
  feature_heading_two text not null default 'Room to experiment.' check (char_length(feature_heading_two) between 1 and 100),
  feature_intro text not null default 'A camera source, a visual direction, and a clear choice about when your live session begins.' check (char_length(feature_intro) between 1 and 500),
  feature_cards jsonb not null default '[{"title":"A camera preview before you go live","copy":"Check your framing in the browser and choose from the cameras available on your device."},{"title":"One considered starting direction","copy":"Begin with Photorealistic Human, then refine the result with a prompt that fits your frame."},{"title":"Optional visual references","copy":"Add a JPG, PNG, or WebP image to give the live transformation another visual cue."},{"title":"Direction you can adjust live","copy":"Update your prompt or reference image while a Decart session is running."},{"title":"A deliberate path to live output","copy":"Explore a local visual study first. Start a live Decart session only when you choose to."},{"title":"A personal direction library","copy":"When signed in, save, revisit, export, or remove your Studio directions and preferences."}]'::jsonb check (jsonb_typeof(feature_cards) = 'array' and jsonb_array_length(feature_cards) between 1 and 8),
  demo_title text not null default 'The live transformation, up close.' check (char_length(demo_title) between 1 and 120),
  demo_description text not null default 'A visual study from the Kinetelle Studio. Preview the direction, then start a live session when you are ready.' check (char_length(demo_description) between 1 and 500),
  demo_media_kind text not null default 'image' check (demo_media_kind in ('image', 'video')),
  demo_media_url text not null default '' check (char_length(demo_media_url) <= 2048),
  faq_eyebrow text not null default 'CLEAR BEFORE YOU CREATE' check (char_length(faq_eyebrow) between 1 and 80),
  faq_heading_one text not null default 'A few useful' check (char_length(faq_heading_one) between 1 and 100),
  faq_heading_two text not null default 'answers.' check (char_length(faq_heading_two) between 1 and 100),
  faq_intro text not null default 'Understand the camera preview, live processing, and saved directions before you begin.' check (char_length(faq_intro) between 1 and 500),
  faq_items jsonb not null default '[{"question":"What do I need to use Kinetelle Studio?","answer":"Use a modern browser with a webcam and microphone, allow the requested device permissions, and keep a stable internet connection for live processing. You can explore a local camera preview before signing in."},{"question":"When does my camera leave the browser?","answer":"Your camera and microphone stay in the browser while you preview the source. Starting a live Decart session sends the active stream and any selected reference image to Decart for processing."},{"question":"Can I change the direction during a live session?","answer":"Yes. You can edit the prompt and replace or remove the optional reference image from the Direction panel while the session is active."},{"question":"Is the local preview the same as live AI output?","answer":"No. The local preview is a visual demonstration in your browser. The transformed live output begins after you sign in and start a Decart session."},{"question":"Can I save my prompts and preferences?","answer":"Signed-in users can save and manage directions. Your account also lets you export or delete the Studio directions and preferences stored for you."}]'::jsonb check (jsonb_typeof(faq_items) = 'array' and jsonb_array_length(faq_items) between 1 and 10),
  closing_heading_one text not null default 'See the ordinary' check (char_length(closing_heading_one) between 1 and 100),
  closing_heading_two text not null default 'become something else.' check (char_length(closing_heading_two) between 1 and 100),
  closing_copy text not null default 'A camera, a point of view, and room to experiment. Explore a local look or start a live Decart session in the Studio.' check (char_length(closing_copy) between 1 and 500),
  updated_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not evolve a table from an earlier partial run.
alter table public.homepage_settings
  add column if not exists hero_eyebrow text not null default 'A LIVE VISUAL STUDIO' check (char_length(hero_eyebrow) between 1 and 80),
  add column if not exists hero_title_line_one text not null default 'Live image.' check (char_length(hero_title_line_one) between 1 and 100),
  add column if not exists hero_title_line_two text not null default 'New possibility.' check (char_length(hero_title_line_two) between 1 and 100),
  add column if not exists hero_intro text not null default 'A focused creative space for seeing a familiar frame in a different light. Shape a direction, keep the moment live.' check (char_length(hero_intro) between 1 and 500),
  add column if not exists hero_primary_action text not null default 'Enter the Studio' check (char_length(hero_primary_action) between 1 and 60),
  add column if not exists hero_secondary_action text not null default 'Discover how it works' check (char_length(hero_secondary_action) between 1 and 80),
  add column if not exists hero_media_kind text not null default 'image' check (hero_media_kind in ('image', 'video')),
  add column if not exists hero_media_url text not null default '' check (char_length(hero_media_url) <= 2048),
  add column if not exists workflow_eyebrow text not null default 'HOW IT WORKS' check (char_length(workflow_eyebrow) between 1 and 80),
  add column if not exists workflow_heading_one text not null default 'From camera to' check (char_length(workflow_heading_one) between 1 and 100),
  add column if not exists workflow_heading_two text not null default 'live direction.' check (char_length(workflow_heading_two) between 1 and 100),
  add column if not exists workflow_intro text not null default 'The Studio keeps setup simple and lets you decide when to move from local preview to a live Decart session.' check (char_length(workflow_intro) between 1 and 500),
  add column if not exists workflow_steps jsonb not null default '[{"title":"Preview your source","copy":"Enable your camera, choose an available input, and check your framing locally in the browser."},{"title":"Shape the direction","copy":"Start with Photorealistic Human, refine the prompt, and add an optional image reference."},{"title":"Go live when ready","copy":"Sign in and start a Decart session. Adjust your direction as it runs, then stop when you are done."}]'::jsonb check (jsonb_typeof(workflow_steps) = 'array' and jsonb_array_length(workflow_steps) between 1 and 6),
  add column if not exists feature_eyebrow text not null default 'TOOLS FOR A LIVE FRAME' check (char_length(feature_eyebrow) between 1 and 80),
  add column if not exists feature_heading_one text not null default 'Thoughtful controls.' check (char_length(feature_heading_one) between 1 and 100),
  add column if not exists feature_heading_two text not null default 'Room to experiment.' check (char_length(feature_heading_two) between 1 and 100),
  add column if not exists feature_intro text not null default 'A camera source, a visual direction, and a clear choice about when your live session begins.' check (char_length(feature_intro) between 1 and 500),
  add column if not exists feature_cards jsonb not null default '[{"title":"A camera preview before you go live","copy":"Check your framing in the browser and choose from the cameras available on your device."},{"title":"One considered starting direction","copy":"Begin with Photorealistic Human, then refine the result with a prompt that fits your frame."},{"title":"Optional visual references","copy":"Add a JPG, PNG, or WebP image to give the live transformation another visual cue."},{"title":"Direction you can adjust live","copy":"Update your prompt or reference image while a Decart session is running."},{"title":"A deliberate path to live output","copy":"Explore a local visual study first. Start a live Decart session only when you choose to."},{"title":"A personal direction library","copy":"When signed in, save, revisit, export, or remove your Studio directions and preferences."}]'::jsonb check (jsonb_typeof(feature_cards) = 'array' and jsonb_array_length(feature_cards) between 1 and 8),
  add column if not exists demo_title text not null default 'The live transformation, up close.' check (char_length(demo_title) between 1 and 120),
  add column if not exists demo_description text not null default 'A visual study from the Kinetelle Studio. Preview the direction, then start a live session when you are ready.' check (char_length(demo_description) between 1 and 500),
  add column if not exists demo_media_kind text not null default 'image' check (demo_media_kind in ('image', 'video')),
  add column if not exists demo_media_url text not null default '' check (char_length(demo_media_url) <= 2048),
  add column if not exists faq_eyebrow text not null default 'CLEAR BEFORE YOU CREATE' check (char_length(faq_eyebrow) between 1 and 80),
  add column if not exists faq_heading_one text not null default 'A few useful' check (char_length(faq_heading_one) between 1 and 100),
  add column if not exists faq_heading_two text not null default 'answers.' check (char_length(faq_heading_two) between 1 and 100),
  add column if not exists faq_intro text not null default 'Understand the camera preview, live processing, and saved directions before you begin.' check (char_length(faq_intro) between 1 and 500),
  add column if not exists faq_items jsonb not null default '[{"question":"What do I need to use Kinetelle Studio?","answer":"Use a modern browser with a webcam and microphone, allow the requested device permissions, and keep a stable internet connection for live processing. You can explore a local camera preview before signing in."},{"question":"When does my camera leave the browser?","answer":"Your camera and microphone stay in the browser while you preview the source. Starting a live Decart session sends the active stream and any selected reference image to Decart for processing."},{"question":"Can I change the direction during a live session?","answer":"Yes. You can edit the prompt and replace or remove the optional reference image from the Direction panel while the session is active."},{"question":"Is the local preview the same as live AI output?","answer":"No. The local preview is a visual demonstration in your browser. The transformed live output begins after you sign in and start a Decart session."},{"question":"Can I save my prompts and preferences?","answer":"Signed-in users can save and manage directions. Your account also lets you export or delete the Studio directions and preferences stored for you."}]'::jsonb check (jsonb_typeof(faq_items) = 'array' and jsonb_array_length(faq_items) between 1 and 10),
  add column if not exists closing_heading_one text not null default 'See the ordinary' check (char_length(closing_heading_one) between 1 and 100),
  add column if not exists closing_heading_two text not null default 'become something else.' check (char_length(closing_heading_two) between 1 and 100),
  add column if not exists closing_copy text not null default 'A camera, a point of view, and room to experiment. Explore a local look or start a live Decart session in the Studio.' check (char_length(closing_copy) between 1 and 500);

insert into public.homepage_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.homepage_settings enable row level security;
revoke all on table public.homepage_settings from anon, authenticated;
grant select on table public.homepage_settings to anon, authenticated;
grant update on table public.homepage_settings to authenticated;

drop policy if exists "Anyone can read homepage settings" on public.homepage_settings;
create policy "Anyone can read homepage settings"
  on public.homepage_settings for select to anon, authenticated
  using (id = 1);

drop policy if exists "Site admins can update homepage settings" on public.homepage_settings;
create policy "Site admins can update homepage settings"
  on public.homepage_settings for update to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());

create table if not exists public.funding_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  currency text not null default '' check (currency = '' or currency ~ '^[A-Z]{3}$'),
  payment_instructions text not null default '' check (char_length(payment_instructions) <= 2500),
  reference_instructions text not null default '' check (char_length(reference_instructions) <= 500),
  minimum_amount numeric(12, 2) not null default 0 check (minimum_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.funding_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.funding_settings enable row level security;
revoke all on table public.funding_settings from anon, authenticated;
grant select on table public.funding_settings to authenticated;
grant update on table public.funding_settings to authenticated;

drop policy if exists "Signed-in members can read funding instructions" on public.funding_settings;
create policy "Signed-in members can read funding instructions"
  on public.funding_settings for select to authenticated
  using (id = 1);

drop policy if exists "Site admins can update funding instructions" on public.funding_settings;
create policy "Site admins can update funding instructions"
  on public.funding_settings for update to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());

create table if not exists public.manual_funding_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_email text not null check (char_length(owner_email) between 3 and 254),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_reference text not null check (char_length(payment_reference) between 1 and 120),
  proof_object_path text not null check (char_length(proof_object_path) between 1 and 500),
  user_note text not null default '' check (char_length(user_note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  credits_granted_seconds bigint,
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint manual_funding_review_consistent check (
    (status = 'pending' and reviewed_at is null and credits_granted_seconds is null)
    or (status = 'approved' and reviewed_at is not null and credits_granted_seconds > 0)
    or (status = 'rejected' and reviewed_at is not null and credits_granted_seconds is null)
  )
);

create index if not exists manual_funding_requests_created_idx
  on public.manual_funding_requests (status, created_at desc);
create index if not exists manual_funding_requests_owner_idx
  on public.manual_funding_requests (owner_id, created_at desc);

alter table public.manual_funding_requests enable row level security;
revoke all on table public.manual_funding_requests from anon, authenticated;
grant select, insert on table public.manual_funding_requests to authenticated;

drop policy if exists "Members can read their funding requests and admins can review all" on public.manual_funding_requests;
create policy "Members can read their funding requests and admins can review all"
  on public.manual_funding_requests for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_support_admin());

drop policy if exists "Members can submit their own pending funding requests" on public.manual_funding_requests;
create policy "Members can submit their own pending funding requests"
  on public.manual_funding_requests for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pending'
    and credits_granted_seconds is null
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1
      from public.funding_settings settings
      where settings.id = 1
        and settings.enabled
        and settings.currency = manual_funding_requests.currency
        and amount >= settings.minimum_amount
    )
    and proof_object_path like (owner_id::text || '/%')
  );

create or replace function public.review_manual_funding_request(
  p_request_id uuid,
  p_status text,
  p_admin_note text default '',
  p_credit_seconds bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  funding_request public.manual_funding_requests%rowtype;
  admin_id uuid := auth.uid();
begin
  if admin_id is null or not public.is_support_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'A funding request must be approved or rejected.' using errcode = '22023';
  end if;

  if p_admin_note is null or char_length(p_admin_note) > 1000 then
    raise exception 'Admin note must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select * into funding_request
  from public.manual_funding_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Funding request not found.' using errcode = 'P0002';
  end if;

  if funding_request.status <> 'pending' then
    raise exception 'This funding request has already been reviewed.' using errcode = '23514';
  end if;

  if p_status = 'approved' then
    if p_credit_seconds is null or p_credit_seconds <= 0 then
      raise exception 'Enter a positive amount of live time to grant.' using errcode = '22023';
    end if;

    update public.manual_funding_requests
    set status = 'approved',
        credits_granted_seconds = p_credit_seconds,
        admin_note = p_admin_note,
        reviewed_by = admin_id,
        reviewed_at = clock_timestamp()
    where id = p_request_id;

    insert into public.live_time_credit_grants (
      user_id, credit_seconds, source, source_reference
    ) values (
      funding_request.owner_id,
      p_credit_seconds,
      'admin',
      'manual-funding:' || p_request_id::text
    );
  else
    if p_credit_seconds is not null then
      raise exception 'Rejected requests cannot grant live time.' using errcode = '22023';
    end if;

    update public.manual_funding_requests
    set status = 'rejected',
        credits_granted_seconds = null,
        admin_note = p_admin_note,
        reviewed_by = admin_id,
        reviewed_at = clock_timestamp()
    where id = p_request_id;
  end if;
end;
$$;

revoke all on function public.review_manual_funding_request(uuid, text, text, bigint) from public, anon;
grant execute on function public.review_manual_funding_request(uuid, text, text, bigint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media', 'site-media', true, 104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Kinetelle site media" on storage.objects;
create policy "Public can view Kinetelle site media"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');

drop policy if exists "Site admins can upload site media" on storage.objects;
create policy "Site admins can upload site media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_support_admin());

drop policy if exists "Site admins can update site media" on storage.objects;
create policy "Site admins can update site media"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.is_support_admin())
  with check (bucket_id = 'site-media' and public.is_support_admin());

drop policy if exists "Site admins can delete site media" on storage.objects;
create policy "Site admins can delete site media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.is_support_admin());

drop policy if exists "Members can upload their own payment proofs" on storage.objects;
create policy "Members can upload their own payment proofs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Members and admins can view payment proofs" on storage.objects;
create policy "Members and admins can view payment proofs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or public.is_support_admin()
    )
  );

drop policy if exists "Members can remove unused payment proofs" on storage.objects;
create policy "Members can remove unused payment proofs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and not exists (
      select 1
      from public.manual_funding_requests request
      where request.proof_object_path = storage.objects.name
    )
  );

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['homepage_settings', 'manual_funding_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
