import { describe, it, expect } from 'vitest'
import {
  estimatedSeconds,
  costPreview,
  type Pricing,
  type CostEstimate,
} from './pricing'
const p: Pricing = {
  id: 1,
  currency: 'USD',
  price_per_minute: 2,
  enabled: false,
  default_validity_days: 14,
  updated_at: '',
}
const c: CostEstimate = {
  id: 1,
  provider_usd_per_second: 0.02,
  currency_units_per_usd: 1,
  payment_fee_percent: 0,
  other_cost_per_minute: 0,
}
describe('Pricing math', () => {
  it('converts decimal amounts without floating-point under-allocation', () => {
    expect(estimatedSeconds('0.29', '0.58')).toBe(30)
    expect(estimatedSeconds('10', '2')).toBe(300)
    expect(estimatedSeconds('20', '2')).toBe(600)
    expect(estimatedSeconds('40', '2')).toBe(1200)
  })
  it('rounds fractional seconds down and rejects invalid or oversized amounts', () => {
    expect(estimatedSeconds('1', '7')).toBe(8)
    for (const [amount, rate] of [
      ['1', '0'],
      ['-1', '2'],
      ['1.001', '2'],
      ['NaN', '2'],
      ['100000000000', '0.0001'],
    ])
      expect(estimatedSeconds(amount, rate)).toBe(0)
  })
  it('shows costs, currency conversion, fees and negative differences separately', () => {
    expect(costPreview(p, c).difference).toBeCloseTo(0.8)
    expect(
      costPreview({ ...p, price_per_minute: 1 }, c).difference,
    ).toBeCloseTo(-0.2)
    const preview = costPreview(
      { ...p, currency: 'NGN', price_per_minute: 3000 },
      {
        ...c,
        currency_units_per_usd: 1500,
        payment_fee_percent: 2,
        other_cost_per_minute: 100,
      },
    )
    expect(preview.provider).toBe(1800)
    expect(preview.fees).toBe(60)
    expect(preview.difference).toBe(1040)
  })
})
