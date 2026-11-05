# Kinetelle Studio

**Kinetelle Studio** is the provisional working identity for a premium browser based live visual studio. The name and design direction are original project concepts; complete domain and trademark clearance before public launch.

## Phase 9

The admin workspace now opens on **Admin Dashboard**, with user/session/time metrics, currency-specific deposit totals, API configuration and token activity, support/report counts, and notifications. Its persistent sidebar groups **App Settings**, **Payment Settings**, and **Contact Settings** under Settings and becomes a drawer on mobile. **Manage Users** includes account activity, deposits, time history, and audited manual additions/removals with duplicate-request protection. Apply `20261105210000_admin_dashboard.sql` and `20261105211000_funding_review_audit.sql` after the moderation migration. Automatic payment products can be saved as admin-only drafts; activation stays blocked until checkout and verified webhooks are connected.

Phase 9 adds **Users & safety** to `/admin`: account search, temporary suspension, bans, restoration, abuse report reviews, and immutable moderation audit entries. Members report misuse at `/report` and retain Support access for appeals. Apply `supabase/migrations/20261105200000_account_moderation.sql` before restarting the API server. The server checks moderation status before issuing each Decart token; the Studio also checks every 15 seconds and on browser focus. See [docs/admin-console-setup.md](docs/admin-console-setup.md) for enforcement boundaries.

Phase 8 adds an admin workspace for homepage copy, workflow/features/FAQ sections, hero and demo image/video, manual payment instructions, and payment receipt review. Support contact settings and the support inbox remain available to the same designated admin role. Member funding requests are manual: customers submit an amount, reference, and private receipt; an admin verifies payment and enters the live minutes to grant. No payment provider or amount-to-time rate is assumed.

The prior Phase 7 added Terms and Privacy pages, required signup agreement and age 18+ confirmation, and consent records. Phase 6 added the member dashboard, live-session history, and Supabase support inbox. **Photorealistic Human** remains the only starting direction.

The legal pages are an implementation draft that describes the current app and provider data flows. They are not legal advice. Before public launch, have qualified Nigerian counsel review them, identify the legal operator and privacy contact, confirm provider/API terms and data locations, and set a specific retention schedule. The liability language preserves rights and responsibilities that applicable law does not allow the service to waive.

- A local camera preview works without a Decart key. **Preview this direction locally** applies a CSS study and keeps media in the browser.
- **Start live transformation** is the explicit point at which an authenticated user's camera, microphone and selected reference image are sent to Decart.
- The canvas toolbar identifies a local demo output and changes to **AI Output Live** only after the SDK delivers a transformed remote stream; the output frame itself stays clear.
- The permanent Decart key stays in the Node server. The browser requests a short lived client token immediately before connecting and on reconnects.
- Saved directions contain only the prompt and preset identifier. Studio preferences contain the prompt, preset identifier, and aspect ratio. Camera frames and reference image files are not stored in Supabase.
- The member dashboard tracks live time and session history. Manual payment review can be enabled by an admin; Bachs checkout is not connected and there are no assumed prices or time conversion rates.

## Member dashboard

If the admin tables were created during an earlier partial setup, apply `supabase/migrations/20261105170000_reconcile_homepage_settings.sql` after the admin migration. It adds missing homepage content columns with defaults and refreshes the API schema cache while preserving existing content.

Signed-in members land on `/dashboard` after email/password sign-in or email confirmation. The dashboard shows live time granted to the account, time used in Decart sessions, session count, and recent session history. Studio usage is recorded through authenticated Supabase functions with server-side timestamps and periodic heartbeats. The live time credit table is read-only to members; trusted server integrations can grant time after a verified payment. No initial time grants or package values are assumed, so an account with no grants displays zero available time.

The **Fund account** control opens the manual payment panel when an admin has configured payment instructions. A member submits the amount they paid, payment reference, and a private receipt image or PDF. The admin verifies payment outside the app, then approves and enters the number of live minutes to grant. Rejections require an admin note. Time grants and request review are committed in one database function. Bachs checkout remains unconnected.

## Run locally

For the full admin workspace, apply every migration listed in [the admin setup guide](docs/admin-console-setup.md), including reconciliation, moderation, dashboard, and funding-review audit migrations. The initial account setup migrations below are only the foundation.

```bash
npm install
```

Copy `.env.example` to `.env.local`, then set the values:

```dotenv
DECART_API_KEY=your-decart-api-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
APP_ORIGINS=http://localhost:5173
TRUST_PROXY_HOPS=0
```

`DECART_API_KEY` is server-only. The Supabase URL and publishable key are included in the browser app; database access is protected by Row Level Security. Do not add a Supabase service-role key to the browser environment. `.env.local` is ignored by Git.

