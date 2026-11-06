import dotenv from 'dotenv'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDecartClient } from '@decartai/sdk'
import { createClient } from '@supabase/supabase-js'
import { checkLiveAccountAccess } from './accountAccess.mjs'
import { createLiveTimeService, createSignalingStore } from './liveTime.mjs'
import { attachRealtimeProxy } from './realtimeProxy.mjs'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(rootDir, '../.env.local') })
dotenv.config()

const app = express()
const isDevelopment = process.argv.includes('--dev')
const port = Number(process.env.API_PORT || process.env.PORT || 8787)
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0)
const distDir = path.resolve(rootDir, '../dist')
const realtimeModel = 'lucy-2.6'
const tokenRequestLimit = 8
const tokenWindowMs = 60_000
const tokenRequestWindows = new Map()
const tokenActivity = { requests: 0, issued: 0, failures: 0 }

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.')
}
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.')
}

const decartApiKey = process.env.DECART_API_KEY
const decartClient = decartApiKey ? createDecartClient({ apiKey: decartApiKey }) : null
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
function isValidSupabaseUrl(value) {
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      && parsed.pathname === '/'
  } catch {
    return false
  }
}

const supabaseAuthClient = supabaseUrl && supabasePublishableKey && isValidSupabaseUrl(supabaseUrl)
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null

// This key never enters the Vite bundle and never receives a user's JWT header.
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const accountingClient = supabaseSecretKey && supabaseUrl && isValidSupabaseUrl(supabaseUrl)
  ? createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  : null
const liveTimeService = createLiveTimeService({ client: accountingClient })

app.disable('x-powered-by')
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops)
app.use((request, response, next) => {
  const startedAt = performance.now()
  const tokenRequest = request.method === 'POST' && request.path === '/api/connection-ticket'
  if (tokenRequest) tokenActivity.requests += 1
  const requestId = randomUUID()
  request.requestId = requestId
  response.setHeader('X-Request-Id', requestId)
  response.once('finish', () => {
    if (tokenRequest) {
      if (response.statusCode === 200) tokenActivity.issued += 1
      else if (response.statusCode >= 400) tokenActivity.failures += 1
    }
    if (request.path !== '/api' && !request.path.startsWith('/api/')) return
    if (request.path === '/healthz' || request.path === '/readyz') return
    console.log(JSON.stringify({
      level: response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
      event: 'http_request',
      requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    }))
  })
  next()
})
app.use('/api', express.json({ limit: '4kb' }))
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
  if (request.path === '/api' || request.path.startsWith('/api/') || request.path === '/healthz' || request.path === '/readyz') {
    response.setHeader('Cache-Control', 'no-store')
  }
  if (process.env.NODE_ENV === 'production') {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000')
  }
  next()
})

