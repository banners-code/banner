import type { MediaKind } from '../lib/homepageContent'

export default function HomepageMedia({
  kind,
  url,
  alt,
  className = '',
  controls = false,
}: {
  kind: MediaKind
  url: string
  alt: string
  className?: string
  controls?: boolean
}) {
  if (!url) return null
  if (kind === 'video') {
    return <video className={className} src={url} aria-label={alt} autoPlay={!controls} muted={!controls} loop={!controls} playsInline preload="metadata" controls={controls} />
  }
  return <img className={className} src={url} alt={alt} />
}
