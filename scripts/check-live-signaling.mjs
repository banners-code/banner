// Opt-in integration check. Creates and removes only its own synthetic account.
// Uses real Decart signaling, but sends no camera, microphone, or reference image.
import dotenv from 'dotenv'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { setTimeout as delay } from 'node:timers/promises'

if (!process.argv.includes('--run-live'))
  throw new Error(
    'Pass --run-live to use real provider signaling with a disposable fixture.',
  )
dotenv.config({ path: '.env.local', quiet: true })
const origin = 'http://localhost:5173',
  api = 'http://127.0.0.1:8787'
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
)
const member = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  options,
)
const fixtureEmail = `signaling-fixture-${randomUUID()}@example.invalid`
const password = randomBytes(32).toString('base64url')
let userId, accessToken, leaseId, currentSocket
const report = {
  replayRejected: false,
  reconnected: false,
  providerJoined: false,
  serverCutoff: false,
  providerCloseConfirmed: false,
  fixtureRemoved: false,
}
function assert(value, message) {
  if (!value) throw new Error(message)
}
async function post(path, body) {
  const response = await fetch(api + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json()
  assert(response.ok, `Application request failed (${response.status})`)
  return data
}
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const result = await fn()
    if (result) return result
    await delay(150)
  }
  throw new Error('Expected signaling state not reached')
}
async function open(ticket) {
  const socket = new WebSocket(
    `${api.replace('http:', 'ws:')}/api/realtime/v1/stream?api_key=${ticket}&model=lucy-2.6`,
    { headers: { Origin: origin } },
  )
  currentSocket = socket
  socket.on('error', () => {})
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Signaling open timed out')),
      15000,
    )
    socket.once('open', () => {
      clearTimeout(timeout)
      resolve()
    })
    socket.once('error', () => {
      clearTimeout(timeout)
      reject(new Error('Signaling open failed'))
    })
  })
  const room = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Provider room join timed out')),
      20000,
    )
    socket.on('message', (raw) => {
      let event
      try {
        event = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (event.type === 'livekit_room_info') {
        clearTimeout(timeout)
        report.providerJoined = true
        resolve()
      } else if (event.type === 'error') {
        report.providerError = String(event.error || '').slice(0, 300)
        clearTimeout(timeout)
        reject(new Error('Provider rejected the signaling join'))
      }
    })
    socket.once('close', () => {
      clearTimeout(timeout)
      reject(new Error('Signaling ended before room join'))
    })
  })
  socket.send(JSON.stringify({ type: 'livekit_join', passthrough: false }))
  socket.send(
    JSON.stringify({
      type: 'prompt',
      prompt: 'Photorealistic human',
      enhance_prompt: true,
    }),
  )
  await room
  return socket
}
try {
  const created = await admin.auth.admin.createUser({
    email: fixtureEmail,
    password,
    email_confirm: true,
    user_metadata: {
      kinetelle_terms_version: '2026-11-05-v3',
      kinetelle_privacy_version: '2026-11-05-v3',
      kinetelle_age_over_18: true,
    },
  })
  assert(
    !created.error && created.data.user,
    'Synthetic account creation failed',
  )
  userId = created.data.user.id
  const grant = await admin
    .from('live_time_credit_grants')
    .insert({
      user_id: userId,
      credit_seconds: 90,
      source: 'admin',
      source_reference: `signaling-fixture-${userId}`,
    })
  assert(!grant.error, 'Synthetic time grant failed')
  const signed = await member.auth.signInWithPassword({
    email: fixtureEmail,
    password,
  })
  assert(!signed.error && signed.data.session, 'Synthetic sign-in failed')
  accessToken = signed.data.session.access_token
  leaseId = randomUUID()
  await post('/api/live-sessions', { requestId: leaseId })
  const ticket = await post('/api/connection-ticket', { sessionId: leaseId })
  assert(
    ticket.connectionTicket && !ticket.apiKey,
    'Provider credential exposed in ticket response',
  )
  let socket = await open(ticket.connectionTicket)
  const replay = new WebSocket(
    `${api.replace('http:', 'ws:')}/api/realtime/v1/stream?api_key=${ticket.connectionTicket}&model=lucy-2.6`,
    { headers: { Origin: origin } },
  )
  replay.on('error', () => {})
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Replay response timed out')),
      5000,
    )
    replay.once('unexpected-response', (_req, res) => {
      report.replayRejected = res.statusCode === 401
      res.resume()
      replay.terminate()
      clearTimeout(timer)
      resolve()
    })
    replay.once('open', () => {
      clearTimeout(timer)
      replay.close()
      reject(new Error('Ticket replay succeeded'))
    })
  })
  socket.close(1000, 'Reconnect verification')
  await waitFor(async () => {
    const state = await admin
      .from('live_session_leases')
      .select('connection_id')
      .eq('id', leaseId)
      .single()
    return !state.error && state.data.connection_id === null
  })
  const fresh = await post('/api/connection-ticket', { sessionId: leaseId })
  socket = await open(fresh.connectionTicket)
  report.reconnected = true
  // Shorten only this fixture's balance to verify early server cutoff, rather
  // than waiting for the provider token's original duration cap.
  const usage = await member.rpc('get_live_usage_summary')
  assert(!usage.error, 'Synthetic usage summary failed')
  const adjusted = await admin
    .from('live_time_credit_grants')
    .update({ credit_seconds: Number(usage.data.spent_seconds) + 12 })
    .eq('user_id', userId)
    .eq('source_reference', `signaling-fixture-${userId}`)
  assert(!adjusted.error, 'Synthetic time reduction failed')
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Server cutoff timed out')),
      20000,
    )
    socket.once('close', (code) => {
      clearTimeout(timer)
      report.serverCutoff = code === 1008
      resolve()
    })
  })
  const state = await waitFor(async () => {
    const value = await admin
      .from('live_proxy_connections')
      .select('close_confirmed,closed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    return !value.error && value.data.closed_at ? value.data : null
  })
  report.providerCloseConfirmed = state.close_confirmed
  assert(
    report.replayRejected &&
      report.reconnected &&
      report.serverCutoff &&
      report.providerCloseConfirmed,
    'Live signaling verification did not fully pass',
  )
} catch (error) {
  report.failure =
    error instanceof Error ? error.message : 'Signaling check failed'
  process.exitCode = 1
} finally {
  if (currentSocket?.readyState === WebSocket.OPEN)
    currentSocket.close(1000, 'Fixture cleanup')
  if (accessToken && leaseId)
    await post(`/api/live-sessions/${leaseId}/stop`).catch(() => {})
  if (userId) {
    await delay(2000)
    const removed = await admin.auth.admin.deleteUser(userId)
    report.fixtureRemoved = !removed.error
    if (removed.error) process.exitCode = 1
  }
  console.log(JSON.stringify(report))
}
