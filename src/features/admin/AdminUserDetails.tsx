import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  adjustUserTime,
  duration,
  getAdminUserDetails,
  money,
  type UserDetail,
} from '../../lib/adminDashboard'

export default function AdminUserDetails({
  userId,
  onChanged,
}: {
  userId: string
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [action, setAction] = useState<'add' | 'remove'>('add'),
    [minutes, setMinutes] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'sessions' | 'deposits' | 'ledger'>('sessions')
  const request = useRef<{ key: string; fingerprint: string } | null>(null)
  useEffect(() => {
    let active = true
    void getAdminUserDetails(userId)
      .then((data) => {
        if (active) setDetail(data)
      })
      .catch(() => {
        if (active)
          setError(
            'User details could not load. Check the dashboard migration.',
          )
      })
    return () => {
      active = false
    }
  }, [userId])
  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const amount = Number(minutes) * (action === 'remove' ? -1 : 1)
    if (
      !Number.isSafeInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > 525600
    ) {
      setError('Enter whole minutes between 1 and 525600.')
      return
    }
    const fingerprint = JSON.stringify([userId, amount, reason.trim()])
    if (request.current?.fingerprint !== fingerprint)
      request.current = { key: crypto.randomUUID(), fingerprint }
    setBusy(true)
    try {
      await adjustUserTime(userId, amount, reason, request.current.key)
      request.current = null
      setMinutes('')
      setReason('')
      try {
        setDetail(await getAdminUserDetails(userId))
      } catch {
        setError(
          'The time adjustment was saved. Refresh the account details to see the new balance.',
        )
      }
      onChanged()
      setNotice(
        `${Math.abs(amount)} minutes ${amount > 0 ? 'added to' : 'removed from'} this account. The adjustment is recorded.`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Time could not be adjusted.',
      )
    } finally {
      setBusy(false)
    }
  }
  if (!detail)
    return (
      <p role={error ? 'alert' : 'status'}>
        {error || 'Loading account details…'}
      </p>
    )
  return (
    <div className="admin-user-detail">
      <div className="admin-user-time-cards">
        <div>
          <span>Live time available</span>
          <strong>
            {duration(
              Math.max(
                0,
                Number(detail.credited_seconds) - Number(detail.spent_seconds),
              ),
            )}
          </strong>
        </div>
        <div>
          <span>Total time spent</span>
          <strong>{duration(detail.spent_seconds)}</strong>
        </div>
        <div>
          <span>Total time granted</span>
          <strong>{duration(detail.credited_seconds)}</strong>
        </div>
      </div>
      <dl className="admin-payment-meta">
        <div>
          <dt>Registered</dt>
          <dd>{new Date(detail.created_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Last sign-in</dt>
          <dd>
            {detail.last_sign_in_at
              ? new Date(detail.last_sign_in_at).toLocaleString()
              : 'Never'}
          </dd>
        </div>
      </dl>
      <details className="admin-time-adjust">
        <summary>Add or adjust live time</summary>
        <form
          className="admin-editor-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="admin-field-grid">
            <label className="admin-field-label">
              Adjustment
              <select
                value={action}
                onChange={(event) =>
                  setAction(event.target.value as typeof action)
                }
              >
                <option value="add">Add time</option>
                <option value="remove">Remove available time</option>
              </select>
            </label>
            <label className="admin-field-label">
              Minutes
              <input
                type="number"
                min="1"
                max="525600"
                step="1"
                required
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
            <label className="admin-field-label admin-field-wide">
              Reason visible in the member’s time record
              <textarea
                minLength={5}
                maxLength={1000}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <p className="admin-field-help">
            This changes available live time. Recorded session history stays
            intact. Time cannot be reduced below the available balance.
          </p>
          <button className="button button-primary" disabled={busy}>
            {busy
              ? 'Saving…'
              : action === 'add'
                ? 'Add time to this account'
                : 'Remove available time'}
          </button>
        </form>
      </details>
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
      <nav className="admin-user-tabs" aria-label="User activity sections">
        {(['sessions', 'deposits', 'ledger'] as const).map((key) => (
          <button
            className={tab === key ? 'is-active' : ''}
            key={key}
            onClick={() => setTab(key)}
          >
            {key === 'sessions'
              ? 'Session history'
              : key === 'deposits'
                ? 'Deposits'
                : 'Time history'}
          </button>
        ))}
      </nav>
      <p className="admin-field-help">Most recent 25 entries per history.</p>
      {tab === 'sessions' ? (
        <div className="admin-user-history">
          {detail.sessions.length ? (
            detail.sessions.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>Live Studio session</strong>
                  <span>{new Date(row.started_at).toLocaleString()}</span>
                </div>
                <b>{duration(row.duration_seconds)}</b>
              </article>
            ))
          ) : (
            <p>No sessions recorded.</p>
          )}
        </div>
      ) : tab === 'deposits' ? (
        <div className="admin-user-history">
          {detail.deposits.length ? (
            detail.deposits.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{money(row.amount, row.currency)}</strong>
                  <span>
                    {new Date(row.created_at).toLocaleString()} ·{' '}
                    {row.payment_reference}
                  </span>
                  {row.admin_note && <span>{row.admin_note}</span>}
                </div>
                <span className={`admin-payment-status is-${row.status}`}>
                  {row.status}
                </span>
              </article>
            ))
          ) : (
            <p>No deposits recorded.</p>
          )}
        </div>
      ) : (
        <div className="admin-user-history">
          {detail.adjustments.map((row) => (
            <article key={row.id}>
              <div>
                <strong>Admin adjustment</strong>
                <span>{row.reason}</span>
                <span>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              <b>
                {Number(row.delta_seconds) > 0 ? '+' : '−'}
                {duration(Math.abs(Number(row.delta_seconds)))}
              </b>
            </article>
          ))}
          {detail.grants.map((row) => (
            <article key={row.id}>
              <div>
                <strong>
                  {row.source === 'admin'
                    ? 'Verified payment / admin grant'
                    : 'Payment grant'}
                </strong>
                <span>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              <b>+{duration(row.credit_seconds)}</b>
            </article>
          ))}
          {!detail.grants.length && !detail.adjustments.length && (
            <p>No time grants or adjustments recorded.</p>
          )}
        </div>
      )}
    </div>
  )
}
