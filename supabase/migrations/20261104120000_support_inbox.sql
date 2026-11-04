create table if not exists public.support_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.support_admins enable row level security;
revoke all on table public.support_admins from anon, authenticated;

create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_support_admin() from public;
grant execute on function public.is_support_admin() to authenticated;

create table if not exists public.support_contact_settings (
  id smallint primary key default 1 check (id = 1),
  welcome_message text not null default 'Send a message to the Kinetelle team. Replies will appear in your support inbox.' check (char_length(welcome_message) between 1 and 500),
  contact_email text not null default '' check (char_length(contact_email) <= 254),
  contact_url text not null default '' check (char_length(contact_url) <= 500),
  contact_label text not null default 'More ways to reach us' check (char_length(contact_label) between 1 and 80),
  chat_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.support_contact_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.support_contact_settings enable row level security;
revoke all on table public.support_contact_settings from anon, authenticated;
grant select on table public.support_contact_settings to anon, authenticated;
grant update on table public.support_contact_settings to authenticated;

create policy "Public can read support contact settings"
  on public.support_contact_settings for select to anon, authenticated
  using (id = 1);

create policy "Support admins can update contact settings"
  on public.support_contact_settings for update to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  owner_email text not null check (char_length(owner_email) between 3 and 254),
  category text not null default 'other' check (category in ('account', 'camera', 'live-session', 'technical', 'feedback', 'other')),
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_conversations_owner_updated_idx
  on public.support_conversations (owner_id, updated_at desc);
create index if not exists support_conversations_status_updated_idx
  on public.support_conversations (status, updated_at desc);

alter table public.support_conversations enable row level security;
revoke all on table public.support_conversations from anon, authenticated;
grant select, insert on table public.support_conversations to authenticated;
grant update (status, updated_at) on table public.support_conversations to authenticated;

create policy "Customers and support admins can read conversations"
  on public.support_conversations for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_support_admin());

create policy "Customers can create their own conversations"
  on public.support_conversations for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and exists (
      select 1
      from public.support_contact_settings settings
      where settings.id = 1 and settings.chat_enabled
    )
  );

create policy "Support admins can update conversation status"
  on public.support_conversations for update to authenticated
  using (public.is_support_admin())
  with check (public.is_support_admin());

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_role text not null default 'customer' check (sender_role in ('customer', 'admin')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at);

alter table public.support_messages enable row level security;
revoke all on table public.support_messages from anon, authenticated;
grant select, insert on table public.support_messages to authenticated;

create or replace function public.set_support_message_sender_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_role := case when public.is_support_admin() then 'admin' else 'customer' end;
  return new;
end;
$$;

create trigger set_support_message_sender_role_before_insert
  before insert on public.support_messages
  for each row execute function public.set_support_message_sender_role();

create or replace function public.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger touch_support_conversation_after_message
  after insert on public.support_messages
  for each row execute function public.touch_support_conversation();

create policy "Customers and support admins can read conversation messages"
  on public.support_messages for select to authenticated
  using (
    public.is_support_admin()
    or exists (
      select 1
      from public.support_conversations conversation
      where conversation.id = conversation_id
        and conversation.owner_id = (select auth.uid())
    )
  );

create policy "Conversation members can send messages while open"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.support_conversations conversation
      where conversation.id = conversation_id
        and conversation.status = 'open'
        and (conversation.owner_id = (select auth.uid()) or public.is_support_admin())
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_contact_settings') then
      execute 'alter publication supabase_realtime add table public.support_contact_settings';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_conversations') then
      execute 'alter publication supabase_realtime add table public.support_conversations';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages') then
      execute 'alter publication supabase_realtime add table public.support_messages';
    end if;
  end if;
end;
$$;
