import { useEffect, useState, type FormEvent } from 'react'
import {
  loadPaymentPacks,
  savePaymentPack,
  type PaymentPack,
  money,
} from '../../lib/adminDashboard'
const blank = (): PaymentPack => ({
  id: crypto.randomUUID(),
  name: '',
  provider: 'bachs',
  provider_product_id: '',
  currency: '',
  display_amount: 0,
  credit_minutes: 0,
  enabled: false,
})
export default function AutomaticPaymentSetup() {
  const [packs, setPacks] = useState<PaymentPack[]>([]),
    [draft, setDraft] = useState<PaymentPack>(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void loadPaymentPacks()
      .then((data) => {
        if (active) setPacks(data)
      })
      .catch(() => {
        if (active)
          setError(
            'Automatic payment drafts could not load. Check the dashboard migration.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await savePaymentPack({
        ...draft,
        currency: draft.currency.trim().toUpperCase(),
      })
      setPacks(await loadPaymentPacks())
      setDraft(blank())
      setNotice(
        'Payment product draft saved. Checkout stays inactive until the server integration is connected.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Product could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="admin-card admin-auto-setup">
      <div className="admin-card-heading">
        <div>
          <p className="tool-eyebrow">AUTOMATIC PAYMENTS</p>
          <h2>Automatic checkout · Bachs</h2>
          <p>
            Use saved member-pack quotes for hosted checkout. Keep provider keys
            and webhook secrets on the server.
          </p>
        </div>
        <span className="admin-payment-status is-pending">
          Integration required
        </span>
      </div>
      <p className="admin-setup-alert">
        Automatic checkout and verified webhooks are not connected yet. You can
        save product drafts now; automatic mode becomes available after that
        integration is completed.
      </p>
      <p className="admin-field-help">
        The planned flow is: choose a pack, open Bachs hosted checkout, then add
        time only after a verified payment webhook. A return to the website
        alone will not grant time. Provider product drafts below are optional
        for a catalog-based integration.
      </p>
      <details className="admin-pricing-costs">
        <summary>Optional Bachs product drafts</summary>
        <div className="admin-pack-list">
          {packs.map((pack) => (
            <button
              key={pack.id}
              className="admin-payment-choice"
              onClick={() => {
                setDraft(pack)
                setNotice('')
              }}
            >
              <span>
                <strong>{pack.name}</strong>
                <small>
                  {money(pack.display_amount, pack.currency)} ·{' '}
                  {pack.credit_minutes} minutes ·{' '}
                  {pack.enabled ? 'Included in draft catalog' : 'Archived'}
                </small>
              </span>
              <span>Edit</span>
            </button>
          ))}
        </div>
        <form
          className="admin-editor-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="admin-field-grid">
            <label className="admin-field-label">
              Product name
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="admin-field-label">
              Bachs product ID
              <input
                required
                maxLength={200}
                value={draft.provider_product_id}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    provider_product_id: event.target.value,
                  })
                }
              />
            </label>
            <label className="admin-field-label">
              Currency
              <input
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                value={draft.currency}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="admin-field-label">
              Display price
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={draft.display_amount || ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    display_amount: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="admin-field-label">
              Live minutes granted
              <input
                required
                type="number"
                min="1"
                max="525600"
                step="1"
                value={draft.credit_minutes || ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    credit_minutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="admin-check-label">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft({ ...draft, enabled: event.target.checked })
                }
              />
              Include in draft catalog
            </label>
          </div>
          <p className="admin-field-help">
            Display prices must match the provider’s product price. These drafts
            do not create products or charge customers.
          </p>
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
          <div className="admin-review-actions">
            <button className="button button-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save product draft'}
            </button>
            <button
              className="button button-outline"
              type="button"
              onClick={() => setDraft(blank())}
            >
              New product
            </button>
          </div>
        </form>
      </details>
    </section>
  )
}
