# Bachs funding integration boundary

The member dashboard currently supports admin-configured manual payment instructions and review. The automated Bachs flow described here is a separate future integration; it is not active. Keep the permanent Bachs API key and webhook signing secret on the Node server if that integration is added later.

## Documented flow

1. Create one-time products in the Bachs developer portal. The app needs an explicit mapping from each Bachs product ID to the number of live-time seconds it grants. Product prices stay in Bachs; Kinetelle must not guess a price or a time conversion.
2. The signed-in browser asks the Kinetelle server to start a checkout for a selected, configured product. The server verifies the Supabase access token and calls the official `@bachs/sdk` `checkoutSessions.create()` method with the product, customer email, success URL, cancel URL, and metadata that identifies the account and pack. The server returns only the hosted `checkout_url` for browser navigation.
3. Configure a public HTTPS webhook endpoint in the Bachs developer portal and subscribe to `collection.succeeded` (and `checkout.completed` if the server uses it for reconciliation). Read the raw request body and verify its signature with `webhooks.constructEvent()` before trusting the event.
4. Deduplicate by Bachs event ID. Confirm a successful collection and its checkout/product against the server-side pack mapping, then write one grant to `live_time_credit_grants` through a server-only database credential or restricted database function. Never grant credits from the browser redirect or client-provided metadata alone.
5. Return a 2xx response after the event is durably stored and handled. Bachs documents at-least-once delivery and retries, so the handler must be idempotent.

## Required configuration before checkout can be enabled

- A Bachs sandbox API key for development and a live key for production, stored only as server environment variables.
- A Bachs webhook signing secret, stored only as a server environment variable.
- One or more Bachs product IDs and their prices/currencies.
- The live-time seconds granted by each product.
- A server-only Supabase credential or an audited restricted function for inserting credit grants.
- Public HTTPS success, cancel, and webhook URLs for production.

The exact environment variable names and pack configuration should be agreed when these values are available. Do not add permanent credentials, guessed prices, or a guessed minutes-per-credit conversion to the frontend or repository.

## Official Bachs references

- [Developer overview](https://docs.bachs.io/developers/overview)
- [Accept a payment with Checkout](https://docs.bachs.io/guides/checkout/checkout-sessions)
- [Node.js and TypeScript SDK](https://docs.bachs.io/sdks/node)
- [Set up and verify webhooks](https://docs.bachs.io/guides/webhooks/overview)
