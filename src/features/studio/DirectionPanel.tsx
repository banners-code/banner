import { ArrowUpRight, BookmarkPlus, Check, Copy, ImagePlus, LockKeyhole, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { studioPresets, type StudioPreset } from '../../data/presets'
import type { SavedDirection } from '../../lib/studioLibrary'
import type { TransformationConnectionState } from './transformation/TransformationAdapter'

type DirectionPanelProps = {
  prompt: string
  selectedPreset: StudioPreset
  cameraReady: boolean
  authenticated: boolean
  authLoading: boolean
  authConfigured: boolean
  connectionState: TransformationConnectionState | 'idle' | 'error'
  connectionError: string | null
  connectionMessage: string
  referenceImage: File | null
  savedDirections: SavedDirection[]
  savedDirectionsLoading: boolean
  savedDirectionsError: string | null
  savingDirection: boolean
  onPromptChange: (prompt: string) => void
  onPresetChange: (preset: StudioPreset) => void
  onApply: () => void | Promise<void>
  onPreviewDemo: () => void
  onReferenceChange: (file: File | null) => void
  onSaveDirection: () => void
  onLoadDirection: (direction: SavedDirection) => void
  onDeleteDirection: (id: string) => void
  onReset: () => void
  onNotice: (message: string) => void
}

export default function DirectionPanel({
  prompt,
  selectedPreset,
  cameraReady,
  authenticated,
  authLoading,
  authConfigured,
  connectionState,
  connectionError,
  connectionMessage,
  referenceImage,
  savedDirections,
  savedDirectionsLoading,
  savedDirectionsError,
  savingDirection,
  onPromptChange,
  onPresetChange,
  onApply,
  onPreviewDemo,
  onReferenceChange,
  onSaveDirection,
  onLoadDirection,
  onDeleteDirection,
  onReset,
  onNotice,
}: DirectionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const aiActive = connectionState === 'connected' || connectionState === 'generating'
  const isBusy = connectionState === 'connecting' || connectionState === 'reconnecting'

  useEffect(() => {
    if (!referenceImage) {
      setReferenceUrl(null)
      return
    }
    const url = URL.createObjectURL(referenceImage)
    setReferenceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [referenceImage])

  const handleFile = (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Choose a JPG, PNG, WebP, or other image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Keep reference images under 10 MB.')
      return
    }
    onReferenceChange(file)
    onNotice('Reference selected. It is sent only when you start an AI session.')
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      onNotice('Prompt copied to clipboard.')
    } catch {
      onNotice('Clipboard access is unavailable in this browser.')
    }
  }

  return (
    <aside className="studio-tool-card direction-card" aria-labelledby="direction-heading">
      <div className="tool-card-heading">
        <span className="tool-card-icon tool-card-icon-direction"><Sparkles size={17} aria-hidden="true" /></span>
        <div>
          <p className="tool-eyebrow">02 / DIRECTION</p>
          <h2 id="direction-heading">Shape the look</h2>
        </div>
        <button className="icon-button tool-heading-reset" type="button" aria-label="Reset direction" onClick={onReset} title="Reset direction"><RotateCcw size={15} aria-hidden="true" /></button>
      </div>

      <div className="preset-heading"><span className="control-label">Starting point</span><span className="preset-count">{studioPresets.length} {studioPresets.length === 1 ? 'DIRECTION' : 'DIRECTIONS'}</span></div>
      <div className="preset-grid" role="group" aria-label="Visual direction presets">
        {studioPresets.map((preset) => (
          <button
            className={`preset-button ${selectedPreset.id === preset.id ? 'preset-button-selected' : ''}`}
            type="button"
            key={preset.id}
            aria-pressed={selectedPreset.id === preset.id}
            onClick={() => onPresetChange(preset)}
          >
            <span className={`preset-swatch ${preset.swatch}`}><span className="preset-swatch-orb" /></span>
            <span className="preset-button-copy"><strong>{preset.name}</strong><small>{preset.category}</small></span>
            {selectedPreset.id === preset.id && <Check size={13} className="preset-check" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="direction-prompt-heading">
        <label className="control-label" htmlFor="direction-prompt">Your direction</label>
        <button className="text-button prompt-copy" type="button" onClick={copyPrompt}><Copy size={13} aria-hidden="true" /> Copy</button>
      </div>
      <textarea
        id="direction-prompt"
        className="prompt-textarea"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        maxLength={280}
        rows={4}
        placeholder="Describe the feeling, light, or look you want to explore…"
      />
      <div className="prompt-meta"><span>Keep it visual and specific.</span><span>{prompt.length}/280</span></div>

      <details className="saved-directions">
        <summary><span>Saved directions</span><span className="saved-directions-count">{authenticated ? savedDirections.length : 'ACCOUNT'}</span></summary>
        {!authenticated ? (
          <div className="saved-directions-empty">
            <p>Sign in to save prompts and bring them back to this Studio.</p>
            <Link to="/account?next=%2Fstudio">{authConfigured ? 'Sign in to save' : 'Connect an account'} <ArrowUpRight size={13} aria-hidden="true" /></Link>
          </div>
        ) : (
          <div className="saved-directions-content">
            <button className="saved-direction-add" type="button" onClick={onSaveDirection} disabled={!prompt.trim() || savingDirection}>
              <BookmarkPlus size={14} aria-hidden="true" />{savingDirection ? 'Saving direction…' : 'Save current direction'}
            </button>
            {savedDirectionsLoading ? <p className="saved-directions-empty">Loading your directions…</p> : savedDirections.length === 0 ? (
              <p className="saved-directions-empty">Saved prompts will appear here.</p>
            ) : (
              <ul className="saved-direction-list">
                {savedDirections.map((direction) => (
                  <li className="saved-direction-item" key={direction.id}>
                    <button className="saved-direction-load" type="button" onClick={() => onLoadDirection(direction)}>
                      <strong>{direction.title}</strong><span>{direction.prompt}</span>
                    </button>
                    <button className="icon-button saved-direction-delete" type="button" aria-label={'Delete ' + direction.title} title="Delete saved direction" onClick={() => onDeleteDirection(direction.id)}><Trash2 size={13} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
            {savedDirectionsError && <p className="camera-error saved-directions-error" role="alert">{savedDirectionsError}</p>}
          </div>
        )}
      </details>

      <div className="reference-block">
        <div className="reference-heading"><span className="control-label">Reference image</span><span className="optional-label">OPTIONAL</span></div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload a reference image"
          onChange={(event) => handleFile(event.currentTarget.files?.[0])}
        />
        {referenceImage && referenceUrl ? (
          <div className="reference-file">
            <img src={referenceUrl} alt={`Reference image: ${referenceImage.name}`} />
            <span className="reference-file-name" title={referenceImage.name}>{referenceImage.name}</span>
            <button className="icon-button reference-remove" type="button" aria-label="Remove reference image" onClick={() => { onReferenceChange(null); if (fileInputRef.current) fileInputRef.current.value = '' }}><X size={14} aria-hidden="true" /></button>
          </div>
        ) : (
          <button className="reference-upload" type="button" onClick={() => fileInputRef.current?.click()}>
            <span className="reference-upload-icon"><ImagePlus size={16} aria-hidden="true" /></span>
            <span><strong>Add a visual reference</strong><small>JPG, PNG or WebP · up to 10 MB</small></span>
            <span className="reference-add-mark">+</span>
          </button>
        )}
        {referenceImage && <button className="text-button reference-change" type="button" onClick={() => fileInputRef.current?.click()}>Replace image</button>}
        {uploadError && <p className="camera-error" role="alert">{uploadError}</p>}
      <p className="reference-note">Stays in this browser until you start an AI session.</p>
      </div>

      {connectionMessage && <p className="connection-message" role="status">{connectionMessage}</p>}
      {connectionError && <p className="camera-error connection-error" role="alert">{connectionError}</p>}

      {authenticated ? (
        <button className="button button-primary direction-apply" type="button" onClick={() => void onApply()} disabled={!prompt.trim() || !cameraReady || isBusy || authLoading}>
          {isBusy ? <span className="connection-spinner" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {authLoading ? 'Checking account…' : connectionState === 'connecting' ? 'Connecting to Decart…' : connectionState === 'reconnecting' ? 'Reconnecting…' : aiActive ? 'Update live direction' : connectionState === 'error' || connectionState === 'disconnected' ? 'Try live session again' : cameraReady ? 'Start live transformation' : 'Enable camera to continue'}
        </button>
      ) : (
        <Link className="button button-primary direction-apply" to="/account?next=%2Fstudio">
          <LockKeyhole size={16} aria-hidden="true" />{authLoading ? 'Checking account…' : 'Sign in to start live transformation'}
        </Link>
      )}
      <p className="direction-footer-note">{aiActive ? 'Your live camera, microphone and selected reference are being processed by Decart.' : authenticated ? 'Starting sends your camera, microphone and selected reference image to Decart.' : 'Sign in before starting a live Decart session.'}</p>
      {!aiActive && !isBusy && <button className="local-preview-button" type="button" onClick={onPreviewDemo} disabled={!cameraReady}>
        Preview this direction locally
      </button>}
    </aside>
  )
}
