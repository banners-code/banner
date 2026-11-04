import { Camera, CircleStop, RefreshCw, ShieldCheck } from 'lucide-react'
import type { CameraStatus } from './useCameraInput'
import StreamVideo from './StreamVideo'

type CameraPanelProps = {
  status: CameraStatus
  message: string | null
  stream: MediaStream | null
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onStart: (deviceId?: string) => void
  onStop: () => void
}

const statusCopy: Record<CameraStatus, string> = {
  idle: 'Waiting for camera',
  requesting: 'Requesting access…',
  live: 'Camera is live',
  denied: 'Permission needed',
  unsupported: 'Camera unavailable',
  error: 'Camera needs attention',
}

export default function CameraPanel({ status, message, stream, devices, selectedDeviceId, onStart, onStop }: CameraPanelProps) {
  const isLive = status === 'live'
  const isRequesting = status === 'requesting'

  return (
    <section className="studio-tool-card source-card" aria-labelledby="source-heading">
      <div className="tool-card-heading">
        <span className="tool-card-icon"><Camera size={17} aria-hidden="true" /></span>
        <div>
          <p className="tool-eyebrow">01 / SOURCE</p>
          <h2 id="source-heading">Camera input</h2>
        </div>
      </div>

      <div className={`camera-preview camera-preview-${status}`} role="group" aria-label="Camera source preview">
        {stream ? (
          <>
            <StreamVideo stream={stream} className="camera-preview-video stream-video-mirror" label="Local camera source preview" />
            <div className="camera-preview-live-badge" role="status" aria-live="polite"><span className="camera-status-light" />{statusCopy[status]}</div>
          </>
        ) : (
          <div className={`camera-preview-empty camera-status-${status}`} role="status" aria-live="polite">
            <Camera size={17} aria-hidden="true" />
            <span className="camera-preview-empty-label"><span className="camera-status-light" />{statusCopy[status]}</span>
            {status === 'idle' && <span className="camera-preview-empty-help">Enable the camera to see the source here.</span>}
          </div>
        )}
        <span className="frame-corner frame-corner-tl" aria-hidden="true" /><span className="frame-corner frame-corner-tr" aria-hidden="true" />
        <span className="frame-corner frame-corner-bl" aria-hidden="true" /><span className="frame-corner frame-corner-br" aria-hidden="true" />
      </div>

      <label className="control-label" htmlFor="camera-select">Camera</label>
      <select
        id="camera-select"
        className="select-control"
        value={selectedDeviceId}
        onChange={(event) => {
          const nextId = event.target.value
          onStart(nextId || undefined)
        }}
        disabled={isRequesting || devices.length === 0}
      >
        {devices.length === 0 && <option value="">Default camera</option>}
        {devices.map((device, index) => (
          <option value={device.deviceId} key={device.deviceId || `camera-${index}`}>
            {device.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
      <p className="control-help">
        {devices.length > 1 ? 'Switch inputs at any time.' : 'Available inputs appear here after access is allowed.'}
      </p>

      {message && <p className="camera-error" role="alert">{message}</p>}

      <button
        className={`button ${isLive ? 'button-stop' : 'button-primary'} camera-action`}
        type="button"
        onClick={() => isLive ? onStop() : onStart(selectedDeviceId || undefined)}
        disabled={isRequesting || status === 'unsupported'}
      >
        {isLive ? <CircleStop size={16} aria-hidden="true" /> : isRequesting ? <RefreshCw size={15} className="spin-icon" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
        {isLive ? 'Stop camera' : isRequesting ? 'Opening camera…' : status === 'denied' || status === 'error' ? 'Try again' : 'Enable camera'}
      </button>

      <div className="privacy-note"><ShieldCheck size={14} aria-hidden="true" /><span>Camera and mic stay local until AI starts.</span></div>
    </section>
  )
}
