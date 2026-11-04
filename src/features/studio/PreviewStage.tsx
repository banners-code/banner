import { Maximize2, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { StudioPreset } from '../../data/presets'
import StreamVideo from './StreamVideo'

type PreviewStageProps = {
  outputStream: MediaStream | null
  status: string
  preset: StudioPreset
  applied: boolean
  isDecartOutput: boolean
  aspect: 'landscape' | 'portrait'
  onAspectChange: (aspect: 'landscape' | 'portrait') => void
}

function PreviewEmpty() {
  return (
    <div className="preview-empty" role="status">Waiting for output</div>
  )
}

export default function PreviewStage({ outputStream, status, preset, applied, isDecartOutput, aspect, onAspectChange }: PreviewStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const openFullscreen = async () => {
    if (!stageRef.current || !document.fullscreenEnabled) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRef.current.requestFullscreen()
    } catch {
      // Fullscreen can be denied by browser policy; the preview remains usable.
    }
  }

  useEffect(() => {
    const updateFullscreenState = () => {
      const active = document.fullscreenElement === stageRef.current
      setIsFullscreen(active)
      stageRef.current?.classList.toggle('stage-fullscreen', active)
    }
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  return (
    <section className="preview-column" aria-label="Live output canvas">
      <div className="preview-toolbar">
        <div className="preview-toolbar-title"><span className="live-indicator"><span /></span><span>LIVE CANVAS</span><span className="preview-separator">/</span><span className="preview-state">{status}</span></div>
        <div className="preview-toolbar-actions">
          <div className="aspect-switch" role="group" aria-label="Preview aspect ratio">
            <button type="button" aria-pressed={aspect === 'landscape'} aria-label="Landscape preview" onClick={() => onAspectChange('landscape')}><RectangleHorizontal size={15} aria-hidden="true" /></button>
            <button type="button" aria-pressed={aspect === 'portrait'} aria-label="Portrait preview" onClick={() => onAspectChange('portrait')}><RectangleVertical size={15} aria-hidden="true" /></button>
          </div>
          <button className="icon-button preview-fullscreen" type="button" aria-label={isFullscreen ? 'Exit fullscreen' : 'Preview fullscreen'} onClick={openFullscreen} disabled={!document.fullscreenEnabled}>
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={stageRef} className={`preview-stage preview-stage-${aspect}`}>
        <div className={`comparison-frame-media ${applied && !isDecartOutput ? 'has-demo-look' : ''}`}>
          {outputStream
            ? <StreamVideo stream={outputStream} className="stream-video stream-video-mirror" filter={applied && !isDecartOutput ? preset.filter : 'none'} label={isDecartOutput ? 'Decart transformed video output' : 'Demonstration video output'} />
            : <PreviewEmpty />}
        </div>
      </div>
    </section>
  )
}
