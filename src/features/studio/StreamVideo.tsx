import { useEffect, useRef } from 'react'

type StreamVideoProps = {
  stream: MediaStream | null
  className: string
  filter?: string
  label: string
}

export default function StreamVideo({ stream, className, filter, label }: StreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => undefined)
    return () => {
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

  return <video ref={videoRef} className={className} aria-label={label} autoPlay playsInline muted style={filter ? { filter } : undefined} />
}
