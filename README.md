# Kinetelle Studio

**Kinetelle Studio** is the provisional working identity for a premium browser based live visual studio. The name and design direction are original project concepts; complete domain and trademark clearance before public launch.

## Phase 3

The Studio uses Supabase Auth for email and password accounts, stores each user's prompt preferences and saved directions in Supabase, and protects live Decart session-token creation behind server-verified authentication. **Photorealistic Human** remains the only starting direction.

- A local camera preview works without a Decart key. **Preview this direction locally** applies a CSS study and keeps media in the browser.
- **Start live transformation** is the explicit point at which an authenticated user's camera, microphone and selected reference image are sent to Decart.
- The canvas toolbar identifies a local demo output and changes to **AI Output Live** only after the SDK delivers a transformed remote stream; the output frame itself stays clear.
- The permanent Decart key stays in the Node server. The browser requests a short lived client token immediately before connecting and on reconnects.
- Saved directions contain only the prompt and preset identifier. Studio preferences contain the prompt, preset identifier, and aspect ratio. Camera frames and reference image files are not stored in Supabase.
- Billing and KoraPay are deferred. There are no credit packs, payment flows, or assumed prices.

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

In the Supabase dashboard, enable Email sign-in and add `http://localhost:5173/account` to the allowed redirect URLs. Apply `supabase/migrations/20261104000000_studio_user_data.sql` using the Supabase SQL Editor or your normal migration workflow. This migration creates the user preferences and saved directions tables, enables RLS, removes broad table grants, and scopes each operation to `auth.uid()`.

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

The Node server serves the production build and the same-origin token route. Provide `DECART_API_KEY`, `APP_ORIGINS`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` to both the frontend build and server runtime. For a public deployment, `APP_ORIGINS` must contain the exact HTTPS origin(s) that host the app, such as `https://studio.example.com`, and add `https://studio.example.com/account` to Supabase's allowed redirect URLs. `API_PORT` can select the server port. Set `TRUST_PROXY_HOPS` only when the app is behind a known number of trusted reverse proxies. `npm run preview` serves the built app through the same Node server.

The token route verifies the Supabase access token with Supabase Auth before creating a Decart client token. It applies a per-process, per-IP limit of eight requests per minute, checks the browser origin, restricts tokens to `lucy-2.6`, and scopes each token to the request origin. The rate limit is process-local, so a multi-instance deployment should use a shared limiter before increasing traffic. `/healthz` reports liveness; `/readyz` checks the production build, Decart/Supabase configuration, and exact HTTPS app origins.

## Studio interactions

- Start and stop a real webcam preview, handle browser permission errors, and select among available cameras.
- Start from the Photorealistic Human direction, edit the prompt, and optionally select a JPG, PNG, or WebP reference image.
- Create an account with email and password, sign in, sign out, and resume a session from Supabase Auth.
- Save, load, and delete prompt directions; persist the prompt and selected aspect ratio for the signed-in account.
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
- `src/pages/AccountPage.tsx` and `src/auth/AuthProvider.tsx` — account flow and Supabase session state.
- `src/lib/studioLibrary.ts` and `supabase/migrations/20261104000000_studio_user_data.sql` — user-scoped persistence with RLS.
- `server/index.mjs` — static production server, Supabase access-token verification, and short lived Decart token route.
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

- No payments, KoraPay integration, credit packs, or persistent media storage.
- Supabase must be configured and the SQL migration applied before account-backed saved directions work.
- The server verifies user identity before minting Decart session tokens; database access is performed with the browser publishable key and protected by RLS.
- The official provider integration uses ephemeral client tokens; permanent provider credentials never enter the browser bundle.
- Live processing is opt in. Camera/reference data stays local until a Decart session is started.
- No GitHub push is part of this work.

## Official Decart references

- [JavaScript SDK overview](https://docs.platform.decart.ai/sdks/javascript)
- [Realtime API](https://docs.platform.decart.ai/sdks/javascript-realtime)
- [Client tokens](https://docs.platform.decart.ai/getting-started/client-tokens)
- [Realtime model overview](https://docs.platform.decart.ai/models/realtime/overview)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
