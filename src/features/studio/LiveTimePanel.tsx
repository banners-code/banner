import { Clock3, RefreshCw, Square } from 'lucide-react'
import { Link } from 'react-router-dom'
import { duration } from '../../lib/adminDashboard'
import type { LiveTimeSnapshot } from '../../lib/liveSession'

export default function LiveTimePanel({
  balance,
  snapshot,
  error,
  onRefresh,
  onBuyTime,
  onStop,
}: {
  balance: number | null
  snapshot: LiveTimeSnapshot | null
  error: string
  onBuyTime?(): void
  onRefresh(): void
  onStop(): void
}) {
  const low = Boolean(snapshot?.metering && snapshot.remainingSeconds <= 60)
  return (
    <section
      className={`studio-time-panel${low ? ' is-low' : ''}`}
      aria-label="Live time"
    >
      <div className="studio-time-heading">
        <Clock3 size={16} aria-hidden="true" />
        <span>
          {snapshot
            ? snapshot.metering
              ? 'Session time left'
              : 'Preparing live session'
            : 'Available live time'}
        </span>
        {!snapshot && (
          <button
            type="button"
            aria-label="Refresh live time"
            onClick={onRefresh}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      <strong aria-live="off">
        {snapshot
          ? duration(snapshot.remainingSeconds)
          : balance === null
            ? '—'
            : duration(balance)}
      </strong>
      {low && (
        <p role="status">
          Less than a minute remains. This session will stop when its allowance
          ends.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {snapshot ? (
        <button className="studio-stop-live" type="button" onClick={onStop}>
          <Square size={12} aria-hidden="true" />
          Stop live session
        </button>
      ) : (
        <>
          {onBuyTime && (
            <button
              type="button"
              className="studio-buy-time"
              onClick={onBuyTime}
            >
              Buy AI time
            </button>
          )}
          <Link to="/dashboard">View usage and payment history</Link>
          <p>
            10 seconds minimum. Connection time counts toward usage.
          </p>
        </>
      )}
    </section>
  )
}
