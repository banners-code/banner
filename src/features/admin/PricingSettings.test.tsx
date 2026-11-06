import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import PricingSettings from './PricingSettings'
import * as pricing from '../../lib/pricing'
vi.mock('../../lib/pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof pricing>()),
  loadPricing: vi.fn(),
  loadCostEstimate: vi.fn(),
  loadTimePacks: vi.fn(),
  savePricing: vi.fn(),
  saveTimePack: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pricing.loadPricing).mockResolvedValue({
    id: 1,
    currency: 'USD',
    price_per_minute: 2,
    default_validity_days: 14,
    enabled: false,
    updated_at: '',
  })
  vi.mocked(pricing.loadCostEstimate).mockResolvedValue({
    id: 1,
    provider_usd_per_second: 0.02,
    currency_units_per_usd: 1,
    payment_fee_percent: 0,
    other_cost_per_minute: 0,
  })
  vi.mocked(pricing.loadTimePacks).mockResolvedValue([
    {
      id: '5',
      name: '5 minutes',
      currency: 'USD',
      amount: 10,
      credit_seconds: 300,
      validity_days: 3,
      use_standard_rate: true,
      enabled: true,
      sort_order: 1,
    },
  ])
})
describe('Admin pricing controls', () => {
  it('keeps publication explicit and saves the selling rate independently of provider cost', async () => {
    const user = userEvent.setup()
    render(<PricingSettings />)
    const rate = await screen.findByLabelText('Your price per minute')
    await user.clear(rate)
    await user.type(rate, '3')
    await user.click(screen.getByRole('button', { name: 'Save pricing' }))
    await waitFor(() =>
      expect(pricing.savePricing).toHaveBeenCalledWith(
        expect.objectContaining({
          price_per_minute: 3,
          enabled: false,
          default_validity_days: 14,
        }),
        expect.objectContaining({ provider_usd_per_second: 0.02 }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('unpublished')
  })
  it('allows an explicit custom pack price and approval-based validity', async () => {
    const user = userEvent.setup()
    render(<PricingSettings />)
    await user.click(
      await screen.findByRole('button', { name: /5 minutes.*Edit/ }),
    )
    expect(screen.getByLabelText('Pack price')).toBeDisabled()
    await user.click(
      screen.getByLabelText('Follow the saved standard price per minute'),
    )
    await user.clear(screen.getByLabelText('Pack price'))
    await user.type(screen.getByLabelText('Pack price'), '12')
    await user.clear(screen.getByLabelText('Validity after approval (days)'))
    await user.type(
      screen.getByLabelText('Validity after approval (days)'),
      '7',
    )
    await user.click(screen.getByRole('button', { name: 'Save time pack' }))
    await waitFor(() =>
      expect(pricing.saveTimePack).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12,
          validity_days: 7,
          credit_seconds: 300,
          use_standard_rate: false,
        }),
      ),
    )
  })
})
