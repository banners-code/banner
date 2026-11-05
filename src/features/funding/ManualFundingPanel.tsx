import { AlertCircle, Clock3, Coins, FileImage, LoaderCircle, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  createManualFundingRequest,
  loadFundingSettings,
  loadOwnFundingRequests,
  removeFundingSubscription,
  subscribeToFundingRequests,
  type FundingSettings,
  type ManualFundingRequest,
} from '../../lib/manualFunding'

function formatAmount(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount)) } catch { return `${amount} ${currency}` }
}

function formatFundingDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export default function ManualFundingPanel({ user }: { user: User }) {
  const [settings, setSettings] = useState<FundingSettings | null>(null)
  const [requests, setRequests] = useState<ManualFundingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([loadFundingSettings(), loadOwnFundingRequests()]).then(([nextSettings, nextRequests]) => {
      if (!active) return
      setSettings(nextSettings)
      setRequests(nextRequests)
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Funding information could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    let active = true
    const channel = subscribeToFundingRequests(() => {
      void loadOwnFundingRequests().then((next) => { if (active) setRequests(next) }).catch(() => undefined)
    })
    return () => { active = false; void removeFundingSubscription(channel) }
  }, [user.id])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings?.enabled || !proof) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createManualFundingRequest({
        user,
        amount: Number(amount),
        currency: settings.currency,
        paymentReference: reference,
        userNote: note,
        proof,
      })
      setAmount('')
      setReference('')
      setNote('')
      setProof(null)
      const input = document.getElementById('funding-proof-file') as HTMLInputElement | null
      if (input) input.value = ''
      setRequests(await loadOwnFundingRequests())
      setNotice('Payment submitted for review. Your live time will update after an admin verifies the receipt.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your payment request could not be submitted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dashboard-funding-panel dashboard-manual-funding" id="dashboard-funding-panel" aria-label="Account funding">
      <div className="dashboard-funding-icon"><Coins size={18} aria-hidden="true" /></div>
      <div className="manual-funding-content">
        <p className="dashboard-panel-eyebrow">MANUAL ACCOUNT FUNDING</p>
        <h2>Submit a payment for review.</h2>
        {loading ? <p className="manual-funding-loading"><LoaderCircle size={14} className="spin-icon" aria-hidden="true" /> Loading payment details…</p>
          : !settings?.enabled || !settings.currency || !settings.payment_instructions ? <div className="manual-funding-unavailable"><AlertCircle size={15} aria-hidden="true" /><span>Manual payment instructions are not configured yet. Contact support if you need help.</span></div>
            : <>
                <div className="manual-payment-instructions"><strong>How to pay · {settings.currency}</strong><p>{settings.payment_instructions}</p>{settings.reference_instructions && <small>{settings.reference_instructions}</small>}</div>
                <form className="manual-funding-form" onSubmit={(event) => void submit(event)}>
                  <label>Amount paid ({settings.currency})<input type="number" inputMode="decimal" min={settings.minimum_amount || '0.01'} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter amount" required /></label>
                  <label>Payment reference<input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank or transfer reference" required /></label>
                  <label className="manual-funding-proof-label"><span>Payment receipt</span><span className="manual-funding-file-button"><FileImage size={14} aria-hidden="true" />{proof ? proof.name : 'Choose image or PDF'}<input id="funding-proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} required /></span></label>
                  <label className="manual-funding-note">Note <span>(optional)</span><textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything that helps us match your payment" /></label>
                  {error && <p className="account-error" role="alert">{error}</p>}
                  {notice && <p className="account-success" role="status">{notice}</p>}
                  <button className="button button-primary manual-funding-submit" type="submit" disabled={busy || !proof}><Send size={14} aria-hidden="true" />{busy ? 'Submitting…' : 'Submit payment for review'}</button>
                  <p className="manual-funding-footnote"><Clock3 size={13} aria-hidden="true" /> Your account is credited with live time after the receipt is manually verified.</p>
                </form>
              </>}
        {error && !settings?.enabled && <p className="account-error" role="alert">{error}</p>}
        {requests.length > 0 && <div className="manual-funding-history"><h3>Payment request history</h3>{requests.slice(0, 5).map((request) => <article className="manual-funding-history-row" key={request.id}>
          <div><strong>{formatAmount(Number(request.amount), request.currency)}</strong><span>{formatFundingDate(request.created_at)} · Ref {request.payment_reference}</span>{request.admin_note && <small>{request.admin_note}</small>}</div>
          <span className={`admin-payment-status is-${request.status}`}>{request.status}</span>
        </article>)}</div>}
      </div>
      <span className="manual-funding-close-spacer" aria-hidden="true" />
    </section>
  )
}
