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
10. `20261106000000_live_time_enforcement.sql`
11. `20261106010000_server_signaling.sql`
12. `20261106020000_customer_pricing.sql`
13. `20261106021000_credit_expiry.sql`
14. `20261106022000_payment_experience.sql`

The pricing migrations seed unpublished USD packs at $10/5 minutes/3 days, $20/10 minutes/14 days, and $40/20 minutes/14 days, with a $2/minute standard rate. Manual payments may use a different currency with an explicit exchange rate. The payment-experience migration initializes the approved USD/NGN rate at 1,380 only when no rate exists. Published requests honor server quotes; older requests retain manual allocation. See [pricing setup and expiry](pricing-and-expiry.md).

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

The API panel uses the authenticated, admin-only `/api/admin/status` route. Configuration status and successful/failed connection-ticket requests describe this application server; counters reset when that process restarts. They do not measure Decart account balance, provider billing, or provider uptime.

**Notifications** shows the latest 100 pending deposits, open reports, customer support messages, and accounts created within seven days. Read marks belong to each administrator. **Action History** records new account actions, report/deposit reviews, manual time adjustments, and app/payment/contact/draft-product setting changes; earlier actions are not backfilled.

### Manage users and live time

**Manage Users** provides paginated account search. Select an account to see available time, recorded usage, total grants, account dates, and the latest 25 entries in each session/deposit/time-history list. **Add or adjust live time** accepts whole minutes and requires a reason. Removals cannot exceed available time. Each adjustment is recorded separately from session history, and a retry with the same request reference cannot issue the adjustment twice. A single adjustment is limited to 525,600 minutes in either direction.

Time balances include approved funding grants and manual adjustments. Phase 10 authorizes live time on the server, enforces one active app session, and disconnects the Studio at its allowance deadline. See [the live-time accounting rules and provider boundary](live-time-enforcement.md). The API panel also shows whether server-side accounting credentials are configured.

## 4. Enable manual payments

Open **Settings → Payment Settings** and set:

- The three-letter currency code.
- Optional minimum payment amount.
- Payment instructions shown to signed-in members (for example, the payment channel and account details you choose to publish).
- Instructions for finding the payment reference.
- Listed price currency and exchange rate, expressed as payment-currency units per one unit of listed currency. The current USD/NGN setting is 1,380, editable here.
- Optional structured bank name, account name and account number for individual copy buttons; free-form instructions remain supported.
- Review notice shown to members. Enter a review-time estimate only if your team can meet it.
- Select **Manual payments** only after those details are ready. Choose **Payments paused** to stop new submissions.

Bank details must be configured by the admin. With pricing published, members choose a quoted time pack before paying; with pricing unpublished, the legacy manual amount form remains available. Members provide a reference and upload a receipt image or PDF up to 10 MB. Receipts are stored in a private Supabase bucket and accessible only to their owner and designated admins.

Review each request under **Deposits** against bank or provider records. **Approve and grant** honors a priced request's saved seconds and approval-based validity. Older unquoted requests use the live minutes you enter. The grant and review commit together. **Reject** requires a note visible to the member. The app does not verify transfers automatically or contact a payment provider.

Payment Settings also stores admin-only Bachs product drafts: a provider product reference, currency, display amount, and live minutes. These drafts do not create provider products, initiate checkout, or grant time. Automatic payment mode is disabled in the interface and rejected by the database until a verified checkout/webhook integration is implemented. Paused/manual mode changes take effect when saved. No payment secrets are entered in this browser interface.

## 5. Deployment notes

**Manage Users**, **Abuse Reports**, and **Action History** provide a paginated email/ID search, account details, suspension with an expiry, indefinite bans, restoration, abuse-report review, and a read-only moderation action history. A reason is required for every account action. Admin accounts cannot be restricted through these functions. These are Kinetelle feature restrictions: users retain sign-in, account access, data export/removal, and Support for appeals. They do not change Supabase Auth credentials or delete accounts.

Members can submit reports at `/report` (up to five per 24 hours). Reports do not automatically restrict an account. Admin report notes are visible to the reporter; account-action reasons are visible to the affected member. No moderation data is public.

Apply the moderation migration before restarting the Node server with these changes. The token route checks `get_account_access` using the verified user's bearer token, and fails closed when access cannot be verified. The browser checks access every 15 seconds and on focus, unmounting the Studio and disconnecting its media when restricted. New token issuance is blocked server-side. Previously issued provider tokens/streams cannot be forcibly revoked by this app; an altered client can ignore browser checks. Provider-level revocation is not implemented. Moderation itself uses the public key with user-scoped verification; Phase 10's accounting adds a separate server-only secret key.

Audit history includes account actions, report reviews, manual time adjustments, and app/payment/contact setting changes. Existing historical events are not backfilled.

For a database regression check, run `supabase/tests/account_moderation.sql` in the SQL editor as postgres. It creates a synthetic member inside a transaction, checks non-admin directory denial, protected admin accounts, report limits, restriction/restoration, RLS, audit privacy, live usage denial, and suspension expiry, then rolls everything back. It requires an existing designated admin and does not restrict any real member.

Run `supabase/tests/admin_dashboard.sql` for admin authorization, private draft products, time-adjustment idempotency/removal, member balances, separate currency totals, notification read marks, deposit review history, and payment-mode guards. It also requires an existing admin and rolls back all synthetic fixtures. These checks do not change any real member's balance or payment status.

After Phase 11, use `supabase/tests/server_signaling.sql` for current session accounting checks. It supersedes the Phase 10 test's direct `authorize` action, which is intentionally retired. The API panel shows server-controlled signaling and the number of connections on that Node process. Unconfirmed provider closures retain an account's connection slot until the bounded provider guard expires; see the live-time guide before making an adjustment to a disputed balance.

- Apply the migration before deploying the frontend changes.
- Keep the Supabase publishable key in the browser; never add the service-role key to `VITE_` variables.
- Use HTTPS for public media links and the production site.
- Manual payment instructions are visible to signed-in members once enabled. Verify the wording and destination details before saving.
- This workflow is a manual review process, not a payment processor integration.
