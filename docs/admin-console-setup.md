# Admin console setup

The admin workspace reuses the database-backed `support_admins` role. Do not grant admin access with an email check in the browser or add a Supabase service-role key to the frontend.

## 1. Apply database migrations

Apply the migrations in timestamp order, including:

1. `20261104000000_studio_user_data.sql`
2. `20261104120000_support_inbox.sql`
3. `20261105090000_live_usage_and_time_credits.sql`
4. `20261105130000_legal_consent.sql`
5. `20261105160000_admin_site_and_manual_funding.sql`
6. `20261105170000_reconcile_homepage_settings.sql`
7. `20261105200000_account_moderation.sql`
8. `20261105210000_admin_dashboard.sql`
9. `20261105211000_funding_review_audit.sql`

The admin migration creates homepage content and funding settings, the manual request ledger, the private receipt bucket, the public site-media bucket, storage/table policies, and the admin-only review function. The reconciliation migration adds missing content columns to tables created during an earlier partial setup and refreshes the API schema cache. It preserves existing content. Apply these migrations before using the admin workspace or manual payment flow.

## 2. Grant an admin role

Sign in once with the account that should manage Kinetelle, then run this in the Supabase SQL Editor, replacing the email with the registered admin account:

```sql
insert into public.support_admins (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_KINETELLE_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

The same role protects the site editor, payment settings, private receipts, account support inbox, and public contact settings. Only grant it to trusted administrators.

## 3. Open the admin workspace

Sign in and open `/admin`. **Settings → App Settings** controls the hero, workflow steps, feature cards, featured demonstration, FAQs, and closing message. It supports image and video uploads or direct HTTPS media URLs. Uploaded images are limited to 15 MB; videos are limited to 100 MB. Supported uploads are JPG, PNG, WebP, MP4, and WebM. A video URL must point directly to an MP4/WebM file; the editor does not embed arbitrary video pages.

Homepage media is public because it is displayed on the public site. Do not upload private or customer-owned material without permission. The hero defaults to the original Kinetelle artwork if no media URL is set. The featured demonstration appears only after a demo media URL is saved and is labeled as demonstration media.

Use **Support Inbox** for conversations and **Settings → Contact Settings** for public contact information. The admin sidebar stays available on every admin page.

### Dashboard and navigation

The default **Admin Dashboard** shows registered users, active sessions, recorded live time, pending deposits, open reports/support, and recent notifications. Approved and pending money totals are grouped by currency rather than added across currencies. Dashboard data refreshes every 30 seconds. The sidebar becomes a keyboard-accessible drawer on smaller screens.

The API panel uses the authenticated, admin-only `/api/admin/status` route. Configuration status and successful/failed token requests describe this application server; counters reset when that process restarts. They do not measure Decart account balance, provider billing, or provider uptime.

**Notifications** shows the latest 100 pending deposits, open reports, customer support messages, and accounts created within seven days. Read marks belong to each administrator. **Action History** records new account actions, report/deposit reviews, manual time adjustments, and app/payment/contact/draft-product setting changes; earlier actions are not backfilled.

### Manage users and live time

**Manage Users** provides paginated account search. Select an account to see available time, recorded usage, total grants, account dates, and the latest 25 entries in each session/deposit/time-history list. **Add or adjust live time** accepts whole minutes and requires a reason. Removals cannot exceed available time. Each adjustment is recorded separately from session history, and a retry with the same request reference cannot issue the adjustment twice. A single adjustment is limited to 525,600 minutes in either direction.

Time balances include approved funding grants and manual adjustments. This update records balances; it does not add server-side exhaustion enforcement for running Decart streams.

## 4. Enable manual payments

Open **Settings → Payment Settings** and set:

- The three-letter currency code.
- Optional minimum payment amount.
- Payment instructions shown to signed-in members (for example, the payment channel and account details you choose to publish).
- Instructions for finding the payment reference.
- Select **Manual payments** only after those details are ready. Choose **Payments paused** to stop new submissions.

No bank details, payment amount, package, or amount-to-time conversion is prefilled. Members enter the amount they paid, provide a payment reference, and upload a receipt image or PDF up to 10 MB. Receipt files are stored in a private Supabase Storage bucket and can be opened only by the member who uploaded them and designated admins.

Review each request under **Deposits** against your payment provider or bank records. **Approve and grant** adds the live minutes you enter to the member's time ledger in the same database transaction that marks the request approved. **Reject** requires a note, which the member can see in their dashboard. The app does not verify transfers automatically and does not contact a payment provider.

Payment Settings also stores admin-only Bachs product drafts: a provider product reference, currency, display amount, and live minutes. These drafts do not create provider products, initiate checkout, or grant time. Automatic payment mode is disabled in the interface and rejected by the database until a verified checkout/webhook integration is implemented. Paused/manual mode changes take effect when saved. No payment secrets are entered in this browser interface.

## 5. Deployment notes

**Manage Users**, **Abuse Reports**, and **Action History** provide a paginated email/ID search, account details, suspension with an expiry, indefinite bans, restoration, abuse-report review, and a read-only moderation action history. A reason is required for every account action. Admin accounts cannot be restricted through these functions. These are Kinetelle feature restrictions: users retain sign-in, account access, data export/removal, and Support for appeals. They do not change Supabase Auth credentials or delete accounts.

Members can submit reports at `/report` (up to five per 24 hours). Reports do not automatically restrict an account. Admin report notes are visible to the reporter; account-action reasons are visible to the affected member. No moderation data is public.

Apply the moderation migration before restarting the Node server with these changes. The token route checks `get_account_access` using the verified user's bearer token, and fails closed when access cannot be verified. The browser checks access every 15 seconds and on focus, unmounting the Studio and disconnecting its media when restricted. New token issuance is blocked server-side. Previously issued provider tokens/streams cannot be forcibly revoked by this app; an altered client can ignore browser checks. Provider-level revocation is not implemented. No Supabase service-role key is required.

Audit history includes account actions, report reviews, manual time adjustments, and app/payment/contact setting changes. Existing historical events are not backfilled.

For a database regression check, run `supabase/tests/account_moderation.sql` in the SQL editor as postgres. It creates a synthetic member inside a transaction, checks non-admin directory denial, protected admin accounts, report limits, restriction/restoration, RLS, audit privacy, live usage denial, and suspension expiry, then rolls everything back. It requires an existing designated admin and does not restrict any real member.

Run `supabase/tests/admin_dashboard.sql` for admin authorization, private draft products, time-adjustment idempotency/removal, member balances, separate currency totals, notification read marks, deposit review history, and payment-mode guards. It also requires an existing admin and rolls back all synthetic fixtures. These checks do not change any real member's balance or payment status.

- Apply the migration before deploying the frontend changes.
- Keep the Supabase publishable key in the browser; never add the service-role key to `VITE_` variables.
- Use HTTPS for public media links and the production site.
- Manual payment instructions are visible to signed-in members once enabled. Verify the wording and destination details before saving.
- This workflow is a manual review process, not a payment processor integration.
