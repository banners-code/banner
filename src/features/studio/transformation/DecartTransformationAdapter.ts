import { createDecartClient, models } from '@decartai/sdk'
import { getCurrentAccessToken } from '../../../lib/supabase'
import type { TransformationAdapter, TransformationDirection, TransformationEvents } from './TransformationAdapter'

async function requestClientToken() {
  const accessToken = await getCurrentAccessToken()
  if (!accessToken) throw new Error('Sign in to start a live Decart session.')
  const response = await fetch('/api/realtime-token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + accessToken,
    },
  })
  const result = await response.json().catch(() => null) as { apiKey?: unknown; error?: string } | null

  if (!response.ok) {
    if (response.status === 401) throw new Error(result?.error || 'Your account session expired. Sign in again to continue.')
    if (response.status === 503) throw new Error(result?.error || 'Live sessions are not configured on this server.')
    if (response.status === 403) throw new Error(result?.error || 'This site origin or account is not allowed to start a Decart session.')
    if (response.status === 429) throw new Error('Too many session requests. Wait a moment and try again.')
    throw new Error(result?.error || 'A secure Decart session token could not be created.')
  }

  if (typeof result?.apiKey !== 'string' || result.apiKey.length === 0) {
    throw new Error('The session token response was incomplete. Check the server configuration.')
  }
  return result.apiKey
}

const client = createDecartClient({
  apiKeyProvider: requestClientToken,
  telemetry: false,
})

export const decartRealtimeModel = models.realtime('lucy-2.6')
export const decartCameraConstraints: Pick<MediaTrackConstraints, 'frameRate' | 'width' | 'height'> = {
  frameRate: decartRealtimeModel.fps,
  width: decartRealtimeModel.width,
  height: decartRealtimeModel.height,
}

export const decartTransformationAdapter: TransformationAdapter = {
  async connect(source: MediaStream, direction: TransformationDirection, events: TransformationEvents) {
    const realtime = await client.realtime.connect(source, {
      model: decartRealtimeModel,
      mirror: 'auto',
      capacityRetryBudgetMs: 30_000,
      initialState: {
        prompt: { text: direction.prompt, enhance: true },
        ...(direction.referenceImage ? { image: direction.referenceImage } : {}),
      },
      onRemoteStream: events.onOutputStream,
      onConnectionChange: events.onConnectionChange,
      onCapacityWait: ({ retryAfterMs }) => events.onCapacityWait?.(retryAfterMs),
    })

    realtime.on('sessionEnded', ({ reason }) => events.onSessionEnded?.(reason))

    return {
      update: (nextDirection) => realtime.set({
        prompt: nextDirection.prompt,
        image: nextDirection.referenceImage,
        enhance: true,
      }),
      disconnect: () => realtime.disconnect(),
    }
  },
}
