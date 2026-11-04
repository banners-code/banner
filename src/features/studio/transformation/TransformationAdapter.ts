import type { StudioPreset } from '../../../data/presets'

/** App-owned request shape. It is deliberately independent of Decart SDK method names. */
export type TransformationDirection = {
  prompt: string
  preset: StudioPreset
  referenceImage: File | null
}

export type TransformationConnectionState = 'connecting' | 'connected' | 'generating' | 'reconnecting' | 'disconnected'

export type TransformationEvents = {
  onOutputStream: (stream: MediaStream) => void
  onConnectionChange: (state: TransformationConnectionState) => void
  onCapacityWait?: (retryAfterMs: number) => void
  onSessionEnded?: (reason: string) => void
}

/** App-owned boundary for the realtime provider. UI code stays independent of SDK calls. */
export type TransformationSession = {
  update(direction: TransformationDirection): Promise<void>
  disconnect(): void
}

export interface TransformationAdapter {
  connect(source: MediaStream, direction: TransformationDirection, events: TransformationEvents): Promise<TransformationSession>
}
