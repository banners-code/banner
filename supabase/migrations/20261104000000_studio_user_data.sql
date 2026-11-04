create table if not exists public.studio_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  prompt text not null default 'Photorealistic human' check (char_length(prompt) between 1 and 280),
  aspect text not null default 'landscape' check (aspect in ('landscape', 'portrait')),
  preset_id text not null default 'photorealistic-human',
  updated_at timestamptz not null default now()
);

alter table public.studio_preferences enable row level security;
revoke all on table public.studio_preferences from anon, authenticated;
grant select, insert, update, delete on table public.studio_preferences to authenticated;

drop policy if exists "Users can read their own studio preferences" on public.studio_preferences;
create policy "Users can read their own studio preferences"
  on public.studio_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own studio preferences" on public.studio_preferences;
create policy "Users can create their own studio preferences"
  on public.studio_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own studio preferences" on public.studio_preferences;
create policy "Users can update their own studio preferences"
  on public.studio_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own studio preferences" on public.studio_preferences;
create policy "Users can delete their own studio preferences"
  on public.studio_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.saved_directions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 60),
  prompt text not null check (char_length(prompt) between 1 and 280),
  preset_id text not null default 'photorealistic-human',
  created_at timestamptz not null default now()
);

create index if not exists saved_directions_user_created_idx
  on public.saved_directions (user_id, created_at desc);

alter table public.saved_directions enable row level security;
revoke all on table public.saved_directions from anon, authenticated;
grant select, insert, update, delete on table public.saved_directions to authenticated;

drop policy if exists "Users can read their own saved directions" on public.saved_directions;
create policy "Users can read their own saved directions"
  on public.saved_directions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own saved directions" on public.saved_directions;
create policy "Users can create their own saved directions"
  on public.saved_directions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved directions" on public.saved_directions;
create policy "Users can update their own saved directions"
  on public.saved_directions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved directions" on public.saved_directions;
create policy "Users can delete their own saved directions"
  on public.saved_directions for delete to authenticated
  using ((select auth.uid()) = user_id);
