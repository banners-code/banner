import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported' | 'error'
export type CameraFormat = Pick<MediaTrackConstraints, 'frameRate' | 'width' | 'height'>

function getCameraError(error: unknown, includeAudio: boolean) {
  if (!(error instanceof DOMException)) return 'The camera could not be opened. Check that it is available and try again.'
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return includeAudio
      ? 'Camera or microphone permission is off. Allow access in your browser settings, then try again.'
      : 'Camera permission is off. Allow access in your browser settings, then try again.'
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return includeAudio
      ? 'A camera or microphone was not found. Connect the needed devices and try again.'
      : 'No camera was found. Connect a camera and try again.'
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'The camera is in use by another app. Close it there, then try again.'
  }
  if (error.name === 'OverconstrainedError') {
    return 'That camera is no longer available. Choose another camera and try again.'
  }
  return 'The camera could not be opened. Check your browser permissions and try again.'
}

export default function useCameraInput() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(false)

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return []
    }
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const cameras = allDevices.filter((device) => device.kind === 'videoinput')
      setDevices(cameras)
      return cameras
    } catch {
      setDevices([])
      return []
    }
  }, [])

  const startCamera = useCallback(async (deviceId?: string, format?: CameraFormat, includeAudio = false) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      setMessage('Camera access needs a supported browser on HTTPS or localhost.')
      return null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setStatus('requesting')
    setMessage(null)

    try {
      const video: MediaTrackConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'user' } }),
        ...format,
      }
      const nextStream = await navigator.mediaDevices.getUserMedia({ video, audio: includeAudio })
      if (!mountedRef.current) {
        nextStream.getTracks().forEach((track) => track.stop())
        return null
      }
      streamRef.current = nextStream
      setStream(nextStream)
      setStatus('live')
      const trackDeviceId = nextStream.getVideoTracks()[0]?.getSettings().deviceId
      const cameras = await refreshDevices()
      const nextDeviceId = trackDeviceId || deviceId || cameras[0]?.deviceId || ''
      if (mountedRef.current) setSelectedDeviceId(nextDeviceId)
      return nextStream
    } catch (error) {
      if (!mountedRef.current) return null
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setStatus(denied ? 'denied' : error instanceof DOMException && error.name === 'NotFoundError' ? 'unsupported' : 'error')
      setMessage(getCameraError(error, includeAudio))
      await refreshDevices()
      return null
    }
  }, [refreshDevices])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setStatus('idle')
    setMessage(null)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refreshDevices()
    const mediaDevices = navigator.mediaDevices
    const handleDeviceChange = () => void refreshDevices()
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)
    return () => {
      mountedRef.current = false
      mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [refreshDevices])

  return {
    stream,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    status,
    message,
    startCamera,
    stopCamera,
    refreshDevices,
  }
}
