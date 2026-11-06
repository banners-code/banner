# Pricing and expiring time packs

Open **Admin → Settings → Payment Settings** (`/admin/settings/payments`). The first card controls selling price, currency, publication and private cost estimates. Saving a rate does not activate payments.

The initial saved, unpublished configuration is USD $2 per minute:

| Live time | Listed price | Manual payment at 1,380 NGN/USD | Validity from approval |
| --- | --- | --- | --- |
| 5 minutes | $10 | ₦13,800 | 3 days |
| 10 minutes | $20 | ₦27,600 | 14 days |
| 20 minutes | $40 | ₦55,200 | 14 days |

Each pack has editable name, minutes, validity, listing status and price. **Follow the saved standard price per minute** is on initially: saving the standard rate reprices these packs for future quotes. Turn it off to enter a custom price. Save the standard rate before editing packs that follow it. Admins have a disabled member-card preview, including unpublished packs.

## Enable purchases

1. Apply `20261106020000_customer_pricing.sql`, `20261106021000_credit_expiry.sql`, then `20261106022000_payment_experience.sql`, after server signaling. Deploy the matching frontend.
2. Review listing/payment currencies and the manual exchange rate in Payment Settings. For USD listings and an NGN receiving account, use base currency USD and rate 1,380 (the owner's explicit initial choice). This rate is manually maintained, not fetched from markets. The payable amount is the listed amount multiplied by the rate and rounded to two decimal places. Same-currency payments always use factor 1. Never relabel an NGN receiving account as USD.
3. Configure manual instructions and a minimum amount below the cheapest listed pack, then save the payment mode.
4. Check **Publish customer pricing when saved** and **Save pricing**. Members then see pack cards in the shared **Buy AI time** dialog from the dashboard or Studio. New receipt submissions require a published pack or an existing valid quote. Existing requests remain available for review.

Different currencies require a matching base currency and a positive exchange rate. Valid, unused quotes lock changes to the receiving currency and the listed currency for up to 24 hours. Rate and bank-detail edits are allowed, but affect new quotes only. Existing quote amounts, rates, bank snapshots and validity remain unchanged.

## Receipt and expiry lifecycle

Members choose a pack and payment method. **Continue to Payment** requests a server-calculated, owner-bound quote valid for 24 hours before showing instructions. It stores listed currency/price, actual receiving currency/amount, exchange rate, bank details, seconds, pack name and validity. Instructions and copy controls use this snapshot. Members can resume their latest unused quote after closing/reopening the dialog. They upload a receipt and reference against the fixed transfer amount; image previews stay local until submission. No provider charge happens through this app; Bachs automatic checkout remains inactive.

The insert trigger ignores client-supplied allocation/validity fields and rejects expired, reused, foreign, or amount/currency-mismatched quotes. Published pricing requires a quote for new requests. Older unquoted requests remain reviewable with admin-entered whole minutes.

In **Deposits**, an admin verifies the receipt outside the app, then approves the saved allocation. Approval and the grant are atomic, duplicate-protected and audited. Priced requests cannot be changed at approval: use a separate **Manage Users** adjustment for a correction or bonus. A submitted quote remains reviewable after the 24-hour submission window.

Validity begins at approval, not quote or receipt creation. Only unused purchased seconds expire. Usage consumes credits with the earliest expiry first, then non-expiring time. Members see remaining lots and expiry dates on their dashboard and purchase expiry in payment history. Existing grants and admin adjustments have no expiry. Signed removals consume earliest-expiring available time and cannot exceed the spendable balance.

Server accounting and signaling enforce expiry. A provider authorization is capped at the earliest remaining purchase expiry, so an active connection can stop then even if non-expiring time remains. The member can start another session using valid time. This cap preserves the conservative recovery guard after an unconfirmed provider closure. Actual Decart reconnect/media cutoff remains pending provider funding; see the live-time guide.

## Estimates and accounting

Provider USD/second, the cost-estimate exchange factor, fee percentage and other cost/minute are admin-only estimates. This cost-estimate factor uses 1 for USD. The separate customer-payment exchange rate in Funding Settings is shown on quotes and determines the actual transfer amount. The cost preview assumes 60 seconds of provider generation per billed minute and excludes costs not entered. Standard Lucy 2.6 was checked at $0.02/second ($1.20/minute) on 6 November 2026: [official pricing](https://docs.platform.decart.ai/getting-started/pricing). At $2/minute the entered-cost difference is $0.80 before additional costs; it is not net profit or an invoice.

No historical grant or session is rewritten. The balance function replays grant, adjustment and expiry boundaries with per-session rounded usage, debiting earliest-expiring lots. `credited_seconds - spent_seconds` remains spendable time; `lifetime_credited_seconds` preserves grants plus signed adjustments. `expired_seconds` reports unused expired time; `expiring_credits` reports remaining lots. Admin total granted uses the lifetime field.

## Verification

`npm test` covers decimal/cost math, explicit publication, custom pack editing, card values, quote binding, receipt submission and expired-quote blocking. `npm run build` checks TypeScript and the production bundle.

Run `supabase/tests/customer_pricing.sql` and `supabase/tests/payment_experience.sql` as postgres. All fixtures, temporary settings, requests, grants and audit entries are rolled back. They check RLS, forged snapshots, approval validity, duplicate review, repricing, legacy balances, expiry ordering, owner-only quote resume and FX/bank snapshots. `supabase/tests/server_signaling.sql` covers existing signaling behavior. These tests do not spend provider credit or use real member balances.
