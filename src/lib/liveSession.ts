import { getCurrentAccessToken } from './supabase'

export type LiveAllowance = {
  active: true
  session_id: string
  remaining_seconds: number
  balance_seconds: number
  expires_at: string
  metering?: boolean
}
export type LiveSessionApi = {
  reserve(id: string): Promise<LiveAllowance>
  heartbeat(id: string): Promise<LiveAllowance>
  token(id: string): Promise<LiveAllowance & { connectionTicket: string }>
  stop(id: string): Promise<unknown>
}

async function request(path: string, body?: object, keepalive = false) {
  const accessToken = await getCurrentAccessToken()
  if (!accessToken) throw new Error('Sign in to start a live session.')
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(8000),
    keepalive,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(result?.error || 'Live-time verification is unavailable.')
  return result
}
function allowance(value: unknown): LiveAllowance {
  const data = value as Partial<LiveAllowance> | null
  if (
    !data?.active ||
    typeof data.session_id !== 'string' ||
    !Number.isFinite(data.remaining_seconds) ||
    Number(data.remaining_seconds) <= 0 ||
    !Number.isFinite(data.balance_seconds)
  ) {
    throw new Error(
      'The live-time authorization was incomplete. The session has stopped.',
    )
  }
  return data as LiveAllowance
}
export const liveSessionApi: LiveSessionApi = {
  reserve: async (requestId) =>
    allowance(await request('/api/live-sessions', { requestId })),
  heartbeat: async (id) =>
    allowance(await request(`/api/live-sessions/${id}/heartbeat`)),
  token: async (sessionId) => {
    const result = await request('/api/connection-ticket', { sessionId })
    const authorized = allowance(result)
    if (typeof result.connectionTicket !== 'string' || !result.connectionTicket)
      throw new Error('The connection ticket was incomplete.')
    return { ...authorized, connectionTicket: result.connectionTicket }
  },
  stop: (id) => request(`/api/live-sessions/${id}/stop`, undefined, true),
}

export type LiveTimeSnapshot = {
  remainingSeconds: number
  balanceSeconds: number
  metering: boolean
}

/** App-owned lifecycle: stale responses cannot renew or replace a newer session. */
export class LiveTimeController {
  private id: string | null = null
  private version = 0
  private deadline = 0
  private verificationDeadline = 0
  private balance = 0
  private warned = false
  private metering = false
  private tickTimer: ReturnType<typeof setInterval> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private heartbeatPending = false
  constructor(
    private api: LiveSessionApi,
    private events: {
      onChange(value: LiveTimeSnapshot | null): void
      onEnded(message: string): void
      onSettled(): void
    },
  ) {}

  async reserve() {
    this.stop()
    const version = this.version
    const id = crypto.randomUUID()
    const started = performance.now()
    const data = await this.api.reserve(id)
    if (version !== this.version) {
      void this.api.stop(id).catch(() => undefined)
      throw new Error('The connection attempt was cancelled.')
    }
    this.id = id
    this.warned = false
    this.apply(data, started)
    if (!this.id)
      throw new Error('The live-time allowance expired while connecting.')
    this.tickTimer = setInterval(() => this.tick(), 250)
    this.heartbeatTimer = setInterval(
      () => void this.heartbeat(version),
      10_000,
    )
  }
  private apply(data: LiveAllowance, started: number) {
    if (this.metering && data.metering === false) return
    // Request time is included rather than letting network delay extend a lease.
    const candidate = started + data.remaining_seconds * 1000
    const activating = !this.metering && data.metering !== false
    this.metering = this.metering || data.metering !== false
    this.deadline =
      this.deadline && !activating
        ? Math.min(this.deadline, candidate)
        : candidate
    this.verificationDeadline = Math.max(
      this.verificationDeadline,
      started + 35_000,
    )
    this.balance = data.balance_seconds
    this.tick()
  }
  private tick() {
    if (!this.id) return
    const now = performance.now()
    if (now >= this.deadline) {
      this.end(
        'Your live-time allowance has ended. Fund your account or start a new session if you have time remaining.',
      )
      return
    }
    if (now >= this.verificationDeadline) {
      this.end(
        'Live-time verification was interrupted. The live session has stopped; check your connection before trying again.',
      )
      return
    }
    const remainingSeconds = Math.max(
      0,
      Math.ceil((this.deadline - now) / 1000),
    )
    this.warned = remainingSeconds <= 60
    this.events.onChange({
      remainingSeconds,
      balanceSeconds: this.balance,
      metering: this.metering,
    })
  }
  private async heartbeat(version: number) {
    if (!this.id || this.heartbeatPending) return
    this.heartbeatPending = true
    const started = performance.now()
    try {
      const data = await this.api.heartbeat(this.id)
      if (version === this.version && this.id) this.apply(data, started)
    } catch (cause) {
      if (version === this.version && this.id)
        this.end(
          cause instanceof Error
            ? cause.message
            : 'Live-time verification failed. The session has stopped.',
        )
    } finally {
      if (version === this.version) this.heartbeatPending = false
    }
  }
  async requestToken() {
    if (!this.id) throw new Error('Authorize live time before connecting.')
    const version = this.version
    const started = performance.now()
    const data = await this.api.token(this.id)
    if (version !== this.version || !this.id)
      throw new Error('The live session was cancelled.')
    this.apply(data, started)
    if (!this.id) throw new Error('The live-time allowance expired.')
    return data.connectionTicket
  }
  private end(message: string) {
    this.stop()
    this.events.onEnded(message)
  }
  stop() {
    this.version += 1
    clearInterval(this.tickTimer)
    clearInterval(this.heartbeatTimer)
    this.tickTimer = this.heartbeatTimer = undefined
    const id = this.id
    this.id = null
    this.deadline = this.verificationDeadline = 0
    this.metering = false
    this.heartbeatPending = false
    this.events.onChange(null)
    if (id)
      void this.api
        .stop(id)
        .catch(() => undefined)
        .finally(() => this.events.onSettled())
  }
  get lowTime() {
    return this.warned
  }
}