In the Supabase dashboard, enable Email sign-in and add `http://localhost:5173/dashboard` and `http://localhost:5173/account` to the allowed redirect URLs. Apply migrations in timestamp order: `supabase/migrations/20261104000000_studio_user_data.sql`, `supabase/migrations/20261104120000_support_inbox.sql`, `supabase/migrations/20261105090000_live_usage_and_time_credits.sql`, `supabase/migrations/20261105130000_legal_consent.sql`, and `supabase/migrations/20261105160000_admin_site_and_manual_funding.sql`. The legal migration adds a signup trigger and consent audit row for new users; it does not backfill existing users. The admin migration adds homepage content, RLS-protected settings, public site media, private payment receipts, funding requests, and the admin review function. Grant the first admin as described in [docs/admin-console-setup.md](docs/admin-console-setup.md). Apply all migrations before deploying these changes.

Run the application:

```bash
npm run dev
```

Open `http://localhost:5173/`. The development command runs Vite and the token server together. Without `DECART_API_KEY`, the camera and local CSS preview still work; live sessions display a setup message.

Camera access requires a supported browser and a secure context. `localhost` is treated as secure by modern browsers. The browser requests camera permission only after the user chooses **Enable camera**.

## Production build and run

```bash
npm run build
npm start
```

The Node server serves the production build and the same-origin token route. Provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` when building the browser bundle, plus `DECART_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGINS` to the server at runtime. The server also accepts the `VITE_` Supabase names at runtime for local convenience. For a public deployment, `APP_ORIGINS` must contain the exact HTTPS origin(s) that host the app, such as `https://studio.example.com`, and add `https://studio.example.com/account` to Supabase's allowed redirect URLs. `API_PORT` takes precedence over platform `PORT`; the default is `8787`. Set `TRUST_PROXY_HOPS` only when the app is behind a known number of trusted reverse proxies. `npm run preview` serves the built app through the same Node server.

The token route verifies the Supabase access token with Supabase Auth before creating a Decart client token. It applies a per-process, per-IP limit of eight requests per minute, checks the browser origin, restricts tokens to `lucy-2.6`, and scopes each token to the request origin. The rate limit is process-local, so a multi-instance deployment should use a shared limiter before increasing traffic. `/healthz` reports liveness; `/readyz` checks the production build, Decart/Supabase configuration, and exact HTTPS app origins. API request logs are JSON-formatted and omit query strings, headers, and provider error details.

The homepage includes editable hero, workflow, feature, demo, FAQ, and closing content. Homepage edits update open pages through Supabase Realtime. Admins use `/admin` for the dashboard, `/admin/settings/app` for site content, `/admin/settings/payments` for payment configuration, `/admin/settings/contact` for public contact details, `/admin/deposits` for receipt review, and `/admin/support` for conversations. In-page support updates and opt-in browser alerts are available while the admin inbox is open; background push and email delivery are not configured.

API counters in the admin dashboard are process-local and reset on server restart. They report token issuance activity, not provider billing or account balance. Dashboard money totals remain separate by currency. Member time balances include manual adjustments; enforcing exhaustion of a running provider stream remains outside this update. See [admin setup and regression checks](docs/admin-console-setup.md) for all migrations and limits.

## Container deployment

Build and run a production image with Docker using the host-neutral setup in [docs/deployment.md](docs/deployment.md). The multi-stage image uses the current Node.js 26 LTS Alpine base, installs only production dependencies in its runtime stage, runs as the non-root `node` user, and includes `/readyz` as its container health check. The Vite Supabase URL and publishable key are build arguments; Decart and server-side Supabase values are supplied at runtime. No hosting provider or live deployment is selected here.

## Studio interactions

- Start and stop a real webcam preview, handle browser permission errors, and select among available cameras.
- Start from the Photorealistic Human direction, edit the prompt, and optionally select a JPG, PNG, or WebP reference image.
- Create an account with email and password, sign in, sign out, and resume a session from Supabase Auth. Successful sign-in and confirmation return to the member dashboard.
- View available live time, total live time used, session count, and recent live-session activity on the member dashboard.
- Record Decart session time with authenticated Supabase start, heartbeat, stop, and summary functions; local camera previews are not counted.
- Submit a manual payment from the dashboard with amount, transfer reference, and receipt. Admins verify the payment and enter the live minutes before credits are added.
- Request a password reset, update the password through the recovery link, and return to the Studio.
- Save, load, and delete prompt directions; persist the prompt and selected aspect ratio for the signed-in account.
- Download a JSON copy of saved directions and preferences, or delete that Studio data from the account.
- Preview a local CSS look without sending video or image data.
- Start an explicit Decart live session, update its prompt/reference image, see connection and capacity retry states, and stop it by stopping the camera or leaving the Studio.
- View a single 16:9 landscape output canvas sized for OBS window capture while the local camera preview stays in the Source panel; a compact 9:16 portrait frame and fullscreen remain available.
- Use the Studio at narrow widths; panels stack into a single column.

## Data flow and provider boundary

The browser uses `getUserMedia` to open a local camera preview without microphone capture. When **Start live transformation** is selected, it requests microphone access, configures the camera at the model's native dimensions, and sends the camera and microphone streams to Decart. A selected reference image is also passed to Decart at session start and when the direction is updated. Stopping the session disconnects the SDK and stops the local camera and microphone tracks.

