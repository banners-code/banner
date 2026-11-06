import { useState } from 'react'
import { Check, Copy, Landmark } from 'lucide-react'
import type { FundingSettings } from '../../lib/manualFunding'
import type { PriceQuote } from '../../lib/pricing'
import { money } from '../../lib/adminDashboard'

export default function PaymentInstructions({
  settings,
  quote,
}: {
  settings: FundingSettings
  quote: PriceQuote | null
}) {
  const details = quote?.payment_details ?? settings
  const [copied, setCopied] = useState(''),
    [error, setError] = useState('')
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setError('')
    } catch {
      setError('Copy was unavailable. Select and copy the details manually.')
    }
  }
  const fields = [
    ['Bank name', details.bank_name],
    ['Account name', details.account_name],
    ['Account number', details.account_number],
  ]
  const memo = quote ? `KT-${quote.id.toUpperCase()}` : ''
  return (
    <section
      className="funding-bank-details"
      aria-label="Bank transfer details"
    >
      <div className="funding-review-notice">
        <Landmark size={18} aria-hidden="true" />
        <div>
          <strong>Manual payment verification</strong>
          <p>
            {details.review_notice ||
              'Our team reviews your receipt and adds live time after verifying the payment.'}
          </p>
        </div>
      </div>
      {quote && (
        <div className="funding-amount-to-pay">
          <span>AMOUNT TO TRANSFER</span>
          <strong>{money(quote.amount, quote.currency)}</strong>
          {quote.listed_currency &&
            quote.listed_currency !== quote.currency && (
              <small>
                {money(quote.listed_amount || 0, quote.listed_currency)} ×{' '}
                {Number(quote.payment_exchange_rate).toLocaleString()}{' '}
                {quote.currency}/{quote.listed_currency} · rate locked for this
                quote
              </small>
            )}
        </div>
      )}
      {fields.some(([, value]) => !!value) && (
        <dl className="funding-copy-fields">
          {fields
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span>{value}</span>
                  <button
                    type="button"
                    aria-label={`Copy ${label?.toLowerCase()}`}
                    onClick={() => void copy(label!, value!)}
                  >
                    {copied === label ? (
                      <Check size={15} />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </dd>
              </div>
            ))}
        </dl>
      )}
      {fields.some(([, value]) => !value) && (
        <p className="manual-funding-unavailable">
          Bank details are incomplete. Contact support before making a payment.
        </p>
      )}
      {memo && (
        <div className="funding-transfer-memo">
          <span>Transfer memo, if supported</span>
          <code>{memo}</code>
          <button
            type="button"
            className="funding-copy-button"
            onClick={() => void copy('transfer memo', memo)}
          >
            <Copy size={13} aria-hidden="true" /> Copy memo
          </button>
        </div>
      )}
      {copied && (
        <p className="funding-copy-feedback" role="status">
          Copied {copied}.
        </p>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
