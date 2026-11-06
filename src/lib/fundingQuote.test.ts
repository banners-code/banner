import { describe, it, expect } from 'vitest'
import { convertedAmount, manualPackAmount } from './fundingQuote'
import type { FundingSettings } from './manualFunding'
import type { TimePack } from './pricing'
const settings = {
  currency: 'NGN',
  exchange_base_currency: 'USD',
  exchange_rate: 1380,
} as FundingSettings
const pack = { currency: 'USD', amount: 10 } as TimePack
describe('Manual payment conversion', () => {
  it('converts the agreed packs at 1380 NGN per USD', () => {
    expect(
      [10, 20, 40].map((amount) =>
        manualPackAmount({ ...pack, amount }, settings),
      ),
    ).toEqual([13800, 27600, 55200])
  })
  it('uses exact positive decimal rounding and rejects unsupported values', () => {
    expect(convertedAmount(0.29, 0.5)).toBe(0.15)
    expect(convertedAmount(10, 1380.123456)).toBe(13801.23)
    expect(convertedAmount(0, 1380)).toBeNull()
    expect(convertedAmount(10, 0)).toBeNull()
    expect(convertedAmount(Infinity, 1)).toBeNull()
    expect(convertedAmount(9999999999, 1380)).toBeNull()
  })
  it('does not apply FX to same-currency payment and requires a matching base', () => {
    expect(manualPackAmount({ ...pack, currency: 'NGN' }, settings)).toBe(10)
    expect(manualPackAmount({ ...pack, currency: 'EUR' }, settings)).toBeNull()
    expect(
      manualPackAmount(pack, { ...settings, exchange_rate: null }),
    ).toBeNull()
  })
})