The app-owned `TransformationAdapter` keeps the UI separate from provider calls. `DecartTransformationAdapter` is the only browser module that imports the Decart SDK; it uses the documented `lucy-2.6` model, `client.realtime.connect()`, atomic `realtime.set()` updates, and `disconnect()`. Fast mode remains off. The Node server's app-owned `POST /api/realtime-token` route uses the documented `client.tokens.create()` method. No direct or undocumented Decart HTTP endpoint is used.

## Project structure

- `src/pages/LandingPage.tsx` — brand landing page and look gallery.
- `src/pages/StudioPage.tsx` — live Studio state and workspace composition.
- `src/features/studio/useCameraInput.ts` — browser camera permissions, device discovery, and track cleanup.
- `src/features/studio/transformation/TransformationAdapter.ts` — app-owned provider boundary and state types.
- `src/features/studio/transformation/DecartTransformationAdapter.ts` — isolated official Decart browser SDK integration.
- `src/features/studio/CameraPanel.tsx`, `PreviewStage.tsx`, and `DirectionPanel.tsx` — modular Studio panels; the camera preview lives in Source and the canvas shows only Output.
- `src/features/studio/StreamVideo.tsx` — shared browser stream renderer for source and output previews.
- `src/pages/AccountPage.tsx`, `src/pages/UserDashboardPage.tsx`, and `src/auth/AuthProvider.tsx` — account flow, dashboard, and Supabase session state.
- `src/pages/LegalPage.tsx` and `src/lib/legal.ts` — public Terms and Privacy pages and the consent version used at signup.
- `supabase/migrations/20261105130000_legal_consent.sql` — signup consent metadata validation and accepted-version audit records.
- `src/pages/AdminPortalPage.tsx` and `src/features/admin/` — gated admin workspace for homepage content/media and manual payment review.
- `src/features/funding/ManualFundingPanel.tsx` and `src/lib/manualFunding.ts` — private member payment receipt submissions and funding request history.
- `src/lib/homepageContent.ts` and `supabase/migrations/20261105160000_admin_site_and_manual_funding.sql` — admin-controlled site content, secure media buckets, manual funding requests, and transactional review/credit grants.
- `src/pages/SupportPage.tsx`, `src/pages/AdminSupportPage.tsx`, and `src/lib/supportInbox.ts` — account-based support conversations, admin replies, and editable public contact details.
- `src/lib/studioLibrary.ts` and `supabase/migrations/20261104000000_studio_user_data.sql` — user-scoped Studio persistence with RLS.
- `src/lib/liveUsage.ts` and `supabase/migrations/20261105090000_live_usage_and_time_credits.sql` — live session tracking, account usage summary, and read-only time credit grants.
- `supabase/migrations/20261104120000_support_inbox.sql` and `docs/support-inbox-setup.md` — private support threads, realtime updates, contact settings, and first-admin setup.
- `server/index.mjs` — static production server, Supabase access-token verification, and short lived Decart token route.
- `Dockerfile`, `.dockerignore`, and `docs/deployment.md` — production container and provider-neutral deployment checklist.
- `src/styles/tokens.css` and `src/styles/app.css` — brand tokens, components, and responsive styles.
- `docs/brand-guidelines.md` — shortlist, positioning, voice, and visual direction.

## Commands

```bash
npm run dev       # Vite + token server for local development
npm test          # Studio, admin, and server tests
npm run build     # TypeScript check and production build
npm start         # Serve the production build and token route
npm run preview   # Same production server after building
```

## Phase boundaries

- Manual payment review is available after an admin configures payment instructions. Bachs checkout and payment webhooks are not active. No prices or time conversion rates are assumed; an admin sets the live minutes for each verified payment.
- Supabase must be configured and the SQL migration applied before account-backed saved directions work.
- The server verifies user identity before minting Decart session tokens; database access is performed with the browser publishable key and protected by RLS.
- The official provider integration uses ephemeral client tokens; permanent provider credentials never enter the browser bundle.
- The Bachs integration will use its official Node SDK on the server, hosted checkout, and signed webhooks. Credit grants must be issued only after verified successful payments; no Bachs key or endpoint is placed in browser code.
- Live processing is opt in. Camera/reference data stays local until a Decart session is started.
- No hosting provider or production domain is configured by this work.

## Official Decart references

- [JavaScript SDK overview](https://docs.platform.decart.ai/sdks/javascript)
- [Realtime API](https://docs.platform.decart.ai/sdks/javascript-realtime)
- [Client tokens](https://docs.platform.decart.ai/getting-started/client-tokens)
- [Realtime model overview](https://docs.platform.decart.ai/models/realtime/overview)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase password recovery flow](https://supabase.com/docs/guides/auth/passwords)
- [Supabase resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Bachs hosted checkout guide](https://docs.bachs.io/guides/checkout/checkout-sessions)
- [Bachs Node.js SDK](https://docs.bachs.io/sdks/node)
- [Bachs webhook signature and delivery guide](https://docs.bachs.io/guides/webhooks/overview)

See [docs/bachs-integration.md](docs/bachs-integration.md) for the secure checkout and credit-grant boundary, and the configuration still required before funding can be enabled.
