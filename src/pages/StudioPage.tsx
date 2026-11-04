import { ArrowLeft, CircleHelp, Radio, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import { defaultPrompt, findPreset, studioPresets, type StudioPreset } from '../data/presets'
import CameraPanel from '../features/studio/CameraPanel'
import DirectionPanel from '../features/studio/DirectionPanel'
import PreviewStage from '../features/studio/PreviewStage'
import useCameraInput from '../features/studio/useCameraInput'
import type { TransformationConnectionState, TransformationDirection, TransformationSession } from '../features/studio/transformation/TransformationAdapter'
import {
  createSavedDirection,
  loadStudioLibrary,
  removeSavedDirection,
  saveStudioPreferences,
  type SavedDirection,
} from '../lib/studioLibrary'

type StudioConnectionState = TransformationConnectionState | 'idle' | 'error'

function sessionEndMessage(reason: string) {
  if (reason === 'insufficient_credits') return 'Your Decart account has no available credits for this session.'
  if (reason === 'session_limit') return 'Your Decart account has reached its concurrent session limit.'
  if (reason === 'moderation_violation' || reason === 'policy_violation') return 'Decart ended this session. Review the prompt and reference image, then try again.'
  return 'The Decart session ended. You can start another live session when ready.'
}

function connectionStatusMessage(state: TransformationConnectionState) {
  if (state === 'connecting') return 'Opening a secure realtime connection to Decart…'
  if (state === 'reconnecting') return 'Connection interrupted. Decart is reconnecting…'
  if (state === 'connected' || state === 'generating') return 'Live Decart session is active.'
  return ''
}

export default function StudioPage() {
  const { user, loading: authLoading, configured: authConfigured } = useAuth()
  const [searchParams] = useSearchParams()
  const initialPreset = findPreset(searchParams.get('preset'))
  const [selectedPreset, setSelectedPreset] = useState<StudioPreset>(initialPreset)
  const [appliedPreset, setAppliedPreset] = useState<StudioPreset>(initialPreset)
  const [prompt, setPrompt] = useState(() => searchParams.get('preset') ? initialPreset.prompt : defaultPrompt)
  const [hasApplied, setHasApplied] = useState(false)
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [aspect, setAspect] = useState<'landscape' | 'portrait'>('landscape')
  const session = useRef<TransformationSession | null>(null)
  const sessionGeneration = useRef(0)
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null)
  const [isDecartOutput, setIsDecartOutput] = useState(false)
  const [connectionState, setConnectionState] = useState<StudioConnectionState>('idle')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [savedDirections, setSavedDirections] = useState<SavedDirection[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryReady, setLibraryReady] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [savingDirection, setSavingDirection] = useState(false)
  const noticeTimeout = useRef<number | undefined>(undefined)
  const preferencesHydratedForUser = useRef<string | null>(null)
  const previousUserId = useRef<string | null>(user?.id ?? null)
  const camera = useCameraInput()

  const notify = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimeout.current)
    noticeTimeout.current = window.setTimeout(() => setNotice(''), 2800)
  }

  useEffect(() => () => {
    window.clearTimeout(noticeTimeout.current)
    sessionGeneration.current += 1
    session.current?.disconnect()
    session.current = null
  }, [])

  const resetConnection = () => {
    sessionGeneration.current += 1
    session.current?.disconnect()
    session.current = null
    setConnectionState('idle')
    setConnectionError(null)
    setConnectionMessage('')
    setIsDecartOutput(false)
  }

  useEffect(() => {
    if (!user) {
      preferencesHydratedForUser.current = null
      setSavedDirections([])
      setLibraryReady(false)
      setLibraryLoading(false)
      setLibraryError(null)
      return
    }

    let active = true
    setSavedDirections([])
    setLibraryReady(false)
    setLibraryLoading(true)
    setLibraryError(null)
    void loadStudioLibrary(user).then(({ preferences, directions }) => {
      if (!active) return
      setSavedDirections(directions)
      if (preferencesHydratedForUser.current !== user.id) {
        if (preferences) {
          setPrompt(preferences.prompt)
          setAspect(preferences.aspect)
          setSelectedPreset(findPreset(preferences.preset_id))
        }
        preferencesHydratedForUser.current = user.id
      }
      setLibraryReady(true)
    }).catch(() => {
      if (active) setLibraryError('Saved directions are unavailable. Apply the Supabase studio data migration and try again.')
    }).finally(() => {
      if (active) setLibraryLoading(false)
    })

    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    const currentUserId = user?.id ?? null
    if (previousUserId.current && previousUserId.current !== currentUserId && session.current) {
      resetConnection()
      camera.stopCamera()
      setOutputStream(null)
      setHasApplied(false)
    }
    previousUserId.current = currentUserId
  }, [user?.id])

  useEffect(() => {
    if (!user || !libraryReady || preferencesHydratedForUser.current !== user.id) return
    let active = true
    const timeout = window.setTimeout(() => {
      void saveStudioPreferences(user, { prompt, aspect, preset_id: selectedPreset.id }).catch(() => {
        if (active) setLibraryError('Studio preferences could not be saved. Check the Supabase connection and try again.')
      })
    }, 700)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [user?.id, libraryReady, prompt, aspect, selectedPreset.id])

  const handleSaveDirection = async () => {
    if (!user || !prompt.trim() || savingDirection) return
    setSavingDirection(true)
    try {
      const saved = await createSavedDirection(user, prompt, selectedPreset.id)
      setSavedDirections((current) => [saved, ...current].slice(0, 30))
      setLibraryError(null)
      notify('Direction saved to your account.')
    } catch {
      setLibraryError('This direction could not be saved. Check the Supabase connection and migration.')
    } finally {
      setSavingDirection(false)
    }
  }

  const handleLoadDirection = (direction: SavedDirection) => {
    setPrompt(direction.prompt)
    setSelectedPreset(findPreset(direction.preset_id))
    notify('Saved direction loaded.')
  }

  const handleDeleteDirection = async (id: string) => {
    if (!user || !window.confirm('Delete this saved direction?')) return
    try {
      await removeSavedDirection(user, id)
      setSavedDirections((current) => current.filter((direction) => direction.id !== id))
      setLibraryError(null)
      notify('Saved direction deleted.')
    } catch {
      setLibraryError('That direction could not be deleted. Please try again.')
    }
  }

  const openCamera = async (deviceId?: string) => {
    resetConnection()
    setOutputStream(null)
    setHasApplied(false)
    const source = await camera.startCamera(deviceId)
    if (!source) return
    setOutputStream(source)
    notify('Local preview is ready. Video stays in this browser until you start a Decart session.')
  }

  const closeCamera = () => {
    resetConnection()
    setOutputStream(null)
    setHasApplied(false)
    camera.stopCamera()
  }

  const activeDirection = (): TransformationDirection => ({ prompt, preset: selectedPreset, referenceImage })

  const handleApply = async () => {
    const direction = activeDirection()
    const aiActive = connectionState === 'connected' || connectionState === 'generating'

    if (aiActive && session.current) {
      const generation = sessionGeneration.current
      try {
        await session.current.update(direction)
        if (generation !== sessionGeneration.current) return
        setAppliedPreset(selectedPreset)
        setHasApplied(true)
        setConnectionError(null)
        notify('Live direction updated with Decart.')
      } catch {
        setConnectionError('Decart could not apply that direction. Check the session and try again.')
      }
      return
    }

    if (!camera.stream) return

    const generation = ++sessionGeneration.current
    let source: MediaStream | null = camera.stream
    session.current?.disconnect()
    session.current = null
    setOutputStream(source)
    setIsDecartOutput(false)
    setConnectionState('connecting')
    setConnectionError(null)
    setConnectionMessage('Loading the Decart realtime tools…')
    setAppliedPreset(selectedPreset)
    setHasApplied(true)

    try {
      const { decartCameraConstraints, decartTransformationAdapter } = await import('../features/studio/transformation/DecartTransformationAdapter')
      if (generation !== sessionGeneration.current) return
      source = await camera.startCamera(camera.selectedDeviceId, decartCameraConstraints, true)
      if (!source) {
        if (generation !== sessionGeneration.current) return
        setConnectionState('error')
        setConnectionError(camera.message || 'The camera could not be prepared for the Decart model. Try starting it again.')
        setConnectionMessage('')
        setOutputStream(camera.stream)
        setHasApplied(false)
        return
      }
      const liveSource = source
      setOutputStream(liveSource)
      setConnectionMessage('Opening a secure realtime connection to Decart…')

      const nextSession = await decartTransformationAdapter.connect(liveSource, direction, {
        onOutputStream: (stream) => {
          if (generation !== sessionGeneration.current) return
          setOutputStream(stream)
          setIsDecartOutput(true)
          setConnectionState((current) => current === 'connecting' ? current : 'connected')
          setConnectionMessage('Live Decart output is ready.')
        },
        onConnectionChange: (state) => {
          if (generation !== sessionGeneration.current) return
          setConnectionState((current) => (state === 'connected' || state === 'generating') && current === 'connecting' ? current : state)
          setConnectionMessage(connectionStatusMessage(state))
          if (state === 'disconnected') {
            setIsDecartOutput(false)
            setOutputStream(liveSource)
            setConnectionError('The Decart connection ended. Start another live session when ready.')
          }
        },
        onCapacityWait: (retryAfterMs) => {
          if (generation !== sessionGeneration.current) return
          setConnectionMessage(`Decart is busy. Retrying in ${Math.max(1, Math.ceil(retryAfterMs / 1000))} seconds…`)
        },
        onSessionEnded: (reason) => {
          if (generation !== sessionGeneration.current) return
          session.current = null
          setConnectionState('error')
          setConnectionError(sessionEndMessage(reason))
          setConnectionMessage('')
          setIsDecartOutput(false)
          setOutputStream(liveSource)
        },
      })

      if (generation !== sessionGeneration.current) {
        nextSession.disconnect()
        return
      }
      session.current = nextSession
      setConnectionState('connected')
      setConnectionMessage('Live Decart session is active.')
      setConnectionError(null)
      notify('Connected to Decart. Live output is active.')
    } catch (error) {
      if (generation !== sessionGeneration.current) return
      setConnectionState('error')
      setConnectionError(error instanceof Error ? error.message : 'Decart could not start this live session. Try again.')
      setConnectionMessage('')
      setOutputStream(source || camera.stream)
      setIsDecartOutput(false)
    }
  }

  const handlePreviewDemo = () => {
    resetConnection()
    setOutputStream(camera.stream)
    setAppliedPreset(selectedPreset)
    setHasApplied(true)
    notify('Local demo preview applied. No video or reference image was sent to Decart.')
  }

  const handleReset = () => {
    const basePreset = studioPresets[0]
    const direction: TransformationDirection = { prompt: defaultPrompt, preset: basePreset, referenceImage: null }
    const aiActive = connectionState === 'connected' || connectionState === 'generating'
    setPrompt(defaultPrompt)
    setSelectedPreset(basePreset)
    setAppliedPreset(basePreset)
    setHasApplied(aiActive)
    setReferenceImage(null)

    if (aiActive && session.current) {
      void session.current.update(direction).then(() => notify('Live direction reset.')).catch(() => {
        setConnectionError('Decart could not reset the live direction. Try applying it again.')
      })
    } else {
      setConnectionError(null)
      notify('Direction reset.')
    }
  }

  const studioStatus = isDecartOutput
    ? 'AI OUTPUT LIVE'
    : connectionState === 'connecting'
      ? 'CONNECTING TO DECART'
      : connectionState === 'reconnecting'
        ? 'RECONNECTING'
        : camera.status === 'requesting'
          ? 'OPENING CAMERA'
          : outputStream
            ? 'LOCAL DEMO OUTPUT'
            : camera.status === 'live'
              ? 'CAMERA READY'
              : 'WAITING FOR OUTPUT'

  return (
    <div className="studio-page">
      <header className="studio-header">
        <BrandMark />
        <div className="studio-header-center"><span className="studio-header-overline">KINETELLE / WORKSPACE</span><span className="studio-header-title">Live Studio <span>02</span></span></div>
        <div className="studio-header-right">
          <span className="phase-badge"><span /> PHASE 3 · ACCOUNT WORKSPACE</span>
          <Link className="studio-account-link" to="/account?next=%2Fstudio"><UserRound size={14} aria-hidden="true" /><span>{user ? 'Account' : 'Sign in'}</span></Link>
          <Link className="studio-back-link" to="/"><ArrowLeft size={14} aria-hidden="true" /><span>Exit Studio</span></Link>
        </div>
      </header>

      <main className="studio-main">
        <div className="studio-intro-row">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" /> LIVE IMAGE / 02</p>
            <h1>Shape the <em>moment.</em></h1>
          </div>
          <p className="studio-intro-copy">Bring a live frame into view, then start a Decart session when you are ready to send camera and microphone input for transformation.</p>
        </div>

        <div className="studio-layout">
          <div className="studio-source-column">
            <CameraPanel
              status={camera.status}
              message={camera.message}
              stream={camera.stream}
              devices={camera.devices}
              selectedDeviceId={camera.selectedDeviceId}
              onStart={(deviceId) => void openCamera(deviceId)}
              onStop={closeCamera}
            />
            <section className="studio-note-card">
              <div className="studio-note-icon"><ShieldCheck size={16} aria-hidden="true" /></div>
              <p className="tool-eyebrow">A PRIVATE CANVAS</p>
              <p>The camera preview stays local until you start a live session. Decart then receives camera and microphone input with any selected reference image for realtime processing.</p>
              <Link to="/#approach" className="studio-help-link">How it works <CircleHelp size={13} aria-hidden="true" /></Link>
            </section>
          </div>

          <PreviewStage
            outputStream={outputStream}
            status={studioStatus}
            preset={appliedPreset}
            applied={hasApplied}
            isDecartOutput={isDecartOutput}
            aspect={aspect}
            onAspectChange={setAspect}
          />

          <DirectionPanel
            prompt={prompt}
            selectedPreset={selectedPreset}
            cameraReady={camera.status === 'live' && Boolean(camera.stream)}
            authenticated={Boolean(user)}
            authLoading={authLoading}
            authConfigured={authConfigured}
            connectionState={connectionState}
            connectionError={connectionError}
            connectionMessage={connectionMessage}
            referenceImage={referenceImage}
            savedDirections={savedDirections}
            savedDirectionsLoading={libraryLoading}
            savedDirectionsError={libraryError}
            savingDirection={savingDirection}
            onPromptChange={setPrompt}
            onPresetChange={(preset) => { setSelectedPreset(preset); setPrompt(preset.prompt) }}
            onApply={handleApply}
            onPreviewDemo={handlePreviewDemo}
            onReferenceChange={setReferenceImage}
            onSaveDirection={() => void handleSaveDirection()}
            onLoadDirection={handleLoadDirection}
            onDeleteDirection={(id) => void handleDeleteDirection(id)}
            onReset={handleReset}
            onNotice={notify}
          />
        </div>

        <footer className="studio-footer">
          <div className="studio-footer-status"><Radio size={14} aria-hidden="true" /><span>{isDecartOutput ? 'DECART SESSION ACTIVE' : camera.status === 'live' ? 'LOCAL CAMERA ONLY' : 'NO LIVE SOURCE'}</span></div>
          <p>Camera and microphone processing starts only after you choose Start live transformation.</p>
          <span className="studio-footer-mark">KINETELLE STUDIO · 2026</span>
        </footer>
      </main>

      {notice && <div className="toast-message" role="status" aria-live="polite">{notice}</div>}
    </div>
  )
}
