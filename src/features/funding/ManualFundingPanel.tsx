import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  CheckCircle2,
  Trash2,
  Coins,
  FileImage,
  LoaderCircle,
  Send,
} from 'lucide-react'
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
import {
  createPriceQuote,
  loadPricing,
  loadTimePacks,
  loadOpenPriceQuote,
  type Pricing,
  type TimePack,
  type PriceQuote,
} from '../../lib/pricing'
import { money, duration } from '../../lib/adminDashboard'
import TimePackCards from './TimePackCards'
import PaymentInstructions from './PaymentInstructions'
import { Link } from 'react-router-dom'

function formatFundingDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
function message(cause: unknown, fallback: string) {
  return (cause as { message?: string })?.message || fallback
}

export default function ManualFundingPanel({
  user,
  inDialog = false,
}: {
  user: User
  inDialog?: boolean
}) {
  const [settings, setSettings] = useState<FundingSettings | null>(null)
  const [requests, setRequests] = useState<ManualFundingRequest[]>([])
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const [packs, setPacks] = useState<TimePack[]>([])
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now())
  const [resumeQuote, setResumeQuote] = useState<PriceQuote | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [proofPreview, setProofPreview] = useState('')
  useEffect(() => {
    if (!proof || !proof.type.startsWith('image/')) {
      setProofPreview('')
      return
    }
    const url = URL.createObjectURL(proof)
    setProofPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [proof])

  useEffect(() => {
    let active = true
    setLoading(true)
    setRequests([])
    setQuote(null)
    setResumeQuote(null)
    setProof(null)
    setSubmitted(false)
    void Promise.all([
      loadFundingSettings(),
      loadOwnFundingRequests(user.id),
      loadPricing(),
      loadTimePacks(),
      loadOpenPriceQuote(),
    ])
      .then(([s, r, p, rows, openQuote]) => {
        if (!active) return
        setResumeQuote(openQuote)
        setSettings(s)
        setRequests(r)
        setPricing(p?.enabled ? p : null)
        setPacks(
          rows.filter((row) => row.enabled && row.currency === p?.currency),
        )
      })
      .catch((cause) => {
        if (active)
          setError(message(cause, 'Funding information could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user.id])

  useEffect(() => {
    let active = true
    const refresh = () => {
      void loadOwnFundingRequests(user.id)
        .then((next) => {
          if (active) setRequests(next)
        })
        .catch(() => undefined)
    }
    const channel = subscribeToFundingRequests(refresh)
    const poll = window.setInterval(refresh, 30000)
    return () => {
      active = false
      window.clearInterval(poll)
      void removeFundingSubscription(channel)
    }
  }, [user.id])
  useEffect(() => {
    if (!quote && !resumeQuote) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [quote, resumeQuote])
  const quoteExpired = !!quote && new Date(quote.expires_at).getTime() <= now
  const canPay =
    !!settings?.enabled &&
    !!settings.currency &&
    !!(quote?.payment_details ?? settings).bank_name &&
    !!(quote?.payment_details ?? settings).account_name &&
    !!(quote?.payment_details ?? settings).account_number

  async function choosePack(pack: TimePack) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await createPriceQuote(Number(pack.amount), pack.id)
      setSubmitted(false)
      setResumeQuote(next)
      setQuote(next)
      setNow(Date.now())
    } catch (cause) {
      setError(
        message(
          cause,
          'This pack could not be reserved. Refresh and try again.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !canPay ||
      !settings ||
      !proof ||
      quoteExpired ||
      !quote ||
      !quote.payment_details?.bank_name ||
      !quote.payment_details?.account_name ||
      !quote.payment_details?.account_number
    )
      return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const request = await createManualFundingRequest({
        user,
        amount: Number(quote.amount),
        currency: quote.currency,
        paymentReference: `KT-${quote.id.toUpperCase()}`,
        userNote: '',
        proof,
        quoteId: quote.id,
      })
      setProof(null)
      setQuote(null)
      setResumeQuote(null)
      setSubmitted(true)
      const input = document.getElementById(
        'funding-proof-file',
      ) as HTMLInputElement | null
      if (input) input.value = ''
      if (request)
        setRequests((previous) => [
          request,
          ...previous.filter((item) => item.id !== request.id),
        ])
      setNotice(
        'Payment submitted for review. Your live time and its validity period begin after an admin approves the receipt.',
      )
      void loadOwnFundingRequests(user.id)
        .then(setRequests)
        .catch(() => undefined)
    } catch (cause) {
      setError(message(cause, 'Your payment request could not be submitted.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="dashboard-funding-panel dashboard-manual-funding"
      id="dashboard-funding-panel"
      aria-label="Account funding"
    >
      {!inDialog && (
        <div className="dashboard-funding-icon">
          <Coins size={18} aria-hidden="true" />
        </div>
      )}
      <div className="manual-funding-content">
        {!inDialog && (
          <>
            <p className="dashboard-panel-eyebrow">YOUR NEXT LIVE SESSION</p>
            <h2>Buy AI time.</h2>
          </>
        )}
        <ol className="funding-progress" aria-label="Purchase steps">
          {['Choose time', 'Make payment', 'Review'].map((step, index) => (
            <li
              key={step}
              aria-current={
                (submitted ? 2 : quote || !pricing ? 1 : 0) === index
                  ? 'step'
                  : undefined
              }
            >
              <span>0{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        {submitted && (
          <div className="funding-submitted">
            <CheckCircle2 size={30} aria-hidden="true" />
            <h3>Receipt received.</h3>
            <p>
              Your payment is pending review. The status below updates after
              verification. Your purchased time starts on approval.
            </p>
            <button
              className="button button-outline"
              type="button"
              onClick={() => {
                setSubmitted(false)
                setNotice('')
              }}
            >
              Choose another pack
            </button>
            <Link to="/support">Need help? Contact support</Link>
          </div>
        )}
        {loading ? (
          <p className="manual-funding-loading" role="status">
            <LoaderCircle size={14} className="spin-icon" /> Loading payment
            details…
          </p>
        ) : (
          <>
            {!canPay && (
              <div className="manual-funding-unavailable">
                <AlertCircle size={15} />
                <span>
                  Bank payment details are not configured yet. Contact support
                  if you need help.
                </span>
              </div>
            )}
            {resumeQuote &&
              !quote &&
              !submitted &&
              new Date(resumeQuote.expires_at).getTime() > now && (
                <div className="funding-resume">
                  <div>
                    <strong>Continue your saved payment</strong>
                    <span>
                      {resumeQuote.pack_name} ·{' '}
                      {money(resumeQuote.amount, resumeQuote.currency)} · quote
                      valid until {formatFundingDate(resumeQuote.expires_at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      setQuote(resumeQuote)
                      setNow(Date.now())
                    }}
                  >
                    Resume payment
                  </button>
                </div>
              )}
            {!pricing && !quote && !submitted && (
              <p className="manual-funding-unavailable">
                Time packs are not yet available. Contact support for help.
              </p>
            )}
            {pricing && !quote && !submitted && (
              <>
                <p className="time-pack-intro">
                  Choose your live time. Validity starts when your payment is
                  approved.
                </p>
                <TimePackCards
                  packs={packs}
                  settings={settings}
                  onSelect={(pack) => void choosePack(pack)}
                  disabled={busy || !canPay}
                  minimumAmount={Number(settings?.minimum_amount || 0)}
                />
                {!packs.length && (
                  <p className="manual-funding-unavailable">
                    No time packs are currently listed. Contact support for
                    help.
                  </p>
                )}
              </>
            )}
            {canPay && quote && !submitted && (
              <>
                {quote && (
                  <div
                    className="funding-quote"
                    aria-label="Your payment quote"
                  >
                    <button
                      type="button"
                      className="funding-change-pack"
                      disabled={busy}
                      onClick={() => {
                        setQuote(null)
                        setProof(null)
                        setError('')
                      }}
                    >
                      <ArrowLeft size={13} /> Change pack
                    </button>
                    <h3>
                      {quote.pack_name || 'Live time'} ·{' '}
                      {money(quote.amount, quote.currency)}
                    </h3>
                    <p>
                      {duration(quote.credit_seconds)} of live time · valid for{' '}
                      {quote.validity_days} days from payment approval.
                    </p>
                    <small>
                      Submit the receipt by{' '}
                      {formatFundingDate(quote.expires_at)} to lock in this
                      quote. No recurring subscription.
                    </small>
                    {quoteExpired && (
                      <p className="account-error" role="alert">
                        This quote has expired. If you already paid, contact
                        support with your receipt. Otherwise, choose a pack
                        again before paying.
                      </p>
                    )}
                  </div>
                )}
                {settings && (
                  <PaymentInstructions settings={settings} quote={quote} />
                )}
                <form
                  className="manual-funding-form"
                  onSubmit={(event) => void submit(event)}
                >
                  <label className="manual-funding-proof-label">
                    <span>Payment receipt</span>
                    <span className="manual-funding-file-button">
                      <FileImage size={14} />
                      {proof ? proof.name : 'Choose image or PDF'}
                      <input
                        id="funding-proof-file"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => {
                          const next = event.target.files?.[0] ?? null
                          setError('')
                          if (
                            next &&
                            (![
                              'image/jpeg',
                              'image/png',
                              'image/webp',
                              'application/pdf',
                            ].includes(next.type) ||
                              next.size > 10 * 1024 * 1024)
                          ) {
                            setProof(null)
                            event.target.value = ''
                            setError(
                              'Choose a JPG, PNG, WebP or PDF receipt, up to 10 MB.',
                            )
                            return
                          }
                          setProof(next)
                        }}
                        required
                      />
                    </span>
                  </label>
                  {proof && (
                    <div className="funding-receipt-preview">
                      {proofPreview && (
                        <img
                          src={proofPreview}
                          alt="Selected payment receipt"
                        />
                      )}
                      <div>
                        <strong>{proof.name}</strong>
                        <span>
                          {(proof.size / 1024).toFixed(0)} KB · not submitted
                          yet
                        </span>
                        <button
                          className="funding-copy-button"
                          type="button"
                          onClick={() => {
                            setProof(null)
                            const input = document.getElementById(
                              'funding-proof-file',
                            ) as HTMLInputElement | null
                            if (input) input.value = ''
                          }}
                        >
                          <Trash2 size={13} /> Remove receipt
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="manual-funding-footnote">
                    JPG, PNG, WebP or PDF · maximum 10 MB. Upload only after
                    completing your transfer.
                  </p>
                  <button
                    className="button button-primary manual-funding-submit"
                    type="submit"
                    disabled={
                      busy ||
                      !proof ||
                      quoteExpired ||
                      !quote.payment_details?.bank_name ||
                      !quote.payment_details?.account_name ||
                      !quote.payment_details?.account_number
                    }
                  >
                    <Send size={14} />
                    {busy ? 'Submitting…' : 'Submit payment for review'}
                  </button>
                  <p className="manual-funding-footnote">
                    <Clock3 size={13} /> Your live time is added after an admin
                    verifies the payment.
                  </p>
                </form>
              </>
            )}
          </>
        )}
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
        {requests.length > 0 && (
          <div className="manual-funding-history">
            <h3>Payment request history</h3>
            {requests.slice(0, 5).map((request) => (
              <article className="manual-funding-history-row" key={request.id}>
                <div>
                  <strong>
                    {money(request.amount, request.currency)}
                    {request.quoted_pack_name
                      ? ` · ${request.quoted_pack_name}`
                      : ''}
                  </strong>
                  <span>
                    {formatFundingDate(request.created_at)} · Ref{' '}
                    {request.payment_reference}
                  </span>
                  {request.status === 'approved' &&
                    request.credits_expire_at && (
                      <small>
                        Purchased time expiry:{' '}
                        {formatFundingDate(request.credits_expire_at)}
                      </small>
                    )}
                  {request.status === 'pending' &&
                    request.quoted_validity_days && (
                      <small>
                        Valid for {request.quoted_validity_days} days from
                        approval
                      </small>
                    )}
                  {request.admin_note && <small>{request.admin_note}</small>}
                </div>
                <span className={`admin-payment-status is-${request.status}`}>
                  {request.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
      {!inDialog && (
        <span className="manual-funding-close-spacer" aria-hidden="true" />
      )}
    </section>
  )
}
