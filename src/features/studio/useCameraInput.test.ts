import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useCameraInput from './useCameraInput'

describe('camera cancellation during live-session setup', () => {
  it('stops tracks returned after the user cancels a pending permission request', async () => {
    let resolve!: (stream: MediaStream) => void
    const pending = new Promise<MediaStream>((done) => {
      resolve = done
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockReturnValue(pending),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    })
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    const { result } = renderHook(() => useCameraInput())
    let request!: Promise<MediaStream | null>
    act(() => {
      request = result.current.startCamera()
    })
    act(() => result.current.stopCamera())
    await act(async () => {
      resolve(stream)
      await request
    })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')
    expect(result.current.stream).toBeNull()
  })
})