function canonicalOrigin(value) {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (parsed.origin !== value || parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

function originIsAllowed(requestOrigin) {
  const origin = canonicalOrigin(requestOrigin || '')
  if (!origin) return false

  const configuredOrigins = (process.env.APP_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (configuredOrigins.length > 0) return configuredOrigins.includes(origin)

  if (process.env.NODE_ENV === 'production') return false
  const hostname = new URL(origin).hostname
  return new URL(origin).protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname)
}

function productionConfigIsReady() {
  if (isDevelopment) return true
  if (!existsSync(path.join(distDir, 'index.html')) || !decartClient || !supabaseAuthClient || !accountingClient) return false
  if (!supabaseUrl || new URL(supabaseUrl).protocol !== 'https:') return false

  const configuredOrigins = (process.env.APP_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return configuredOrigins.length > 0 && configuredOrigins.every((origin) => {
    const canonical = canonicalOrigin(origin)
    return canonical === origin && new URL(canonical).protocol === 'https:'
  })
}

async function authenticateRequest(request) {
  const authorization = request.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) return { status: 401, message: 'Sign in to start a live session.' }
  if (!supabaseAuthClient) return { status: 503, message: 'Account access is not configured on this server.' }

  try {
    const { data, error } = await supabaseAuthClient.auth.getUser(match[1])
    if (error) {
      const status = error.status === 400 || error.status === 401 || error.status === 403 ? 401 : 503
      console.warn(JSON.stringify({
        level: status === 401 ? 'warn' : 'error',
        event: 'supabase_user_verification_failed',
        requestId: request.requestId,
        status,
      }))
      return {
        status,
        message: status === 401 ? 'Your session has expired. Sign in again to continue.' : 'Account verification is temporarily unavailable.',
      }
    }
    if (!data.user) return { status: 401, message: 'Sign in to start a live session.' }
    return { status: 200, userId: data.user.id, accessToken: match[1] }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'supabase_user_verification_unavailable',
      requestId: request.requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return { status: 503, message: 'Account verification is temporarily unavailable.' }
  }
}

function takeTokenRequestSlot(request, response) {
  const key = request.ip || request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = tokenRequestWindows.get(key)
  const current = !bucket || now - bucket.startedAt >= tokenWindowMs
    ? { startedAt: now, count: 0 }
    : bucket

  if (current.count >= tokenRequestLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((tokenWindowMs - (now - current.startedAt)) / 1000))
    response.setHeader('Retry-After', String(retryAfterSeconds))
    response.status(429).json({ error: 'Too many session requests. Wait a moment and try again.' })
    return false
  }

  current.count += 1
  tokenRequestWindows.set(key, current)
  if (tokenRequestWindows.size > 2_000) {
    for (const [candidate, window] of tokenRequestWindows) {
      if (now - window.startedAt >= tokenWindowMs) tokenRequestWindows.delete(candidate)
    }
    while (tokenRequestWindows.size > 2_000) {
      const oldestKey = tokenRequestWindows.keys().next().value
      if (!oldestKey) break
      tokenRequestWindows.delete(oldestKey)
    }
  }
  return true
}

app.post('/api/realtime-token', (_request,response) => response.status(410).json({error:'Reload the Studio to use server-controlled connections.'}))
app.post('/api/connection-ticket', async (request, response) => {
  if (!originIsAllowed(request.get('origin'))) {
    response.status(403).json({ error: 'This site origin is not allowed to start a Decart session.' })
    return
  }
  if (!supabaseAuthClient) {
    response.status(503).json({ error: 'Account access is not configured on this server.' })
    return
  }
  if (!takeTokenRequestSlot(request, response)) return

  const account = await authenticateRequest(request)
  if (account.status !== 200) {
    response.status(account.status).json({ error: account.message })
    return
  }
  const accountClient = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${account.accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const access = await checkLiveAccountAccess(accountClient)
  if (access.status !== 200) {
    response.status(access.status).json({ error: access.message })
    return
  }
  if (!decartClient) {
    response.status(503).json({ error: 'Live sessions are not configured on this server.' })
    return
  }

  const result = await liveTimeService.ticket(account.userId, request.body?.sessionId)
  response.status(result.status).json(result.body)
})

async function liveSessionRoute(request, response, action) {
  if (!originIsAllowed(request.get('origin'))) { response.status(403).json({ error: 'This site origin is not allowed.' }); return }
  const account = await authenticateRequest(request)
  if (account.status !== 200) { response.status(account.status).json({ error: account.message }); return }
  if (action === 'reserve' && !decartClient) { response.status(503).json({ error: 'Live sessions are not configured on this server.' }); return }
  const result = await liveTimeService.update(account.userId, request.params.id || request.body?.requestId, action)
  if (action==='stop' && result.status===200) signalingProxy.closeLease(account.userId,request.params.id)
  response.status(result.status).json(result.body)
}
app.post('/api/live-sessions', (request, response) => liveSessionRoute(request, response, 'reserve'))
app.post('/api/live-sessions/:id/heartbeat', (request, response) => liveSessionRoute(request, response, 'heartbeat'))
app.post('/api/live-sessions/:id/stop', (request, response) => liveSessionRoute(request, response, 'stop'))

app.get('/api/admin/status', async (request, response) => {
  const account = await authenticateRequest(request)
  if (account.status !== 200) { response.status(account.status).json({ error: account.message }); return }
  try {
    const client = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${account.accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { data, error } = await client.rpc('is_support_admin')
    if (error) { response.status(503).json({error:'Admin verification is unavailable.'}); return }
    if (data !== true) { response.status(403).json({error:'Admin access required.'}); return }
    response.json({ uptime_seconds: Math.floor(process.uptime()), decart_configured: Boolean(decartClient), live_time_configured: Boolean(accountingClient), server_signaling: true, proxy_connections: signalingProxy.activeConnections, account_verification: 'Connected', token_requests: tokenActivity.requests, tokens_issued: tokenActivity.issued, failed_requests: tokenActivity.failures, automatic_payments_ready: false })
  } catch { response.status(503).json({error:'Admin status is temporarily unavailable.'}) }
})

app.use('/api', (request, response) => {
  response.status(404).json({ error: 'API route not found.' })
})

app.get('/healthz', (request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.get('/readyz', (request, response) => {
  const ready = productionConfigIsReady()
  response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' })
})

if (!isDevelopment) {
  app.use(express.static(distDir, {
    setHeaders(response, filePath) {
      const relativePath = path.relative(distDir, filePath).split(path.sep).join('/')
      response.setHeader('Cache-Control', relativePath.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache')
    },
  }))
  app.use((request, response, next) => {
    if (request.method !== 'GET') return next()
    response.setHeader('Cache-Control', 'no-cache')
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

const server = app.listen(port, '0.0.0.0', () => {
  const mode = isDevelopment ? 'API' : 'application and API'
  console.log(`Kinetelle ${mode} server listening on http://localhost:${port}`)
})
const signalingProxy = attachRealtimeProxy(server, {
  store:createSignalingStore(accountingClient), decartClient, model:realtimeModel,
  originIsAllowed, ready:Boolean(accountingClient),
})

function shutdown(signal) {
  console.log(`Kinetelle server received ${signal}; closing gracefully.`)
  void signalingProxy.shutdown()
  server.close((error) => {
    if (error) {
      console.error('Kinetelle server shutdown failed.', error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
