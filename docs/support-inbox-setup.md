# Support inbox setup

The support experience uses Supabase Auth, Postgres Row Level Security, and Realtime. The public contact details are stored in `support_contact_settings`; only a support admin can change them. Customer conversations and replies are visible only to the conversation owner and support admins.

## Apply the migration

Apply `supabase/migrations/20261104120000_support_inbox.sql` to the same Supabase project used by Kinetelle. The migration creates the support tables, RLS policies, and Realtime publication entries.

## Grant the first support admin

Sign in to Kinetelle once with the account that should manage support, then run this in the Supabase SQL Editor, replacing the placeholder with that account's email:

```sql
insert into public.support_admins (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_KINETELLE_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

The query adds no row if that email has not registered in this Supabase project. The admin role lives in the database rather than the browser bundle. Do not grant the role by trusting a client-side email check.

## Use the inbox

- Customers sign in, open **Contact**, and start a conversation. New messages and admin replies appear in the same thread in real time.
- Support admins open `/admin/support` to see the inbox, reply, close conversations, and edit the public contact details shown on the homepage.
- Keep the admin inbox open to receive its live in-app notification badge and new-message indicator. The admin can opt into browser notifications from the inbox; delivery requires the browser to allow notifications and the inbox page to remain open. Email and background push delivery are not configured.

The one-time admin grant above is intentionally not embedded in a checked-in migration so a personal account address is not published in the repository.
