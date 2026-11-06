import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

const mediaDescriptor =
  typeof HTMLMediaElement === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get() {
      return (
        (this as HTMLMediaElement & { testStream?: MediaStream | null })
          .testStream ?? null
      )
    },
    set(value: MediaStream | null) {
      ;(
        this as HTMLMediaElement & { testStream?: MediaStream | null }
      ).testStream = value
    },
  })

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:kinetelle-test'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
}

afterEach(() => {
  if (typeof document !== 'undefined') cleanup()
  vi.restoreAllMocks()
  if (mediaDescriptor)
    Object.defineProperty(
      HTMLMediaElement.prototype,
      'srcObject',
      mediaDescriptor,
    )
})
