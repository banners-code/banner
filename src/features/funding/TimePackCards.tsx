import { useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import type { TimePack } from '../../lib/pricing'
import type { FundingSettings } from '../../lib/manualFunding'
import { money } from '../../lib/adminDashboard'
import { manualPackAmount } from '../../lib/fundingQuote'

function PackCard({
  pack,
  onSelect,
  disabled,
  settings,
  minimumAmount,
}: {
  pack: TimePack
  onSelect: (pack: TimePack) => void
  disabled: boolean
  settings?: FundingSettings | null
  minimumAmount: number
}) {
  const [method, setMethod] = useState('')
  const payable = settings
    ? manualPackAmount(pack, settings)
    : Number(pack.amount)
  const minimum = Number(settings?.minimum_amount ?? minimumAmount)
  const unavailable =
    payable === null || payable < minimum || (!!settings && !settings.enabled)
  return (
    <article className="member-time-pack">
      <span className="time-pack-validity">
        VALID FOR {pack.validity_days} DAYS
      </span>
      <h3>{pack.name}</h3>
      <p className="time-pack-price">{money(pack.amount, pack.currency)}</p>
      <strong className="time-pack-minutes">
        {Number(pack.credit_seconds) / 60} minutes
      </strong>
      <p className="time-pack-note">
        Live transformation time · expires {pack.validity_days} days after
        approval
      </p>
      <label>
        Payment method
        <select
          aria-label={`Payment method for ${pack.name}`}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">Choose payment method</option>
          <option value="manual" disabled={unavailable}>
            Manual payment
          </option>
          <option value="bachs" disabled>
            Automatic payment · unavailable
          </option>
        </select>
      </label>
      {method === 'manual' && payable !== null && (
        <p className="time-pack-payable">
          Amount to pay{' '}
          <strong>{money(payable, settings?.currency || pack.currency)}</strong>
          {settings?.currency !== pack.currency && settings?.exchange_rate && (
            <small>
              1 {pack.currency} ={' '}
              {Number(settings.exchange_rate).toLocaleString()}{' '}
              {settings.currency}
            </small>
          )}
        </p>
      )}
      <button
        className="button button-primary"
        type="button"
        disabled={disabled || unavailable || method !== 'manual'}
        onClick={() => onSelect(pack)}
      >
        Continue to Payment <ArrowRight size={14} aria-hidden="true" />
        <span className="sr-only"> for {pack.name}</span>
      </button>
      {unavailable && (
        <small>
          {payable !== null && payable < minimum
            ? 'Below the current minimum payment.'
            : 'Manual payment is unavailable for this pack.'}
        </small>
      )}
    </article>
  )
}
export default function TimePackCards({
  packs,
  onSelect,
  disabled = false,
  minimumAmount = 0,
  settings,
}: {
  packs: TimePack[]
  onSelect: (pack: TimePack) => void
  disabled?: boolean
  minimumAmount?: number
  settings?: FundingSettings | null
}) {
  return (
    <>
      <div className="member-time-packs">
        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            onSelect={onSelect}
            disabled={disabled}
            minimumAmount={minimumAmount}
            settings={settings}
          />
        ))}
      </div>
      <p className="time-pack-checkout-note">
        <ShieldCheck size={14} aria-hidden="true" />
        Manual payments are reviewed by our team. Automatic checkout is
        currently unavailable.
      </p>
    </>
  )
}
