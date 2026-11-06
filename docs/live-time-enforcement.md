# Server-controlled live sessions (Phase 11)

## Setup and rollout

Apply all migrations through `20261106000000_live_time_enforcement.sql`, then `20261106010000_server_signaling.sql`. Set `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) only on the Node server and restart it. Never put secrets in `VITE_` variables, build arguments, browser code, or Git.

The Phase 11 migration refuses to run while an active direct-token authorization remains. Stop old clients before deployment; previously released Decart credentials cannot be revoked retroactively. Deploy the database, Node server, and frontend together. `/api/realtime-token` now returns 410 and never returns credentials. The matching frontend must reload.

The VPS proxy must pass WebSocket upgrades for `/api/realtime/v1/stream`, preserve Origin, and omit URL query strings from logs. See [deployment configuration](deployment.md). `/readyz` requires the build and server-side provider/accounting configuration in production. It checks configuration, not Decart balance or live inference health.

## Connection flow

1. A signed-in member reserves an app session through `POST /api/live-sessions`. Identity is verified through Supabase Auth. One active authorization is allowed per account, enforced under a database row lock and unique constraint.
2. After camera/microphone setup, the SDK's credential provider calls `POST /api/connection-ticket`. It receives a random 256-bit app ticket valid for 15 seconds. Only its SHA-256 hash is stored.
3. The official SDK's `realtimeBaseUrl` points to the app's signaling server. Its `api_key` query parameter carries the app ticket, never a Decart key. The server checks Origin, path, model and permitted options, then atomically consumes the ticket. Reuse is rejected. A second ticket cannot create a competing provider connection while the first connection fence remains active, even on another Node instance.
4. The proxy creates a scoped Decart token through the official `client.tokens.create()` method and connects to the documented `wss://api.decart.ai/v1/stream` endpoint. Permanent and ephemeral Decart credentials remain on the server.
5. Signaling, prompts, and reference images pass through the proxy. Camera and microphone media flow directly between the browser and Decart via the SDK's LiveKit transport. Prompts/reference payloads are not stored or logged by the proxy. The output frame remains clear.

The proxy permits `livekit_join` once, followed by validated prompt/image updates. Binary frames, forged usage events, unsupported message types, duplicate joins, another model, or a requested fast tier are rejected. Images are limited to 10 MB decoded; WebSocket payloads, buffering, message rate, and per-process connections are bounded. Default per-process connection capacity is 32. Fast mode stays off.

## Accounting and cutoff

- At least 10 seconds is required to connect. Smaller residual balances remain on the account.
- Reserving and issuing an app ticket charge no time. Metering starts when the server consumes a connection ticket and claims the provider connection, after camera/microphone setup. Token minting, connection/capacity waits, and reconnect time then count. Kinetelle bills server wall-clock authorization time, rounded up once per session to seconds; it does not claim to bill exact Decart generation-frame time.
- The authorization is bounded by the remaining account balance and a one-hour maximum. Reconnects keep the original deadline. Admin removals shorten it at the next verification; additions can be used on the next session.
- The server verifies the active connection every three seconds and enforces a conservative local deadline independently of browser timers. A failed or stalled database verification closes upstream. Browser countdowns and 10-second heartbeats provide UI feedback but cannot extend a claimed provider connection.
- Stop marks the authorization for closure. The owning process closes the provider immediately when it receives the HTTP request; another process observes the marker on its next verification. The database releases the connection fence only after confirmed upstream closure. A late callback from an older connection cannot release a newer fence.
- Normal provider connections have a maximum duration of five minutes or remaining allowance, whichever is shorter. The SDK obtains a new ticket and reconnects when that connection window ends, within the original app allowance. Renewal may briefly interrupt output. This limits recovery exposure when a server or network fails.
- If upstream closure cannot be confirmed, the connection slot stays occupied until its provider-duration guard expires: at most the five-minute provider cap plus a 60-second dial/expiry margin. A browser Stop or browser timeout cannot release it early. Accounting conservatively continues until the guard or account deadline, whichever comes first. Disputed time after an infrastructure failure needs review and an audited admin adjustment. This behavior favors preventing unmetered overlapping streams over automatically refunding an uncertain remote connection.
- Pending, unclaimed authorizations expire after 45 seconds without updates and cost zero time. A confirmed provider connection followed by a lost final HTTP Stop can leave the app authorization pending for up to 45 seconds.

Provider generation-start, cumulative tick, generation-end, and session-ID messages are recorded only from the upstream socket. Cumulative values are monotonic and duplicate-safe per connection; reconnect totals are added to `live_usage_sessions.provider_seconds`. They are reconciliation data, separate from wall-clock billing. Members cannot write these observations or call the server RPCs. Account bans/suspensions are checked against the verified target, including server-key calls that deliberately have no user JWT.

## Purchased time expiry

After the pricing and expiry migrations, spendable balances exclude unused expired purchases. Existing grants and admin adjustments stay non-expiring. Authorization is capped at the earliest remaining purchase expiry; members can start another session with remaining valid time. See [pricing and expiry](pricing-and-expiry.md). The private total-credit helper returns spent plus spendable time, preserving existing authorization checks; lifetime grants plus adjustments are returned separately.

## Verification and current limit

`npm test` covers the Studio, accounting lifecycle, single-use app ticket responses, and real local WebSocket connections against a controlled fake upstream. Tests cover replay, invalid origin/model/options, server cutoff without browser timers, failed verification, ownership checks, forged usage, prompt forwarding, credential redaction, and unconfirmed provider closure.

Run `supabase/tests/server_signaling.sql` in the SQL editor as postgres. It uses a synthetic account in a transaction and rolls back everything. It checks private privileges, service-role calls with no user JWT, target moderation, zero balance, ticket expiry/replay, one provider connection, reconnect deadlines, stale callbacks, duplicate usage events, confirmed stop, and crash guards. This replaces the Phase 10 test's retired direct `authorize` action.

The opt-in real-provider probe is:

```sh
node scripts/check-live-signaling.mjs --run-live
```

It creates only its own disposable Supabase account and time grant, uses the local API, sends no camera/microphone/reference media, attempts a provider room join and reconnect, shortens only the fixture balance to test server cutoff, and removes the account afterward. It uses real provider signaling and can consume provider resources; it is not part of `npm test`. Review its JSON result and confirm `fixtureRemoved` if it fails.

Current result: Decart returned **Insufficient credits** at room join; both attempted fixtures were removed. Real-provider reconnect/cutoff and actual transformed-media shutdown remain unverified until the provider account is funded. The user chose to finish with this verification pending. Local wire tests and database checks passing do not prove live media termination or five-minute SDK renewal against Decart. Do not enable automatic paid usage or describe this as production-verified billing until those live checks pass.

Official references: [Decart signaling integration](https://docs.platform.decart.ai/integrations/signaling-proxy-ws), [client-token duration constraints](https://docs.platform.decart.ai/getting-started/client-tokens), [SDK source](https://github.com/DecartAI/sdk), and [Supabase server keys](https://supabase.com/docs/guides/getting-started/api-keys).
