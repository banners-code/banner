import { useEffect, useState, type FormEvent } from 'react'
import { Save, Plus, ArrowUpRight } from 'lucide-react'
import {
  loadPricing,
  loadCostEstimate,
  loadTimePacks,
  savePricing,
  saveTimePack,
  costPreview,
  type Pricing,
  type CostEstimate,
  type TimePack,
} from '../../lib/pricing'
import { money, duration } from '../../lib/adminDashboard'
import TimePackCards from '../funding/TimePackCards'
import type { FundingSettings } from '../../lib/manualFunding'

export default function PricingSettings({
  fundingSettings,
}: {
  fundingSettings?: FundingSettings | null
}) {
  const [pricing, setPricing] = useState<Pricing | null>(null),
    [cost, setCost] = useState<CostEstimate | null>(null),
    [packs, setPacks] = useState<TimePack[]>([])
  const [savedRate, setSavedRate] = useState<{
    currency: string
    price_per_minute: number
  } | null>(null)
  const [pack, setPack] = useState<TimePack | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([loadPricing(), loadCostEstimate(), loadTimePacks()])
      .then(([p, c, rows]) => {
        if (active) {
          setPricing(p)
          setSavedRate(p)
          setCost(c)
          setPacks(rows)
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Pricing could not load. Check the customer-pricing migration and refresh.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!pricing || !cost) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await savePricing(pricing, cost)
      setSavedRate(pricing)
      setPacks(await loadTimePacks())
      setPack(null)
      setNotice(
        pricing.enabled
          ? 'Customer pricing published. Existing balances and quotes are unchanged.'
          : 'Pricing saved as unpublished. Existing balances and quotes are unchanged.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : (cause as { message?: string })?.message ||
              'Pricing could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function savePack(event: FormEvent) {
    event.preventDefault()
    if (!pack) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await saveTimePack(pack)
      setPacks(await loadTimePacks())
      setPack(null)
      setNotice(
        'Time pack saved. Submitted payment quotes keep their original allocation.',
      )
    } catch (cause) {
      setError(
        (cause as { message?: string })?.message ||
          'Time pack could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (!pricing || !cost)
    return (
      <section className="admin-card">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading pricing…'}</p>
      </section>
    )
  const preview = costPreview(pricing, cost)
  const packAmount = pack?.use_standard_rate
    ? Math.round(
        ((Number(savedRate?.price_per_minute) * pack.credit_seconds) / 60) *
          100,
      ) / 100
    : (pack?.amount ?? 0)
  const packCurrency = pack?.use_standard_rate
    ? savedRate?.currency || pricing.currency
    : (pack?.currency ?? pricing.currency)
  return (
    <div className="admin-pricing-workspace">
      <section className="admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="tool-eyebrow">CUSTOMER PRICING</p>
            <h2>Your price. Your margin.</h2>
            <p>
              Set what members pay for live time. Existing purchased minutes
              stay intact.
            </p>
          </div>
          <span
            className={`admin-payment-status ${pricing.enabled ? 'is-approved' : 'is-pending'}`}
          >
            {pricing.enabled ? 'Publish on save' : 'Unpublished'}
          </span>
        </div>
        <div className="admin-pricing-metrics">
          <div>
            <span>Your price / minute</span>
            <strong>{money(preview.revenue, pricing.currency)}</strong>
          </div>
          <div>
            <span>Estimated provider cost / minute</span>
            <strong>{money(preview.provider, pricing.currency)}</strong>
          </div>
          <div className={preview.difference < 0 ? 'is-negative' : ''}>
            <span>Estimated difference / minute</span>
            <strong>{money(preview.difference, pricing.currency)}</strong>
          </div>
        </div>
        {fundingSettings?.enabled &&
          fundingSettings.currency !== pricing.currency && (
            <p className="admin-setup-alert">
              Manual payments currently accept {fundingSettings.currency}. These{' '}
              {pricing.currency} prices use the manual exchange rate in Payment
              Settings below. Current rate:{' '}
              {fundingSettings.exchange_base_currency === pricing.currency &&
              fundingSettings.exchange_rate
                ? `1 ${pricing.currency} = ${fundingSettings.exchange_rate} ${fundingSettings.currency}`
                : 'not configured'}
              . Each payment quote locks its amount and rate.
            </p>
          )}
        <form
          className="admin-editor-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="admin-field-grid">
            <label className="admin-field-label">
              Billing currency
              <input
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                value={pricing.currency}
                onChange={(e) =>
                  setPricing({
                    ...pricing,
                    currency: e.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="admin-field-label">
              Your price per minute
              <input
                required
                type="number"
                min="0.0001"
                max="100000000"
                step="0.0001"
                value={pricing.price_per_minute}
                onChange={(e) =>
                  setPricing({
                    ...pricing,
                    price_per_minute: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="admin-field-label">
            Default validity for custom amounts (days)
            <input
              required
              type="number"
              min="1"
              max="3650"
              step="1"
              value={pricing.default_validity_days}
              onChange={(e) =>
                setPricing({
                  ...pricing,
                  default_validity_days: Number(e.target.value),
                })
              }
            />
          </label>
          <p className="admin-field-help">
            Listed time packs use their own validity periods below.
          </p>
          <label className="admin-check-label">
            <input
              type="checkbox"
              checked={pricing.enabled}
              onChange={(e) =>
                setPricing({ ...pricing, enabled: e.target.checked })
              }
            />
            Publish customer pricing when saved
          </label>
          <p className="admin-field-help">
            For different listing and payment currencies, configure a manual
            exchange rate below. Pricing does not switch on payments or
            automatic checkout. Packs following the standard rate update on
            save; saved customer quotes keep their original price and validity.
          </p>
          <details className="admin-pricing-costs">
            <summary>Provider cost, exchange rate and other costs</summary>
            <div className="admin-field-grid">
              <label className="admin-field-label">
                Provider cost (USD per second)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.000001"
                  value={cost.provider_usd_per_second}
                  onChange={(e) =>
                    setCost({
                      ...cost,
                      provider_usd_per_second: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="admin-field-label">
                Billing currency units per US dollar
                <input
                  required
                  disabled={pricing.currency === 'USD'}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={
                    pricing.currency === 'USD' ? 1 : cost.currency_units_per_usd
                  }
                  onChange={(e) =>
                    setCost({
                      ...cost,
                      currency_units_per_usd: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="admin-field-label">
                Estimated payment fee (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="99.999"
                  step="0.001"
                  value={cost.payment_fee_percent}
                  onChange={(e) =>
                    setCost({
                      ...cost,
                      payment_fee_percent: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="admin-field-label">
                Other cost per minute ({pricing.currency})
                <input
                  required
                  type="number"
                  min="0"
                  step="0.0001"
                  value={cost.other_cost_per_minute}
                  onChange={(e) =>
                    setCost({
                      ...cost,
                      other_cost_per_minute: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          </details>
          <p className="admin-field-help">
            Estimate assumes 60 seconds of active generation per minute. It is
            not net profit or a provider invoice; include your hosting, fees and
            taxes as appropriate. Costs and exchange rates are entered manually
            and visible only to admins.{' '}
            <a
              href="https://docs.platform.decart.ai/getting-started/pricing"
              target="_blank"
              rel="noreferrer"
            >
              Decart pricing <ArrowUpRight size={12} />
            </a>{' '}
            · Standard Lucy 2.6 checked 6 Nov 2026.
          </p>
          {preview.difference < 0 && (
            <p className="account-error" role="status">
              This selling rate is below the costs entered above.
            </p>
          )}
          <button className="button button-primary" disabled={busy}>
            <Save size={15} />
            {busy ? 'Saving…' : 'Save pricing'}
          </button>
        </form>
      </section>
      <section className="admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="tool-eyebrow">TIME PACKS</p>
            <h2>5, 10 and 20 minutes.</h2>
            <p>
              Pack prices can differ from the standard rate. Changes affect new
              quotes only.
            </p>
          </div>
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              setPack({
                id: crypto.randomUUID(),
                name: '',
                currency: pricing.currency,
                amount: 0,
                credit_seconds: 300,
                enabled: false,
                sort_order: packs.length + 1,
                validity_days: 14,
                use_standard_rate: true,
              })
            }
          >
            <Plus size={15} />
            New pack
          </button>
        </div>
        <details className="admin-pricing-costs admin-member-preview">
          <summary>Preview member pack cards</summary>
          <p className="admin-field-help">
            Saved pack prices. Checkout is disabled in this preview.
          </p>
          <TimePackCards
            packs={packs.filter((p) => p.enabled)}
            settings={fundingSettings}
            disabled
            onSelect={() => undefined}
          />
        </details>
        <div className="admin-pricing-packs">
          {packs.map((p) => (
            <button
              className="admin-payment-choice"
              type="button"
              key={p.id}
              onClick={() => setPack(p)}
            >
              <span>
                <strong>{p.name}</strong>
                <small>
                  {money(p.amount, p.currency)} · {duration(p.credit_seconds)} ·
                  Valid {p.validity_days} days ·{' '}
                  {p.use_standard_rate ? 'Standard rate' : 'Custom price'} ·{' '}
                  {p.enabled
                    ? 'Listed when pricing is published'
                    : 'Unpublished'}
                </small>
              </span>
              <span>Edit</span>
            </button>
          ))}
        </div>
        {pack && (
          <form
            className="admin-editor-form admin-pack-editor"
            onSubmit={(event) => void savePack(event)}
          >
            <div className="admin-field-grid">
              <label className="admin-field-label">
                Pack name
                <input
                  required
                  maxLength={80}
                  value={pack.name}
                  onChange={(e) => setPack({ ...pack, name: e.target.value })}
                />
              </label>
              <label className="admin-field-label">
                Pack currency
                <input
                  disabled={pack.use_standard_rate}
                  required
                  pattern="[A-Za-z]{3}"
                  maxLength={3}
                  value={packCurrency}
                  onChange={(e) =>
                    setPack({ ...pack, currency: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label className="admin-field-label">
                Pack price
                <input
                  disabled={pack.use_standard_rate}
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={packAmount || ''}
                  onChange={(e) =>
                    setPack({ ...pack, amount: Number(e.target.value) })
                  }
                />
              </label>
              <label className="admin-field-label">
                Pack minutes
                <input
                  required
                  type="number"
                  min="1"
                  max="525600"
                  step="1"
                  value={pack.credit_seconds / 60}
                  onChange={(e) =>
                    setPack({
                      ...pack,
                      credit_seconds: Number(e.target.value) * 60,
                    })
                  }
                />
              </label>
              <label className="admin-field-label">
                Validity after approval (days)
                <input
                  required
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  value={pack.validity_days}
                  onChange={(e) =>
                    setPack({ ...pack, validity_days: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="admin-check-label">
              <input
                type="checkbox"
                checked={pack.use_standard_rate}
                onChange={(e) =>
                  setPack({
                    ...pack,
                    use_standard_rate: e.target.checked,
                    amount: packAmount,
                    currency: packCurrency,
                  })
                }
              />
              Follow the saved standard price per minute
            </label>
            <label className="admin-check-label">
              <input
                type="checkbox"
                checked={pack.enabled}
                onChange={(e) =>
                  setPack({ ...pack, enabled: e.target.checked })
                }
              />
              Include this pack when pricing is published
            </label>
            <p className="admin-field-help">
              Effective price:{' '}
              {money(
                packAmount / (pack.credit_seconds / 60) || 0,
                packCurrency,
              )}{' '}
              per minute. Validity starts when an admin approves payment. Unused
              purchased time expires; time used first comes from the pack
              expiring soonest. Save the standard rate before editing packs that
              follow it.
            </p>
            <div className="admin-review-actions">
              <button className="button button-primary" disabled={busy}>
                Save time pack
              </button>
              <button
                className="button button-outline"
                type="button"
                onClick={() => setPack(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-success" role="status">
          {notice}
        </p>
      )}
    </div>
  )
}
