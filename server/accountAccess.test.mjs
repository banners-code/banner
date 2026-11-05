import { describe, expect, it, vi } from 'vitest'
import { checkLiveAccountAccess } from './accountAccess.mjs'

describe('live token account authorization', () => {
  it('allows a verified active account', async () => {
    expect(await checkLiveAccountAccess({ rpc: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }) })).toEqual({ status: 200 })
  })
  it.each(['suspended','banned'])('blocks %s accounts before token issuance', async (status) => {
    const result = await checkLiveAccountAccess({ rpc: vi.fn().mockResolvedValue({ data: { status }, error: null }) })
    expect(result.status).toBe(403)
  })
  it.each([{}, { data: { status: 'unknown' } }, { error: { message: 'RPC unavailable' } }])('fails closed for an unverifiable account: %o', async (response) => {
    expect((await checkLiveAccountAccess({ rpc: vi.fn().mockResolvedValue(response) })).status).toBe(503)
  })
  it('fails closed for network exceptions', async () => {
    expect((await checkLiveAccountAccess({ rpc: vi.fn().mockRejectedValue(new Error('Offline')) })).status).toBe(503)
  })
})
