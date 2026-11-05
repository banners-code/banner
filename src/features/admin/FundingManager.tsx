import { Check, ExternalLink, LoaderCircle, RefreshCw, Save, ShieldAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createFundingProofUrl,
  loadAllFundingRequests,
  reviewManualFundingRequest,
  saveFundingSettings,
  type FundingSettings,
  type ManualFundingRequest,
} from '../../lib/manualFunding'

function paidAmount(request: ManualFundingRequest) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: request.currency }).format(Number(request.amount))
  } catch {
    return `${request.amount} ${request.currency}`
  }
}

function requestDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function FundingManager({
  initialSettings,
  initialRequests,
  onSettingsSaved,
  onRequestsChanged,
}: {
  initialSettings: FundingSettings
  initialRequests: ManualFundingRequest[]
  onSettingsSaved: (settings: FundingSettings) => void
  onRequestsChanged: (requests: ManualFundingRequest[]) => void
}) {
  const [settings, setSettings] = useState(initialSettings)
  const [requests, setRequests] = useState(initialRequests)
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? '')
  const [proofUrl, setProofUrl] = useState('')
  const [proofError, setProofError] = useState('')
  const [grantMinutes, setGrantMinutes] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => setSettings(initialSettings), [initialSettings])
  useEffect(() => {
    setRequests(initialRequests)
    setSelectedId((current) => current && initialRequests.some((request) => request.id === current) ? current : initialRequests[0]?.id ?? '')
  }, [initialRequests])

  const selectedRequest = useMemo(() => requests.find((request) => request.id === selectedId) ?? null, [requests, selectedId])

  useEffect(() => {
    setProofUrl('')
    setProofError('')
    setAdminNote('')
    setGrantMinutes('')
    if (!selectedRequest) return
    let active = true
    void createFundingProofUrl(selectedRequest.proof_object_path).then((url) => { if (active) setProofUrl(url) }).catch((cause) => {
      if (active) setProofError(cause instanceof Error ? cause.message : 'Receipt preview could not be opened.')
    })
    return () => { active = false }
  }, [selectedRequest?.id, selectedRequest?.proof_object_path])

  async function refreshRequests() {
    const next = await loadAllFundingRequests()
    setRequests(next)
    onRequestsChanged(next)
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const normalizedCurrency = settings.currency.trim().toUpperCase()
    if (settings.enabled && (!/^[A-Z]{3}$/.test(normalizedCurrency) || !settings.payment_instructions.trim())) {
      setError('Enter a three-letter currency and payment instructions before enabling funding.')
      setBusy(false)
      return
    }
    try {
      const saved = await saveFundingSettings({
        enabled: settings.enabled,
        currency: normalizedCurrency,
        payment_instructions: settings.payment_instructions.trim(),
        reference_instructions: settings.reference_instructions.trim(),
        minimum_amount: Number(settings.minimum_amount) || 0,
      })
      setSettings(saved)
      onSettingsSaved(saved)
      setNotice(saved.enabled ? 'Manual funding instructions are live on member dashboards.' : 'Manual funding has been paused.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Funding instructions could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function review(status: 'approved' | 'rejected') {
    if (!selectedRequest || selectedRequest.status !== 'pending') return
    const note = adminNote.trim()
    if (status === 'rejected' && !note) {
      setError('Add a short explanation before rejecting the request.')
      return
    }
    let seconds: number | undefined
    if (status === 'approved') {
      const minutes = Number(grantMinutes)
      if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > Math.floor(Number.MAX_SAFE_INTEGER / 60)) {
        setError('Enter the verified amount of live time to add, in whole minutes.')
        return
      }
      seconds = minutes * 60
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await reviewManualFundingRequest({ requestId: selectedRequest.id, status, adminNote: note, creditSeconds: seconds })
      await refreshRequests()
      setNotice(status === 'approved' ? `${grantMinutes} minutes of live time were added to ${selectedRequest.owner_email}.` : `Payment request from ${selectedRequest.owner_email} was declined.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The funding request could not be reviewed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-funding-grid">
      <section className="admin-card admin-funding-settings-card">
        <div className="admin-card-heading"><div><p className="tool-eyebrow">MEMBER DASHBOARD</p><h2>Manual payment details</h2><p>Set the instructions customers see before they upload a receipt. There is no automatic payment verification or credit conversion.</p></div></div>
        <form className="admin-editor-form admin-compact-form" onSubmit={(event) => void saveSettings(event)}>
          <label className="support-chat-toggle admin-funding-enabled"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>Accept manual funding requests</span></label>
          <div className="admin-field-grid">
            <label className="admin-field-label">Currency code <input value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value.toUpperCase() })} maxLength={3} placeholder="NGN, USD, GHS…" /></label>
            <label className="admin-field-label">Minimum payment amount <input type="number" min="0" step="0.01" value={settings.minimum_amount || ''} onChange={(event) => setSettings({ ...settings, minimum_amount: Number(event.target.value) || 0 })} placeholder="No minimum" /></label>
            <label className="admin-field-label admin-field-wide">Payment instructions <textarea rows={6} maxLength={2500} value={settings.payment_instructions} onChange={(event) => setSettings({ ...settings, payment_instructions: event.target.value })} placeholder="Add the payment method and details customers should use. These instructions appear to signed-in members." /></label>
            <label className="admin-field-label admin-field-wide">Payment reference instructions <textarea rows={2} maxLength={500} value={settings.reference_instructions} onChange={(event) => setSettings({ ...settings, reference_instructions: event.target.value })} placeholder="Tell customers where to find the reference on their receipt." /></label>
          </div>
          {error && <p className="account-error" role="alert">{error}</p>}
          {notice && <p className="account-success" role="status">{notice}</p>}
          <button className="button button-primary admin-save-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}{busy ? 'Saving…' : 'Save payment settings'}</button>
        </form>
      </section>

      <section className="admin-card admin-funding-queue-card">
        <div className="admin-card-heading admin-queue-heading">
          <div><p className="tool-eyebrow">MANUAL REVIEW</p><h2>Payment requests</h2><p>Verify the payment yourself before approving. Approved requests grant the live time you enter below.</p></div>
          <button className="icon-button" type="button" onClick={() => void refreshRequests().catch((cause) => setError(cause instanceof Error ? cause.message : 'Payment requests could not be refreshed.'))} aria-label="Refresh payment requests"><RefreshCw size={15} aria-hidden="true" /></button>
        </div>
        <div className="admin-payment-queue">
          <div className="admin-payment-list" aria-label="Payment request list">
            {requests.length === 0 ? <p className="admin-payment-empty">No payment requests yet.</p> : requests.map((request) => (
              <button className={`admin-payment-choice${request.id === selectedId ? ' is-selected' : ''}`} type="button" key={request.id} onClick={() => { setSelectedId(request.id); setError(''); setNotice('') }}>
                <span><strong>{request.owner_email}</strong><small>{paidAmount(request)} · {request.payment_reference}</small></span>
                <span className={`admin-payment-status is-${request.status}`}>{request.status}</span>
              </button>
            ))}
          </div>
          <div className="admin-payment-detail">
            {!selectedRequest ? <p className="admin-payment-empty">Select a request to review its receipt and details.</p> : <>
              <div className="admin-payment-detail-heading"><div><p className="tool-eyebrow">{selectedRequest.status.toUpperCase()} REQUEST</p><h3>{paidAmount(selectedRequest)}</h3><p>{selectedRequest.owner_email} · Submitted {requestDate(selectedRequest.created_at)}</p></div><span className={`admin-payment-status is-${selectedRequest.status}`}>{selectedRequest.status}</span></div>
              <dl className="admin-payment-meta"><div><dt>Payment reference</dt><dd>{selectedRequest.payment_reference}</dd></div><div><dt>Member</dt><dd>{selectedRequest.owner_email}</dd></div></dl>
              {selectedRequest.user_note && <p className="admin-payment-note"><strong>Member note</strong>{selectedRequest.user_note}</p>}
              {proofError ? <p className="account-error" role="status">{proofError}</p> : proofUrl ? <a className="admin-proof-link" href={proofUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Open private receipt</a> : <p className="admin-field-help">Loading secure receipt preview…</p>}
              {selectedRequest.status !== 'pending' && <div className="admin-reviewed-result"><strong>{selectedRequest.status === 'approved' ? `${Math.floor((selectedRequest.credits_granted_seconds ?? 0) / 60)} minutes granted` : 'Request rejected'}</strong>{selectedRequest.admin_note && <span>{selectedRequest.admin_note}</span>}</div>}
              {selectedRequest.status === 'pending' && <div className="admin-review-form">
                <label className="admin-field-label">Verified live time to grant (minutes)<input type="number" min="1" step="1" value={grantMinutes} onChange={(event) => setGrantMinutes(event.target.value)} placeholder="Enter after verifying payment" /></label>
                <label className="admin-field-label">Message to member{selectedRequest.status === 'pending' && <span className="admin-optional"> (required to reject)</span>}<textarea rows={3} maxLength={1000} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Optional approval note or reason for rejection" /></label>
                <div className="admin-review-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void review('approved')}><Check size={15} aria-hidden="true" />{busy ? 'Saving…' : 'Approve and grant'}</button><button className="button button-outline admin-reject-button" type="button" disabled={busy} onClick={() => void review('rejected')}><X size={15} aria-hidden="true" />Reject</button></div>
              </div>}
            </>}
          </div>
        </div>
        <p className="admin-funding-security"><ShieldAlert size={14} aria-hidden="true" /> Receipt files are private. Only the submitting member and designated admins can access them.</p>
      </section>
    </div>
  )
}
