import { randomUUID } from 'node:crypto'
import WebSocket, { WebSocketServer } from 'ws'

const MAX_PAYLOAD = 14 * 1024 * 1024
const MAX_BUFFER = 16 * 1024 * 1024
const ticketPattern = /^kt_[A-Za-z0-9_-]{43}$/
const allowedQuery = new Set([
  'api_key',
  'model',
  'livekit_server_codec',
  'user_agent',
])
const safeCloseCode = (code) =>
  [1000, 1001, 1008, 1011, 1012, 1013].includes(code) ? code : 1011
const terminal = new Set([
  'insufficient_time',
  'session_stopped',
  'session_expired',
  'account_restricted',
])
const validAllowance = (data) =>
  data?.active === true &&
  Number.isFinite(data.remaining_seconds) &&
  data.remaining_seconds > 0 &&
  data.remaining_seconds <= 3600

export function validateClientMessage(raw, isBinary) {
  if (isBinary) throw new Error('Text signaling required')
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'livekit_join')
    return {
      type: 'livekit_join',
      passthrough: false,
      ...(msg.client_capabilities?.frame_timing === true
        ? { client_capabilities: { frame_timing: true } }
        : {}),
    }
  const prompt = msg.prompt
  if (msg.type === 'prompt') {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 280)
      throw new Error('Invalid prompt')
    return {
      type: 'prompt',
      prompt,
      enhance_prompt: msg.enhance_prompt !== false,
    }
  }
  if (msg.type === 'set_image') {
    if (
      prompt !== undefined &&
      (typeof prompt !== 'string' || prompt.length > 280)
    )
      throw new Error('Invalid prompt')
    if (
      msg.image_data !== null &&
      (typeof msg.image_data !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.image_data) ||
        Buffer.byteLength(msg.image_data, 'base64') > 10 * 1024 * 1024)
    )
      throw new Error('Invalid image')
    return {
      type: 'set_image',
      image_data: msg.image_data,
      ...(prompt !== undefined ? { prompt } : {}),
      enhance_prompt: msg.enhance_prompt !== false,
    }
  }
  throw new Error('Unsupported signaling message')
}

