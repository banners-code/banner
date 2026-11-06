# Production deployment

The app can run in any container host that supports a Node.js HTTP service. This repository does not select a hosting provider or deploy the image.

## Build the image

The Supabase URL and publishable key are public browser configuration. They are embedded in the Vite bundle during the image build:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key \
  -t kinetelle-studio .
```

The Docker build fails if either frontend value is missing. `.dockerignore` keeps local `.env*` files out of the build context. Do not pass `DECART_API_KEY` as a build argument; it belongs in the container host's runtime secret store.

## Runtime environment

Provide these values to the container at runtime:

```dotenv
DECART_API_KEY=your-decart-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SECRET_KEY=your-supabase-secret-key
APP_ORIGINS=https://studio.example.com
TRUST_PROXY_HOPS=0
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` let the Node server verify signed-in users before issuing Decart tokens. The public key is also embedded in the browser bundle at build time. Phase 10 requires `SUPABASE_SECRET_KEY` for protected live-time accounting; legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Supply that secret only at runtime, never in the frontend, image build arguments, or source control. Apply all migrations before deploying the matching server/frontend.

The server listens on `API_PORT`, then `PORT`, and defaults to `8787`. The container exposes `8787`; set the container host's service port to match the runtime port it provides.

## Domain, Supabase, and proxy

- Terminate HTTPS at the container host or a trusted reverse proxy. Configure `APP_ORIGINS` with the exact HTTPS site origin, without a path or trailing slash.
- Add `https://your-domain.example/account` to Supabase's allowed redirect URLs. Enable Email sign-in and apply the database migration documented in the main README.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted proxies in front of the Node server. Leave it at `0` if requests reach the app directly; replace the example value only after confirming the hosting path.
- Store `DECART_API_KEY` and the Supabase runtime values in the host's secret/environment configuration. Do not copy `.env.local` into the image.

## Health and operations

Phase 11 requires WebSocket support for `/api/realtime/v1/stream`, in addition to the normal HTTP API routes. Keep the `Origin` header intact and omit query strings from access logs: the SDK places a 15-second, single-use app ticket in the signaling URL. Use an upgrade timeout/read timeout of at least 60 seconds. The server pings clients every 10 seconds. Allow at least 30 seconds for graceful container shutdown.

For Nginx, add a log format in the `http` context, then use this location inside the existing HTTPS `server` block (the Node port must match your runtime configuration):

```nginx
# http context; $uri excludes the sensitive query string.
log_format kinetelle_ws '$remote_addr [$time_local] "$request_method $uri" $status';

# Inside the HTTPS server block:
location /api/realtime/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;
    access_log /var/log/nginx/kinetelle-ws.log kinetelle_ws;
}
```

This is a fragment for your existing TLS configuration, not a complete VPS setup. See [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html) and [access-log formats](https://nginx.org/en/docs/http/ngx_http_log_module.html). Avoid request/body capture in other proxy/APM layers for these URLs and signaling payloads.

- Use `/healthz` for a liveness probe. It confirms the Node process responds.
- Use `/readyz` for a readiness probe. In production it requires the built frontend, Decart/accounting configuration, HTTPS Supabase configuration, and valid HTTPS `APP_ORIGINS`.
- The server writes JSON request logs for API traffic with a request ID, method, path, status, and duration. Query strings, request headers, access tokens, and provider error text are not logged.
- The Decart token limit is in memory and applies per process and IP. Before running multiple replicas or increasing traffic, configure a shared rate limiter at the host or edge.
- Monitor container restarts, readiness failures, API `4xx`/`5xx` rates, and Decart session failures.

After building, run locally with runtime values supplied by a private env file:

```sh
docker run --rm -p 8787:8787 --env-file .env.production.local kinetelle-studio
```

Keep `.env.production.local` outside version control. A production deployment, domain setup, and provider-specific monitoring are not included in this phase.
