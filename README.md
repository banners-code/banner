# Kinetelle Studio

**Kinetelle Studio** is the provisional working identity for a premium browser based live visual studio. The name and design direction are original project concepts; complete domain and trademark clearance before public launch.

## Phase 6

Phase 6 adds the post-login member dashboard and live-session usage history to the production-ready account-backed Kinetelle Studio. The app includes a real-time Supabase support inbox, admin-editable public contact details, and export/removal of saved Studio data. **Photorealistic Human** remains the only starting direction.

- A local camera preview works without a Decart key. **Preview this direction locally** applies a CSS study and keeps media in the browser.
- **Start live transformation** is the explicit point at which an authenticated user's camera, microphone and selected reference image are sent to Decart.
- The canvas toolbar identifies a local demo output and changes to **AI Output Live** only after the SDK delivers a transformed remote stream; the output frame itself stays clear.
- The permanent Decart key stays in the Node server. The browser requests a short lived client token immediately before connecting and on reconnects.
- Saved directions contain only the prompt and preset identifier. Studio preferences contain the prompt, preset identifier, and aspect ratio. Camera frames and reference image files are not stored in Supabase.
- The member dashboard tracks live time and session history. Bachs checkout is not connected, and there are no assumed credit packs, prices, or time conversion rates.

## Member dashboard

Signed-in members land on `/dashboard` after email/password sign-in or email confirmation. The dashboard shows live time granted to the account, time used in Decart sessions, session count, and recent session history. Studio usage is recorded through authenticated Supabase functions with server-side timestamps and periodic heartbeats. The live time credit table is read-only to members; trusted server integrations can grant time after a verified payment. No initial time grants or package values are assumed, so an account with no grants displays zero available time.

The **Fund account** control opens the funding details panel. Bachs documentation has been reviewed, but checkout is not connected yet. Its documented flow needs a server-held Bachs API key, configured products and time-per-pack values, a Bachs webhook with signature verification, and a server-only way to append verified credit grants. The browser must never receive the Bachs secret key. The current panel does not start a payment.

## Run locally

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

In the Supabase dashboard, enable Email sign-in and add `http://localhost:5173/dashboard` and `http://localhost:5173/account` to the allowed redirect URLs. Apply `supabase/migrations/20261104000000_studio_user_data.sql` and `supabase/migrations/20261105090000_live_usage_and_time_credits.sql` using the Supabase SQL Editor or your normal migration workflow. The first migration creates user preferences and saved directions. The second adds private live-session history, server-timestamped tracking functions, and read-only time-credit balances.

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

The homepage includes feature, workflow, FAQ, and contact sections. Contact details are read from Supabase and update in the browser when a support admin saves changes. Customers can start private support conversations and receive replies in their account; an admin can reply from `/admin/support`. Apply the support migration and grant the initial admin as described in [docs/support-inbox-setup.md](docs/support-inbox-setup.md). Live admin alerts are in-app Realtime notifications while the admin inbox is open; email and push delivery are not configured.

## Container deployment

Build and run a production image with Docker using the host-neutral setup in [docs/deployment.md](docs/deployment.md). The multi-stage image uses the current Node.js 26 LTS Alpine base, installs only production dependencies in its runtime stage, runs as the non-root `node` user, and includes `/readyz` as its container health check. The Vite Supabase URL and publishable key are build arguments; Decart and server-side Supabase values are supplied at runtime. No hosting provider or live deployment is selected here.

## Studio interactions

- Start and stop a real webcam preview, handle browser permission errors, and select among available cameras.
- Start from the Photorealistic Human direction, edit the prompt, and optionally select a JPG, PNG, or WebP reference image.
- Create an account with email and password, sign in, sign out, and resume a session from Supabase Auth. Successful sign-in and confirmation return to the member dashboard.
- View available live time, total live time used, session count, and recent live-session activity on the member dashboard.
- Record Decart session time with authenticated Supabase start, heartbeat, stop, and summary functions; local camera previews are not counted.
- Open the Fund account details panel. Bachs checkout remains unconnected until the merchant key, product-to-time mapping, verified webhook, and trusted credit-grant writer are configured.
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
npm test          # Studio interaction tests
npm run build     # TypeScript check and production build
npm start         # Serve the production build and token route
npm run preview   # Same production server after building
```

## Phase boundaries

- Bachs checkout and payment webhooks are not active. There are no assumed credit pack amounts, time conversion rates, prices, or payment credentials.
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
