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

Sign in and open `/admin`. The **Homepage** section controls the hero, workflow steps, feature cards, featured demonstration, FAQs, and closing message. It supports image and video uploads or direct HTTPS media URLs. Uploaded images are limited to 15 MB; videos are limited to 100 MB. Supported uploads are JPG, PNG, WebP, MP4, and WebM. A video URL must point directly to an MP4/WebM file; the editor does not embed arbitrary video pages.

Homepage media is public because it is displayed on the public site. Do not upload private or customer-owned material without permission. The hero defaults to the original Kinetelle artwork if no media URL is set. The featured demonstration appears only after a demo media URL is saved and is labeled as demonstration media.

Use **Inbox & contact** to open `/admin/support`, reply to support conversations, and edit the public contact details shown on the homepage.

## 4. Enable manual payments

Open **Manual funding** and set:

- The three-letter currency code.
- Optional minimum payment amount.
- Payment instructions shown to signed-in members (for example, the payment channel and account details you choose to publish).
- Instructions for finding the payment reference.
- **Accept manual funding requests** only after those details are ready.

No bank details, payment amount, package, or amount-to-time conversion is prefilled. Members enter the amount they paid, provide a payment reference, and upload a receipt image or PDF up to 10 MB. Receipt files are stored in a private Supabase Storage bucket and can be opened only by the member who uploaded them and designated admins.

Review each request in the admin queue against your payment provider or bank records. **Approve and grant** adds the live minutes you enter to the member's time ledger in the same database transaction that marks the request approved. **Reject** requires a note, which the member can see in their dashboard. The app does not verify transfers automatically and does not contact a payment provider.

## 5. Deployment notes

- Apply the migration before deploying the frontend changes.
- Keep the Supabase publishable key in the browser; never add the service-role key to `VITE_` variables.
- Use HTTPS for public media links and the production site.
- Manual payment instructions are visible to signed-in members once enabled. Verify the wording and destination details before saving.
- This workflow is a manual review process, not a payment processor integration.
