import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioPage from '../../pages/StudioPage'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'studio@example.com' },
    loading: false,
    configured: true,
  }),
}))

vi.mock('../../lib/supabase', () => ({
  getCurrentAccessToken: vi.fn().mockResolvedValue('test-supabase-access-token'),
}))

const track = {
  stop: vi.fn(),
  getSettings: () => ({ deviceId: 'camera-one' }),
}

const stream = {
  getTracks: () => [track],
  getVideoTracks: () => [track],
} as unknown as MediaStream

let mediaDevices: {
  getUserMedia: ReturnType<typeof vi.fn>
  enumerateDevices: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

function renderStudio() {
  return render(<MemoryRouter><StudioPage /></MemoryRouter>)
}

describe('Kinetelle Studio Phase 3 interactions', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    track.stop.mockClear()
    mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'videoinput', deviceId: 'camera-one', label: 'Studio Camera' },
        { kind: 'videoinput', deviceId: 'camera-two', label: 'Desk Camera' },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
  })

  it('requests webcam access only after the user starts the camera and stops its tracks on exit', async () => {
    const user = userEvent.setup()
    renderStudio()

    await user.click(screen.getByRole('button', { name: 'Enable camera' }))
    await screen.findByText('Camera is live')
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'user' } },
      audio: false,
    })
    expect(document.querySelector('.comparison-input')).not.toBeInTheDocument()
    expect(document.querySelector('.camera-preview video')).toBeInTheDocument()
    expect(document.querySelector('.comparison-frame-media video')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop camera' }))
    await waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(screen.getByText('Waiting for camera')).toBeInTheDocument()
  })

  it('changes to the selected camera when multiple inputs are available', async () => {
    const user = userEvent.setup()
    renderStudio()

    const cameraSelect = await screen.findByRole('combobox', { name: 'Camera' })
    await user.selectOptions(cameraSelect, 'camera-two')

    await waitFor(() => expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'camera-two' } },
      audio: false,
    }))
    expect(await screen.findByText('Camera is live')).toBeInTheDocument()
  })

  it('starts with Photorealistic Human selected as the direction', () => {
    renderStudio()

    expect(screen.getByLabelText('Your direction')).toHaveValue('Photorealistic human')
    expect(screen.getByRole('button', { name: /Photorealistic Human/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers only Photorealistic Human and keeps the output frame free of overlays', async () => {
    const user = userEvent.setup()
    renderStudio()
    await user.click(screen.getByRole('button', { name: 'Enable camera' }))
    await screen.findByText('Camera is live')

    expect(screen.getByRole('button', { name: /Photorealistic Human/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 DIRECTION')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Visual direction presets' })).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('Waiting for output')).toBeInTheDocument()
    expect(screen.queryByText('DEMO OUTPUT')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preview this direction locally' }))

    const outputFrame = document.querySelector('.comparison-frame-media')
    expect(outputFrame?.children).toHaveLength(1)
    expect(outputFrame?.querySelector('video')).toHaveStyle({ filter: 'none' })
    expect(screen.queryByText(/Demo only/)).not.toBeInTheDocument()
  })

  it('previews a selected reference image locally and allows removing it', async () => {
    const user = userEvent.setup()
    renderStudio()
    const reference = new File(['local image bytes'], 'reference.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('Upload a reference image') as HTMLInputElement

    fireEvent.change(fileInput, { target: { files: [reference] } })
    expect(await screen.findByText('reference.png')).toBeInTheDocument()
    expect(screen.getByText('Stays in this browser until you start an AI session.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove reference image' }))
    expect(screen.getByRole('button', { name: /Add a visual reference/ })).toBeInTheDocument()
  })

  it('shows a useful message when camera permission is denied', async () => {
    const user = userEvent.setup()
    mediaDevices.getUserMedia.mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'))
    renderStudio()

    await user.click(screen.getByRole('button', { name: 'Enable camera' }))
    expect(await screen.findByText('Permission needed')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Camera permission is off.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  it('requests a Decart token only after the user starts a live session and keeps the fallback labeled as demo', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Live sessions are not configured on this server.' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderStudio()

    await user.click(screen.getByRole('button', { name: 'Enable camera' }))
    await screen.findByText('Camera is live')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Start live transformation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Live sessions are not configured on this server.')
    expect(fetchMock).toHaveBeenCalledWith('/api/realtime-token', expect.anything())
    expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({
      audio: true,
      video: expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    }))
    expect(screen.getByText('LOCAL DEMO OUTPUT')).toBeInTheDocument()
    expect(screen.queryByText('DEMO OUTPUT')).not.toBeInTheDocument()
  })
})
