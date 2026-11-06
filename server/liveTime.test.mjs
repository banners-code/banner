import { describe, it, expect, vi } from 'vitest'
import {
  createLiveTimeService,
  createSignalingStore,
  hashTicket,
} from './liveTime.mjs'
const id = 'c11359c0-6f90-42d2-9ad3-d3745da87323'
const active = {
  active: true,
  session_id: id,
  remaining_seconds: 120,
  balance_seconds: 120,
}
describe('server connection authorization', () => {
  it('issues an opaque app ticket and stores only its hash', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: active })
    const result = await createLiveTimeService({ client: { rpc } }).ticket(
      'verified-user',
      id,
    )
    expect(result.status).toBe(200)
    expect(result.body.connectionTicket).toMatch(/^kt_[A-Za-z0-9_-]{43}$/)
    expect(result.body.apiKey).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('server_issue_connection_ticket', {
      p_user_id: 'verified-user',
      p_lease_id: id,
      p_ticket_hash: hashTicket(result.body.connectionTicket),
    })
  })
  it.each([
    ['insufficient_time', 402],
    ['session_in_use', 409],
    ['account_restricted', 403],
    ['session_stopped', 410],
  ])('rejects %s before issuing a ticket', async (code, status) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { active: false, code } }),
    }
    const result = await createLiveTimeService({ client }).ticket(
      'verified-user',
      id,
    )
    expect(result.status).toBe(status)
    expect(result.body.connectionTicket).toBeUndefined()
  })
  it('fails closed on missing or failed accounting', async () => {
    expect(
      (await createLiveTimeService({ client: null }).ticket('user', id)).status,
    ).toBe(503)
    const client = { rpc: vi.fn().mockRejectedValue(new Error('offline')) }
    expect(
      (await createLiveTimeService({ client }).ticket('user', id)).status,
    ).toBe(503)
    expect(
      (await createLiveTimeService({ client }).update('user', id, 'heartbeat'))
        .status,
    ).toBe(503)
  })
  it('rejects invalid session references without database calls', async () => {
    const client = { rpc: vi.fn() }
    expect(
      (await createLiveTimeService({ client }).ticket('user', 'bad')).status,
    ).toBe(400)
    expect(client.rpc).not.toHaveBeenCalled()
  })
  it('binds server observations and closure to the connection fence', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: active })
    const store = createSignalingStore({ rpc })
    await store.claim('app-ticket', id)
    expect(rpc).toHaveBeenLastCalledWith('server_claim_connection_ticket', {
      p_ticket_hash: hashTicket('app-ticket'),
      p_connection_id: id,
    })
    await store.record(id, 'tick', 20, 'provider-session')
    expect(rpc).toHaveBeenLastCalledWith('server_record_provider_event', {
      p_connection_id: id,
      p_event: 'tick',
      p_seconds: 20,
      p_provider_session_id: 'provider-session',
    })
    await store.close(id, false, 'unconfirmed')
    expect(rpc).toHaveBeenLastCalledWith('server_close_connection', {
      p_connection_id: id,
      p_confirmed: false,
      p_reason: 'unconfirmed',
    })
  })
})
