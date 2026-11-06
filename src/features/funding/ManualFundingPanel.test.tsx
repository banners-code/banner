import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, it, expect, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import ManualFundingPanel from './ManualFundingPanel'
import * as funding from '../../lib/manualFunding'
import * as pricing from '../../lib/pricing'
vi.mock('../../lib/manualFunding', () => ({
  loadFundingSettings: vi.fn(),
  loadOwnFundingRequests: vi.fn(),
  createManualFundingRequest: vi.fn(),
  subscribeToFundingRequests: vi.fn(),
  removeFundingSubscription: vi.fn(),
}))
vi.mock('../../lib/pricing', () => ({
  loadPricing: vi.fn(),
  loadTimePacks: vi.fn(),
  loadOpenPriceQuote: vi.fn(),
  createPriceQuote: vi.fn(),
}))
const member = { id: 'member', email: 'member@example.com' } as User
const details = {
  bank_name: 'Test bank',
  account_name: 'Test name',
  account_number: '12345',
  payment_instructions: 'private instructions',
}
const quote = {
  id: 'quote',
  currency: 'USD',
  amount: 10,
  credit_seconds: 300,
  price_per_minute: 2,
  pack_name: '5 minutes',
  validity_days: 3,
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  payment_details: details,
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(funding.loadFundingSettings).mockResolvedValue({
    id: 1,
    enabled: true,
    payment_mode: 'manual',
    currency: 'USD',
    minimum_amount: 0,
    reference_instructions: '',
    updated_at: '',
    ...details,
  })
  vi.mocked(funding.loadOwnFundingRequests).mockResolvedValue([])
  vi.mocked(pricing.loadPricing).mockResolvedValue({
    id: 1,
    currency: 'USD',
    price_per_minute: 2,
    default_validity_days: 14,
    enabled: true,
    updated_at: '',
  })
  vi.mocked(pricing.loadTimePacks).mockResolvedValue([
    {
      id: '5',
      name: '5 minutes',
      currency: 'USD',
      amount: 10,
      credit_seconds: 300,
      validity_days: 3,
      enabled: true,
      use_standard_rate: true,
      sort_order: 1,
    },
  ])
  vi.mocked(pricing.loadOpenPriceQuote).mockResolvedValue(null)
  vi.mocked(pricing.createPriceQuote).mockResolvedValue(quote)
})
async function openPayment() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ManualFundingPanel user={member} />
    </MemoryRouter>,
  )
  await user.selectOptions(
    await screen.findByLabelText('Payment method for 5 minutes'),
    'manual',
  )
  await user.click(
    screen.getByRole('button', { name: 'Continue to Payment for 5 minutes' }),
  )
  return user
}
it('submits receipt with the saved quote and generated memo, without extra fields', async () => {
  const user = await openPayment()
  await screen.findByText('Test bank')
  expect(screen.getByText('Test name')).toBeInTheDocument()
  expect(screen.getByText('12345')).toBeInTheDocument()
  expect(screen.getByText('KT-QUOTE')).toBeInTheDocument()
  expect(screen.queryByText(/How to pay/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Amount paid/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Payment reference/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/Note/)).not.toBeInTheDocument()
  const proof = new File(['receipt'], 'receipt.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText(/Payment receipt/), proof)
  fireEvent.submit(
    screen
      .getByRole('button', { name: 'Submit payment for review' })
      .closest('form')!,
  )
  await waitFor(() =>
    expect(funding.createManualFundingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: 'quote',
        amount: 10,
        paymentReference: 'KT-QUOTE',
        userNote: '',
        proof,
      }),
    ),
  )
})
it('blocks receipt submission when the quoted bank details are incomplete', async () => {
  vi.mocked(pricing.createPriceQuote).mockResolvedValue({
    ...quote,
    payment_details: { ...details, account_name: '' },
  })
  await openPayment()
  expect(
    await screen.findByText(/Bank payment details are not configured/),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Submit payment for review' }),
  ).not.toBeInTheDocument()
})
it('does not request an arbitrary amount when packs are unpublished', async () => {
  vi.mocked(pricing.loadPricing).mockResolvedValue(null)
  render(
    <MemoryRouter>
      <ManualFundingPanel user={member} />
    </MemoryRouter>,
  )
  expect(
    await screen.findByText(/Time packs are not yet available/),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText(/Amount paid/)).not.toBeInTheDocument()
})
