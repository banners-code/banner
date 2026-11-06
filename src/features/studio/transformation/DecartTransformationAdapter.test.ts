import { describe, expect, it, vi } from 'vitest'
const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  connect: vi.fn(),
  set: vi.fn(),
  disconnect: vi.fn(),
}))
vi.mock('@decartai/sdk', () => ({
  models: { realtime: () => ({ fps: 30, width: 1280, height: 720 }) },
  createDecartClient: (options: unknown) => {
    sdk.create(options)
    return { realtime: { connect: sdk.connect } }
  },
}))
import { decartTransformationAdapter } from './DecartTransformationAdapter'
import { studioPresets } from '../../../data/presets'

describe('browser provider credential boundary', () => {
  it('dials the app signaling origin using only an app ticket and retains SDK state updates', async () => {
    const requestToken = vi.fn().mockResolvedValue('kt_test_app_ticket')
    sdk.connect.mockResolvedValue({
      set: sdk.set,
      disconnect: sdk.disconnect,
      on: vi.fn(),
    })
    const direction = {
      prompt: 'Photorealistic human',
      preset: studioPresets[0],
      referenceImage: null,
    }
    const session = await decartTransformationAdapter.connect(
      {} as MediaStream,
      direction,
      { onOutputStream: vi.fn(), onConnectionChange: vi.fn() },
      { requestToken },
    )
    const options = sdk.create.mock.calls[0][0]
    expect(options.realtimeBaseUrl).toBe(
      `ws://${window.location.host}/api/realtime`,
    )
    expect(options.apiKey).toBeUndefined()
    expect(options.telemetry).toBe(false)
    await expect(options.apiKeyProvider()).resolves.toBe('kt_test_app_ticket')
    await session.update({ ...direction, prompt: 'Keep natural skin texture' })
    expect(sdk.set).toHaveBeenCalledWith({
      prompt: 'Keep natural skin texture',
      image: null,
      enhance: true,
    })
    session.disconnect()
    expect(sdk.disconnect).toHaveBeenCalledTimes(1)
  })
})
