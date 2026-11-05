import { useEffect, useState, type FormEvent } from 'react'
import {
  loadAuditEvents,
  loadReports,
  reviewReport,
  searchUsers,
  setAccountStatus,
  type AbuseReport,
  type AuditEvent,
  type ManagedUser,
} from '../../lib/moderation'
import AdminUserDetails from './AdminUserDetails'

export default function ModerationManager({
  section,
  initialQuery = '',
  onFindUser,
}: {
  section?: 'users' | 'reports' | 'audit'
  initialQuery?: string
  onFindUser?: (identity: string) => void
}) {
  const [panel, setPanel] = useState<'users' | 'reports' | 'audit'>(
    section || 'users',
  )
  const [query, setQuery] = useState(initialQuery)
  const [search, setSearch] = useState(initialQuery)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [reports, setReports] = useState<AbuseReport[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [selected, setSelected] = useState<ManagedUser | null>(null)
  const [status, setStatus] = useState<'active' | 'suspended' | 'banned'>(
    'suspended',
  )
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [reviewId, setReviewId] = useState('')
  const [reviewStatus, setReviewStatus] = useState('reviewing')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    setQuery(initialQuery)
    setSearch(initialQuery)
    setOffset(0)
  }, [initialQuery])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const request =
      panel === 'users'
        ? searchUsers(search, offset).then((data) => {
            if (active) {
              setUsers(data.users)
              setHasMore(data.has_more)
            }
          })
        : panel === 'reports'
          ? loadReports().then((data) => {
              if (active) setReports(data)
            })
          : loadAuditEvents().then((data) => {
              if (active) setAudit(data)
            })
    void request
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Moderation data could not be loaded. Check the Phase 9 migration.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [panel, search, offset, revision])

  async function moderate(event: FormEvent) {
    event.preventDefault()
    if (!selected || selected.is_admin) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await setAccountStatus(
        selected.id,
        status,
        reason,
        status === 'suspended' ? new Date(until).toISOString() : null,
      )
      setNotice(
        `Account ${selected.email} is now ${status}. The action was recorded.`,
      )
      setSelected(null)
      setReason('')
      setUntil('')
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Account status could not be updated.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function review(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await reviewReport(reviewId, reviewStatus, note)
      setReviewId('')
      setNote('')
      setNotice('Report review saved and recorded.')
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Report review could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-card moderation-manager">
      <div className="admin-card-heading">
        <div>
          <p className="tool-eyebrow">ACCOUNTS / TRUST</p>
          <h2>
            {panel === 'users'
              ? 'Registered accounts'
              : panel === 'reports'
                ? 'Review abuse reports'
                : 'Admin action history'}
          </h2>
          <p>
            {panel === 'users'
              ? 'Select a member to view their activity, deposits, live time, and account controls.'
              : 'Review evidence before restricting an account. Support stays available for appeals.'}
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh
        </button>
      </div>
      {!section && (
        <nav className="admin-console-nav" aria-label="Moderation sections">
          {(['users', 'reports', 'audit'] as const).map((item) => (
            <button
              key={item}
              className={panel === item ? 'is-active' : ''}
              onClick={() => {
                setPanel(item)
                setSelected(null)
                setReviewId('')
                setNotice('')
              }}
            >
              {item === 'users'
                ? 'Users'
                : item === 'reports'
                  ? 'Abuse reports'
                  : 'Action history'}
            </button>
          ))}
        </nav>
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
      {panel === 'users' && (
        <form
          className="moderation-search"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(query.trim())
            setOffset(0)
            setSelected(null)
            setRevision((value) => value + 1)
          }}
        >
          <label className="admin-field-label">
            Search by email or user ID
            <input
              value={query}
              maxLength={254}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="button button-outline" disabled={loading}>
            Search users
          </button>
        </form>
      )}
      {loading ? (
        <p role="status">Loading {panel}…</p>
      ) : panel === 'users' ? (
        <>
          <div className="moderation-user-list">
            {users.length ? (
              users.map((user) => (
                <button
                  key={user.id}
                  className={`admin-payment-choice${selected?.id === user.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSelected(user)
                    setReason('')
                    setUntil('')
                    setStatus(user.status === 'active' ? 'suspended' : 'active')
                  }}
                >
                  <span>
                    <strong>{user.email || user.id}</strong>
                    <small>
                      {user.is_admin ? 'Administrator' : 'Member'} · Joined{' '}
                      {new Date(user.created_at).toLocaleDateString()}
                    </small>
                  </span>
                  <span
                    className={`admin-payment-status is-${user.status === 'active' ? 'approved' : 'rejected'}`}
                  >
                    {user.status}
                  </span>
                </button>
              ))
            ) : (
              <p>No accounts match this search.</p>
            )}
          </div>
          <div className="moderation-pagination">
            <button
              className="button button-outline"
              disabled={offset === 0}
              onClick={() => {
                setOffset((value) => Math.max(0, value - 50))
                setSelected(null)
              }}
            >
              Previous
            </button>
            <span>Page {Math.floor(offset / 50) + 1}</span>
            <button
              className="button button-outline"
              disabled={!hasMore}
              onClick={() => {
                setOffset((value) => value + 50)
                setSelected(null)
              }}
            >
              Next
            </button>
          </div>
          {selected && (
            <section className="moderation-detail">
              <h3>{selected.email}</h3>
              <p className="moderation-user-id">{selected.id}</p>
              <AdminUserDetails
                key={selected.id}
                userId={selected.id}
                onChanged={() => setRevision((value) => value + 1)}
              />
              {selected.reason && <p>Last account note: {selected.reason}</p>}
              {selected.is_admin ? (
                <p>
                  Administrator accounts are protected. Manage admin roles
                  through the trusted database setup.
                </p>
              ) : (
                <form
                  className="admin-editor-form"
                  onSubmit={(event) => void moderate(event)}
                >
                  <label className="admin-field-label">
                    Account action
                    <select
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as typeof status)
                      }
                    >
                      <option value="active">Restore access</option>
                      <option value="suspended">Suspend until a date</option>
                      <option value="banned">Ban indefinitely</option>
                    </select>
                  </label>
                  {status === 'suspended' && (
                    <label className="admin-field-label">
                      Suspension expires (your local time)
                      <input
                        type="datetime-local"
                        value={until}
                        onChange={(event) => setUntil(event.target.value)}
                        required
                      />
                    </label>
                  )}
                  <label className="admin-field-label">
                    Reason shown to this member
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <p>
                    This applies{' '}
                    {status === 'active'
                      ? 'restored access'
                      : status === 'banned'
                        ? 'an indefinite restriction'
                        : 'a temporary suspension'}{' '}
                    to <strong>{selected.email}</strong>. The reason and your
                    admin ID will be recorded.
                  </p>
                  <button
                    className={`button ${status === 'active' ? 'button-primary' : 'button-stop'}`}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Apply account action'}
                  </button>
                </form>
              )}
            </section>
          )}
        </>
      ) : panel === 'reports' ? (
        <div className="moderation-reports">
          {reports.length ? (
            reports.map((report) => (
              <article className="moderation-detail" key={report.id}>
                <span className="admin-payment-status">{report.status}</span>
                <h3>{report.reported_identity}</h3>
                <p className="moderation-report-text">{report.details}</p>
                <p className="admin-field-help">
                  Submitted {new Date(report.created_at).toLocaleString()} ·
                  Reporter ID: {report.reporter_id}
                </p>
                {report.admin_note && <p>Review note: {report.admin_note}</p>}
                <div className="admin-review-actions">
                  <button
                    className="button button-outline"
                    onClick={() => {
                      if (onFindUser) {
                        onFindUser(report.reported_identity)
                      } else {
                        setQuery(report.reported_identity)
                        setSearch(report.reported_identity)
                        setOffset(0)
                        setPanel('users')
                      }
                    }}
                  >
                    Find account
                  </button>
                  <button
                    className="button button-outline"
                    onClick={() => {
                      setReviewId(report.id)
                      setNote('')
                      setReviewStatus('reviewing')
                    }}
                  >
                    Review report
                  </button>
                </div>
                {reviewId === report.id && (
                  <form
                    className="admin-review-form"
                    onSubmit={(event) => void review(event)}
                  >
                    <label className="admin-field-label">
                      Review status
                      <select
                        value={reviewStatus}
                        onChange={(event) =>
                          setReviewStatus(event.target.value)
                        }
                      >
                        <option value="reviewing">Under review</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                    </label>
                    <label className="admin-field-label">
                      Note visible to reporter
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        required
                        minLength={5}
                        maxLength={1000}
                      />
                    </label>
                    <button className="button button-primary" disabled={busy}>
                      Save review
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <p>No abuse reports have been submitted.</p>
          )}
        </div>
      ) : (
        <div>
          {audit.length ? (
            audit.map((item) => (
              <article className="moderation-detail" key={item.id}>
                <strong>{item.action}</strong>
                <p>{new Date(item.created_at).toLocaleString()}</p>
                <p className="moderation-user-id">
                  Admin: {item.actor_id || 'Deleted account'}
                  <br />
                  Target: {item.target_id || 'Report review'}
                </p>
                <pre className="moderation-audit-details">
                  {JSON.stringify(item.details, null, 2)}
                </pre>
              </article>
            ))
          ) : (
            <p>No moderation actions have been recorded.</p>
          )}
        </div>
      )}
    </section>
  )
}
