# Bachs funding integration boundary

The member dashboard currently supports admin-configured manual payment instructions and review. Automatic Bachs checkout is not active. The official SDK and a server-only boundary now prepare hosted checkout requests from trusted saved quotes and verify raw webhook signatures. This boundary is not connected to any public route, checkout UI, payment ledger, or time grant. The remaining integration and end-to-end sandbox checks must be completed before enabling it. Keep the API key and signing secret on the Node server.

## Documented flow

Rechecked against the official hosted checkout guide on 6 November 2026. For Kinetelle's editable packs, the preferred future approach is server-computed raw `pricing`, with an explicit NGN entry in `currency_options` when honoring the admin's payment rate. Bachs also supports product carts; those require product mappings. Supply one pricing source only. The existing admin product rows remain inactive drafts, not a prerequisite for raw-amount checkout.

1. Resolve a selected Kinetelle pack and its immutable price/time/validity quote on the server. For raw pricing, use the documented `pricing` object rather than requiring a provider product. Alternatively, use one-time Bachs products with an explicit product-to-time mapping. Never trust a client-supplied amount or time allocation.
2. The signed-in browser asks the Kinetelle server to start checkout for a selected pack. The server verifies the Supabase token and uses the documented checkout creation flow with the saved pricing source, customer identity, success/cancel URLs and metadata identifying the account and quote. Return only the hosted `checkout_url` for navigation.
3. Configure a public HTTPS webhook endpoint in the Bachs developer portal and subscribe to `collection.succeeded` (and `checkout.completed` if the server uses it for reconciliation). Read the raw request body and verify its signature with `webhooks.constructEvent()` before trusting the event.
4. Deduplicate retries by Bachs event ID and fulfillment by a unique checkout ID, so two different success-event types cannot grant the same purchase twice. Verify successful payment, amount, currency and checkout against the saved quote, then atomically grant its time/validity through server-only credentials or a restricted function. Never grant from a browser redirect or client-provided metadata alone.
5. Return a 2xx response after the event is durably stored and handled. Bachs documents at-least-once delivery and retries, so the handler must be idempotent.

## Required configuration before checkout can be enabled

- A Bachs sandbox API key for development and a live key for production, stored only as server environment variables.
- A Bachs webhook signing secret, stored only as a server environment variable.
- Server-side pack pricing/currencies, or Bachs product IDs if using catalog carts.
- The live-time seconds granted by each product.
- A server-only Supabase credential or an audited restricted function for inserting credit grants.
- Public success, cancel and webhook URLs. Bachs rejects localhost/private redirect URLs even in sandbox; use a public development URL for testing and HTTPS in production.

The manual payment rate is currently 1,380 NGN/USD. Changing it must affect only new automatic quotes as well. The future handler must verify the paid currency and amount against the saved quote and grant its saved seconds/validity once. A success-page visit alone must never credit an account. No automatic checkout API call or webhook endpoint was added in this payment-experience change.

The exact environment variable names and pack configuration should be agreed when these values are available. Do not add permanent credentials, guessed prices, or a guessed minutes-per-credit conversion to the frontend or repository.

## Official Bachs references

- [Developer overview](https://docs.bachs.io/developers/overview)
- [Accept a payment with Checkout](https://docs.bachs.io/guides/checkout/checkout-sessions)
- [Node.js and TypeScript SDK](https://docs.bachs.io/sdks/node)
- [Set up and verify webhooks](https://docs.bachs.io/guides/webhooks/overview)