/** The only module that opens provider signaling. No credential or arbitrary target comes from the browser. */
export function attachRealtimeProxy(
  server,
  {
    store,
    decartClient,
    originIsAllowed,
    ready = true,
    model = 'lucy-2.6',
    createUpstream = (url) =>
      new WebSocket(url, {
        handshakeTimeout: 8000,
        maxPayload: MAX_PAYLOAD,
        perMessageDeflate: false,
      }),
    checkEveryMs = 3000,
    verificationTimeoutMs = 7000,
    maxConnections = 32,
  },
) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
  })
  const active = new Map()
  let pending = 0,
    shuttingDown = false
  function reject(socket, status) {
    if (!socket.destroyed)
      socket.end(
        `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      )
  }
  const bounded = (promise, ms = verificationTimeoutMs) => {
    let timer
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Verification timeout')), ms)
      }),
    ]).finally(() => clearTimeout(timer))
  }
  async function upgrade(request, socket, head) {
    socket.on('error', () => {})
    let url
    try {
      url = new URL(request.url, 'http://localhost')
    } catch {
      reject(socket, 400)
      return
    }
    if (url.pathname !== '/api/realtime/v1/stream') {
      reject(socket, 404)
      return
    }
    if (
      shuttingDown ||
      !ready ||
      !decartClient ||
      active.size + pending >= maxConnections
    ) {
      reject(socket, 503)
      return
    }
    if (!originIsAllowed(request.headers.origin)) {
      reject(socket, 403)
      return
    }
    if (
      request.url.length > 2000 ||
      [...url.searchParams.keys()].some(
        (key) =>
          !allowedQuery.has(key) || url.searchParams.getAll(key).length !== 1,
      ) ||
      url.searchParams.get('model') !== model ||
      !ticketPattern.test(url.searchParams.get('api_key') || '') ||
      (url.searchParams.has('livekit_server_codec') &&
        !['vp8', 'vp9', 'h264'].includes(
          url.searchParams.get('livekit_server_codec'),
        ))
    ) {
      reject(socket, 400)
      return
    }
    pending++
    const id = randomUUID()
    let claimed = false,
      timedOut = false
    try {
      const claimStarted = performance.now()
      const claimPromise = store.claim(url.searchParams.get('api_key'), id)
      // If the DB claim finishes after a timeout, release its fence without ever opening upstream.
      void claimPromise
        .then((result) => {
          if (timedOut && result?.active)
            void store.close(id, true, 'claim_cancelled').catch(() => {})
        })
        .catch(() => {})
      const claim = await bounded(claimPromise)
      claimed = claim?.active === true
      if (
        !validAllowance(claim) ||
        !Number.isInteger(claim.provider_cap_seconds) ||
        claim.provider_cap_seconds < 10 ||
        claim.provider_cap_seconds > 300
      ) {
        if (claimed)
          await bounded(store.close(id, true, 'invalid_accounting_response'))
        reject(socket, claim?.code === 'session_in_use' ? 409 : 401)
        return
      }
      claim.remaining_seconds = Math.max(
        0,
        claim.remaining_seconds - (performance.now() - claimStarted) / 1000,
      )
      if (socket.destroyed || shuttingDown) {
        await store.close(id, true, 'client_left')
        return
      }
      wss.handleUpgrade(request, socket, head, (downstream) => {
        const connection = bridge(
          id,
          claim,
          downstream,
          url.searchParams.get('livekit_server_codec'),
        )
        active.set(id, connection)
      })
    } catch {
      timedOut = true
      if (claimed) void store.close(id, true, 'setup_failed').catch(() => {})
      reject(socket, 503)
    } finally {
      pending--
    }
  }
  function bridge(id, claim, downstream, codec) {
    let upstream,
      closed = false,
      closing = false,
      opened = false,
      checkPending = false,
      closeReason = 'disconnected',
      forceTerminal = false
    let providerCloseCode = 1000,
      providerCloseReason = 'Session closed'
    let joined = false
    let queued = [],
      queuedBytes = 0,
      eventChain = Promise.resolve(),
      eventFailed = false
    let allowanceDeadline =
      performance.now() + Math.max(0, claim.remaining_seconds - 1) * 1000
    let verifiedUntil = performance.now() + verificationTimeoutMs + checkEveryMs
    let ticker, checker, pinger, killTimer
    let pong = true,
      windowStart = Date.now(),
      messages = 0
    let providerKey = ''
    function queueEvent(event, seconds = null, sessionId = null) {
      eventChain = eventChain
        .then(() => bounded(store.record(id, event, seconds, sessionId)))
        .catch(() => {
          eventFailed = true
          stop('verification_failed', true)
        })
    }
    const cleanText = (text) =>
      typeof text === 'string'
        ? text
            .replaceAll(providerKey || '__no_key__', '[redacted]')
            .slice(0, 1000)
        : text
    function send(client, raw) {
      if (client.readyState !== WebSocket.OPEN) return
      if (client.bufferedAmount > MAX_BUFFER) {
        stop('backpressure', true)
        return
      }
      client.send(raw, { binary: false }, (error) => {
        if (error) stop('transport_error', true)
      })
    }
    function notifyEnd(reason) {
      send(
        downstream,
        JSON.stringify({ type: 'generation_ended', seconds: 0, reason }),
      )
    }
    async function finish(confirmed) {
      if (closed) return
      closed = true
      closing = true
      clearInterval(ticker)
      clearInterval(checker)
      clearInterval(pinger)
      clearTimeout(killTimer)
      queued = []
      await eventChain.catch(() => {})
      try {
        await bounded(store.close(id, confirmed, closeReason))
      } catch {}
      active.delete(id)
      if (downstream.readyState === WebSocket.OPEN)
        downstream.close(
          forceTerminal ||
            terminal.has(closeReason) ||
            closeReason === 'verification_failed'
            ? 1008
            : safeCloseCode(providerCloseCode),
          providerCloseReason,
        )
      setTimeout(() => {
        if (downstream.readyState !== WebSocket.CLOSED) downstream.terminate()
      }, 1000).unref()
    }
    function stop(reason = 'disconnected', isTerminal = false) {
      if (closing || closed) return
      closing = true
      closeReason = reason
      forceTerminal = isTerminal
      if (isTerminal) notifyEnd(reason)
      if (!upstream) {
        void finish(true)
        return
      }
      if (upstream.readyState === WebSocket.OPEN)
        upstream.close(1000, 'Session ended')
      else if (upstream.readyState === WebSocket.CONNECTING)
        upstream.terminate()
      else if (upstream.readyState === WebSocket.CLOSED) {
        void finish(!opened)
        return
      }
      killTimer = setTimeout(() => {
        upstream.terminate()
        void finish(!opened)
      }, 1500)
      killTimer.unref()
    }
    downstream.on('message', (raw, isBinary) => {
      if (closing || closed) return
      try {
        if (Date.now() - windowStart >= 1000) {
          windowStart = Date.now()
          messages = 0
        }
        if (++messages > 20) throw new Error('Message rate exceeded')
        const message = validateClientMessage(raw, isBinary)
        if (message.type === 'livekit_join') {
          if (joined) throw new Error('A connection may join only once')
          joined = true
        } else if (!joined)
          throw new Error('Join before updating the direction')
        const value = JSON.stringify(message)
        if (upstream?.readyState === WebSocket.OPEN) send(upstream, value)
        else {
          queuedBytes += Buffer.byteLength(value)
          if (queued.length >= 32 || queuedBytes > MAX_BUFFER)
            throw new Error('Signaling buffer exceeded')
          queued.push(value)
        }
      } catch {
        stop('invalid_signaling', true)
      }
    })
    downstream.on('close', () => stop('client_disconnected'))
    downstream.on('error', () => stop('client_error'))
    downstream.on('pong', () => {
      pong = true
    })
    ticker = setInterval(() => {
      if (performance.now() >= allowanceDeadline)
        stop('insufficient_time', true)
      else if (performance.now() >= verifiedUntil)
        stop('verification_failed', true)
    }, 100)
    checker = setInterval(async () => {
      if (closing || closed || checkPending) return
      checkPending = true
      const started = performance.now()
      try {
        const state = await bounded(store.check(id))
        if (closing || closed) return
        if (!validAllowance(state)) {
          stop(state?.code || 'session_expired', true)
          return
        }
        allowanceDeadline = Math.min(
          allowanceDeadline,
          started + state.remaining_seconds * 1000,
        )
        verifiedUntil = performance.now() + verificationTimeoutMs + checkEveryMs
      } catch {
        stop('verification_failed', true)
      } finally {
        checkPending = false
      }
    }, checkEveryMs)
    pinger = setInterval(() => {
      if (!pong) {
        stop('client_lost')
        return
      }
      pong = false
      if (downstream.readyState === WebSocket.OPEN) downstream.ping()
    }, 10000)
    async function connect() {
      try {
        const token = await bounded(
          decartClient.tokens.create({
            expiresIn: 20,
            allowedModels: [model],
            constraints: {
              realtime: { maxSessionDuration: claim.provider_cap_seconds },
            },
          }),
          8000,
        )
        if (closing || closed) return
        providerKey = token.apiKey
        const state = await bounded(store.check(id))
        if (closing || closed) return
        if (!validAllowance(state)) {
          stop(state?.code || 'session_expired', true)
          return
        }
        const target = new URL('wss://api.decart.ai/v1/stream')
        target.searchParams.set('api_key', providerKey)
        target.searchParams.set('model', model)
        target.searchParams.set('user_agent', 'Kinetelle server signaling')
        if (codec) target.searchParams.set('livekit_server_codec', codec)
        upstream = createUpstream(target.toString())
        upstream.on('open', () => {
          opened = true
          if (closing || closed) {
            upstream.close(1000, 'Session ended')
            return
          }
          for (const raw of queued) send(upstream, raw)
          queued = []
          queuedBytes = 0
        })
        upstream.on('message', (raw, isBinary) => {
          if (closed || isBinary) return
          try {
            const msg = JSON.parse(raw.toString())
            if (msg.type === 'session_id' || msg.type === 'livekit_room_info') {
              if (typeof msg.session_id === 'string')
                queueEvent('session', null, msg.session_id.slice(0, 200))
            } else if (msg.type === 'generation_started') queueEvent('started')
            else if (
              msg.type === 'generation_tick' ||
              msg.type === 'generation_ended'
            ) {
              if (
                !Number.isFinite(msg.seconds) ||
                msg.seconds < 0 ||
                msg.seconds > 86400
              )
                throw new Error('Invalid provider usage')
              queueEvent(
                msg.type === 'generation_tick' ? 'tick' : 'ended',
                Math.ceil(msg.seconds),
              )
              if (msg.type === 'generation_ended')
                closeReason = cleanText(msg.reason) || 'provider_ended'
            }
            if (msg.error) msg.error = cleanText(msg.error)
            send(downstream, JSON.stringify(msg))
          } catch {
            stop('provider_protocol_error', true)
          }
        })
        upstream.on('error', () => {
          if (!closing) stop('provider_unavailable')
        })
        upstream.on('close', (code, reason) => {
          providerCloseCode = safeCloseCode(code)
          if (code === 1013)
            providerCloseReason = reason
              .toString()
              .toLowerCase()
              .includes('session limit')
              ? 'Session Limit Reached'
              : 'Try Again Later'
          const confirmed = !opened || code !== 1006
          if (
            !closing &&
            downstream.readyState === WebSocket.OPEN &&
            !confirmed
          )
            send(
              downstream,
              JSON.stringify({
                type: 'error',
                error: 'The realtime connection was interrupted.',
              }),
            )
          if (!closing && code === 1008) closeReason = 'account_restricted'
          if (!closing && code === 1013) closeReason = 'provider_capacity'
          void finish(confirmed && !eventFailed)
        })
      } catch {
        stop('provider_unavailable')
      }
    }
    void connect()
    return { userId: claim.user_id, leaseId: claim.session_id, stop }
  }
  server.on('upgrade', upgrade)
  return {
    closeLease(userId, leaseId) {
      for (const connection of active.values())
        if (connection.userId === userId && connection.leaseId === leaseId)
          connection.stop('session_stopped', true)
    },
    async shutdown() {
      shuttingDown = true
      for (const connection of active.values())
        connection.stop('server_shutdown', true)
      server.off('upgrade', upgrade)
      wss.close()
    },
    get activeConnections() {
      return active.size
    },
  }
}
