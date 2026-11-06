import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LiveTimeController,
  type LiveAllowance,
  type LiveSessionApi,
} from './liveSession'

vi.mock('./supabase', () => ({ getCurrentAccessToken: vi.fn() }))
const data = (seconds: number): LiveAllowance => ({
  active: true,
  session_id: 'lease',
  remaining_seconds: seconds,
  balance_seconds: seconds,
  expires_at: '',
})
function setup(seconds = 120) {
  const api: LiveSessionApi = {
    reserve: vi.fn().mockResolvedValue(data(seconds)),
    heartbeat: vi.fn().mockResolvedValue(data(seconds)),
    token: vi
      .fn()
      .mockResolvedValue({ ...data(seconds), connectionTicket: 'test-ticket' }),
    stop: vi.fn().mockResolvedValue({ active: false }),
  }
  const events = { onChange: vi.fn(), onEnded: vi.fn(), onSettled: vi.fn() }
  return { api, events, controller: new LiveTimeController(api, events) }
}
describe('live-time lifecycle', () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    }),
  )
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })
  it('stops at the allowance deadline even while renewal requests are pending', async () => {
    const { controller, events, api } = setup(12)
    vi.mocked(api.heartbeat).mockReturnValue(new Promise(() => {}))
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(12000)
    expect(events.onEnded).toHaveBeenCalledWith(
      expect.stringContaining('allowance has ended'),
    )
    expect(api.stop).toHaveBeenCalledTimes(1)
  })
  it('fails closed when heartbeat verification fails', async () => {
    const { controller, events, api } = setup()
    vi.mocked(api.heartbeat).mockRejectedValue(
      new Error('Verification offline'),
    )
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(10000)
    expect(events.onEnded).toHaveBeenCalledWith('Verification offline')
    await expect(controller.requestToken()).rejects.toThrow(
      'Authorize live time',
    )
  })
  it('never extends the original allowance on reconnect', async () => {
    const { controller, events } = setup(30)
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(15000)
    await controller.requestToken()
    await vi.advanceTimersByTimeAsync(15000)
    expect(events.onEnded).toHaveBeenCalledTimes(1)
  })
  it('starts the metered countdown once and ignores an older pending heartbeat', async () => {
    const { controller, api, events } = setup(120)
    let resolve!: (value: LiveAllowance) => void
    vi.mocked(api.reserve).mockResolvedValue({ ...data(120), metering: false })
    vi.mocked(api.heartbeat).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(10000)
    await controller.requestToken()
    resolve({ ...data(120), metering: false })
    await Promise.resolve()
    expect(events.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ metering: true, remainingSeconds: 120 }),
    )
    await vi.advanceTimersByTimeAsync(5000)
    await controller.requestToken()
    expect(events.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ remainingSeconds: 115 }),
    )
    controller.stop()
  })
  it('settles a late reservation response after the user cancels', async () => {
    const { controller, api, events } = setup()
    let resolve!: (value: LiveAllowance) => void
    vi.mocked(api.reserve).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const pending = controller.reserve()
    const failure = expect(pending).rejects.toThrow('cancelled')
    controller.stop()
    resolve(data(120))
    await failure
    expect(api.stop).toHaveBeenCalledTimes(1)
    expect(events.onEnded).not.toHaveBeenCalled()
  })
  it('ignores an old heartbeat after stop and a new session', async () => {
    const { controller, api, events } = setup(120)
    let resolve!: (value: LiveAllowance) => void
    vi.mocked(api.heartbeat).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(10000)
    controller.stop()
    await controller.reserve()
    resolve(data(1))
    await Promise.resolve()
    expect(events.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ remainingSeconds: 120 }),
    )
    controller.stop()
  })
  it('expires on local verification timeout even if the network never answers', async () => {
    const { controller, events, api } = setup()
    vi.mocked(api.heartbeat).mockReturnValue(new Promise(() => {}))
    await controller.reserve()
    await vi.advanceTimersByTimeAsync(35000)
    expect(events.onEnded).toHaveBeenCalledWith(
      expect.stringContaining('verification was interrupted'),
    )
  })
})
