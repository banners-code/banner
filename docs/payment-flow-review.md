# Payment experience review

Reference inspected in the signed-in browser on 6 November 2026: [ZynMotion Live AI Studio](https://zynmotion.com/live-ai-studio).

Observed flow:

- Buy AI Time opens pack cards with price, minutes, validity and a payment-method selector.
- Manual payment opens another step with a verification notice, channel selection, bank information, the NGN amount to transfer, copy controls, a transaction reference and receipt upload. Multiple bank/crypto channels were visible on the reference site.
- The automatic option is **Paystack**, which navigates to Paystack's hosted checkout and offers card, transfer, bank and other payment methods. Checkout was inspected and closed without entering payment credentials or making payment. Its successful payment/crediting behavior was not tested.

Kinetelle changes adopt the interaction sequence with the existing Kinetelle design and approved pack values. They do not reuse the reference site's bank accounts, crypto addresses, prices, brand assets or review-time promise.

The shared dialog is available from the dashboard and Studio, stays within the viewport, scrolls internally, traps focus with a native modal dialog, closes on Escape and restores focus. It uses one configured manual receiving destination, with optional structured bank fields and free-form instructions. Multiple destinations/crypto payments have not been added.

The owner specified 1,380 NGN per USD. This editable manual payment rate yields ₦13,800, ₦27,600 and ₦55,200 for the $10/$20/$40 packs. Rate conversion and immutable bank/amount snapshots are enforced by the database. Quotes are owner-scoped and resumable until expiry; submitted quotes cannot be reused. Deposit review shows the saved currency conversion and grants the quoted seconds/validity.

Bachs remains the intended automatic provider. Its customer option is unavailable until server checkout, verified webhook handling, event deduplication, pack allocation and production configuration are implemented. No Paystack dependency, guessed API endpoint or unverified SDK method was introduced. The [official checkout guide](https://docs.bachs.io/guides/checkout/checkout-sessions) was reviewed in the browser: it supports raw server-computed pricing and explicit per-currency amounts, so products are optional for this future flow. Public success/cancel URLs are required, including in sandbox; localhost redirects are refused. See [the Bachs integration boundary](bachs-integration.md).

Verification covers exact decimal conversion, fixed quotes after FX/bank edits, member receipt handling, oversized-file rejection, receipt removal, owner-only resume and reviewed time grants. See [pricing setup](pricing-and-expiry.md) for migration order, publication and expiry rules. No real bank payment or receipt submission was used for verification. Live Decart media cutoff remains pending provider funding from the previous phase.
