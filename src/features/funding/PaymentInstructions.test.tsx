import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect } from 'vitest'
import PaymentInstructions from './PaymentInstructions'
import type { FundingSettings } from '../../lib/manualFunding'
import type { PriceQuote } from '../../lib/pricing'
it('uses the quote bank snapshot and copies its account number after settings change', async () => {
  const user = userEvent.setup()
  const settings = {
    currency: 'NGN',
    bank_name: 'New bank',
    account_number: '999',
    payment_instructions: 'New instructions',
  } as FundingSettings
  const quote = {
    id: 'quoted',
    amount: 13800,
    currency: 'NGN',
    listed_currency: 'USD',
    listed_amount: 10,
    payment_exchange_rate: 1380,
    payment_details: {
      bank_name: 'Saved bank',
      account_name: 'Saved account',
      account_number: '1234567890',
      payment_instructions: 'Saved transfer instructions',
    },
  } as PriceQuote
  render(<PaymentInstructions settings={settings} quote={quote} />)
  expect(screen.getByText('Saved bank')).toBeInTheDocument()
  expect(screen.queryByText('New bank')).not.toBeInTheDocument()
  expect(screen.getByText(/13,800/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Copy account number' }))
  expect(await navigator.clipboard.readText()).toBe('1234567890')
  expect(screen.getByRole('status')).toHaveTextContent('Copied Account number')
})
