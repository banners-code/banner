import { createDecartClient, models } from '@decartai/sdk'
import type {
  TransformationAdapter,
  TransformationDirection,
  TransformationEvents,
} from './TransformationAdapter'

export const decartRealtimeModel = models.realtime('lucy-2.6')
export const decartCameraConstraints: Pick<
  MediaTrackConstraints,
  'frameRate' | 'width' | 'height'
> = {
  frameRate: decartRealtimeModel.fps,
  width: decartRealtimeModel.width,
  height: decartRealtimeModel.height,
}

export const decartTransformationAdapter: TransformationAdapter = {
  async connect(
    source: MediaStream,
    direction: TransformationDirection,
    events: TransformationEvents,
    authorization,
  ) {
    const client = createDecartClient({
      apiKeyProvider: () => authorization.requestToken(),
      realtimeBaseUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/realtime`,
      telemetry: false,
    })
    const realtime = await client.realtime.connect(source, {
      model: decartRealtimeModel,
      mirror: 'auto',
      capacityRetryBudgetMs: 30_000,
      initialState: {
        prompt: { text: direction.prompt, enhance: true },
        ...(direction.referenceImage
          ? { image: direction.referenceImage }
          : {}),
      },
      onRemoteStream: events.onOutputStream,
      onConnectionChange: events.onConnectionChange,
      onCapacityWait: ({ retryAfterMs }) =>
        events.onCapacityWait?.(retryAfterMs),
    })

    realtime.on('sessionEnded', ({ reason }) => events.onSessionEnded?.(reason))

    return {
      update: (nextDirection) =>
        realtime.set({
          prompt: nextDirection.prompt,
          image: nextDirection.referenceImage,
          enhance: true,
        }),
      disconnect: () => realtime.disconnect(),
    }
  },
}
