// @vitest-environment node
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachRealtimeProxy, validateClientMessage } from './realtimeProxy.mjs'

const origin = 'https://studio.example'
const ticket = 'kt_' + 'a'.repeat(43)
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
async function until(condition) {
  const deadline = Date.now() + 2500
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error('Expected socket state not reached')
    await tick()
  }
}
let http,
  upHttp,
  upServer,
  proxy,
  port,
  upPort,
  store,
  upstreams,
  clients,
  targets,
  provider,
  claim
beforeEach(async () => {
  http = createServer()
  upHttp = createServer()
  upServer = new WebSocketServer({ server: upHttp })
  upstreams = []
  clients = []
  targets = []
  upServer.on('connection', (socket) => upstreams.push(socket))
  upHttp.listen(0, '127.0.0.1')
  await once(upHttp, 'listening')
  upPort = upHttp.address().port
  claim = {
    active: true,
    session_id: 'lease',
    user_id: 'user',
    remaining_seconds: 120,
    provider_cap_seconds: 120,
  }
  const consumed = new Set()
  store = {
    claim: vi.fn().mockImplementation(async (key) => {
      if (consumed.has(key)) return { active: false, code: 'ticket_invalid' }
      consumed.add(key)
      return claim
    }),
    check: vi.fn().mockImplementation(async () => claim),
    record: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  provider = {
    tokens: {
      create: vi
        .fn()
        .mockResolvedValue({ apiKey: 'provider-private-ephemeral' }),
    },
  }
  proxy = attachRealtimeProxy(http, {
    store,
    decartClient: provider,
    originIsAllowed: (value) => value === origin,
    createUpstream: (url) => {
      targets.push(url)
      return new WebSocket(`ws://127.0.0.1:${upPort}`)
    },
    checkEveryMs: 30,
    verificationTimeoutMs: 150,
  })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  port = http.address().port
})
afterEach(async () => {
  for (const client of clients) client.terminate()
  for (const upstream of upstreams) upstream.terminate()
  await proxy.shutdown()
  await until(() => proxy.activeConnections === 0)
  await Promise.all([
    new Promise((resolve) => http.close(resolve)),
    new Promise((resolve) => upServer.close(() => upHttp.close(resolve))),
  ])
})
async function connect(
  params = `api_key=${ticket}&model=lucy-2.6`,
  requestOrigin = origin,
) {
  const client = new WebSocket(
    `ws://127.0.0.1:${port}/api/realtime/v1/stream?${params}`,
    { headers: { Origin: requestOrigin } },
  )
  client.on('error', () => {})
  clients.push(client)
  return client
}
describe('server-controlled WebSocket signaling', () => {
  it('keeps provider credentials upstream, forwards prompts, and records trusted usage', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    const joined = once(upstreams[0], 'message')
    client.send(JSON.stringify({ type: 'livekit_join' }))
    await joined
    const received = once(upstreams[0], 'message')
    client.send(
      JSON.stringify({
        type: 'prompt',
        prompt: 'Photorealistic human',
        enhance_prompt: true,
      }),
    )
    expect(JSON.parse((await received)[0].toString()).prompt).toBe(
      'Photorealistic human',
    )
    expect(new URL(targets[0]).searchParams.get('api_key')).toBe(
      'provider-private-ephemeral',
    )
    expect(targets[0]).not.toContain(ticket)
    const output = once(client, 'message')
    upstreams[0].send(JSON.stringify({ type: 'generation_tick', seconds: 12 }))
    expect(JSON.parse((await output)[0].toString()).seconds).toBe(12)
    await until(() => store.record.mock.calls.length === 1)
    expect(store.record).toHaveBeenCalledWith(
      expect.any(String),
      'tick',
      12,
      null,
    )
    expect(provider.tokens.create).toHaveBeenCalledWith({
      expiresIn: 20,
      allowedModels: ['lucy-2.6'],
      constraints: { realtime: { maxSessionDuration: 120 } },
    })
  })
  it('consumes a ticket once and rejects replay before another upstream connection', async () => {
    const first = await connect()
    await once(first, 'open')
    await until(() => upstreams.length === 1)
    const replay = await connect()
    const [, response] = await once(replay, 'unexpected-response')
    response.resume()
    replay.terminate()
    expect(response.statusCode).toBe(401)
    expect(targets).toHaveLength(1)
  })
  it.each([
    [`api_key=${ticket}&model=lucy-2.6`, 'https://other.example', 403],
    [`api_key=${ticket}&model=lucy-2.6&speed=fast`, origin, 400],
    [`api_key=${ticket}&model=other`, origin, 400],
  ])(
    'rejects disallowed origins/models/options before consuming tickets',
    async (params, requestOrigin, status) => {
      const client = await connect(params, requestOrigin)
      const [, response] = await once(client, 'unexpected-response')
      response.resume()
      client.terminate()
      expect(response.statusCode).toBe(status)
      expect(store.claim).not.toHaveBeenCalled()
      expect(targets).toHaveLength(0)
    },
  )
  it('closes the provider when the database says time expired, without relying on browser timers', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    store.check.mockResolvedValue({ active: false, code: 'insufficient_time' })
    const [code] = await once(client, 'close')
    expect(code).toBe(1008)
    expect(store.close).toHaveBeenCalledWith(
      expect.any(String),
      true,
      'insufficient_time',
    )
    expect(upstreams[0].readyState).toBe(WebSocket.CLOSED)
  })
  it('fails closed when server verification stalls', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    store.check.mockReturnValue(new Promise(() => {}))
    const [code] = await once(client, 'close')
    expect(code).toBe(1008)
    expect(store.close).toHaveBeenCalledWith(
      expect.any(String),
      true,
      'verification_failed',
    )
  })
  it('only stops the connection owned by the authenticated account', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    proxy.closeLease('other-user', 'lease')
    expect(proxy.activeConnections).toBe(1)
    proxy.closeLease('user', 'lease')
    await once(client, 'close')
    expect(store.close).toHaveBeenCalledWith(
      expect.any(String),
      true,
      'session_stopped',
    )
  })
  it('rejects forged usage messages from the browser', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    client.send(JSON.stringify({ type: 'generation_tick', seconds: 0 }))
    await once(client, 'close')
    expect(store.record).not.toHaveBeenCalled()
    expect(store.close).toHaveBeenCalledWith(
      expect.any(String),
      true,
      'invalid_signaling',
    )
  })
  it('does not release an unconfirmed provider connection', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    upstreams[0].terminate()
    await once(client, 'close')
    expect(store.close).toHaveBeenCalledWith(
      expect.any(String),
      false,
      'disconnected',
    )
  })
  it('redacts provider credentials from upstream errors', async () => {
    const client = await connect()
    await once(client, 'open')
    await until(() => upstreams.length === 1)
    const message = once(client, 'message')
    upstreams[0].send(
      JSON.stringify({
        type: 'error',
        error: 'bad provider-private-ephemeral',
      }),
    )
    expect((await message)[0].toString()).not.toContain(
      'provider-private-ephemeral',
    )
  })
})
describe('signaling validation', () => {
  it('strips unknown fields and rejects invalid or oversized image payloads', () => {
    expect(
      validateClientMessage(
        Buffer.from(
          JSON.stringify({
            type: 'livekit_join',
            passthrough: true,
            secret: 'x',
          }),
        ),
        false,
      ),
    ).toEqual({ type: 'livekit_join', passthrough: false })
    expect(() =>
      validateClientMessage(
        Buffer.from('{"type":"set_image","image_data":"invalid!"}'),
        false,
      ),
    ).toThrow()
    expect(() => validateClientMessage(Buffer.from('{}'), true)).toThrow()
  })
})
