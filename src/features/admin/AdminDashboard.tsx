import {
  Activity,
  ArrowUpRight,
  Bell,
  Clock3,
  CreditCard,
  Radio,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { adminPaths } from './AdminSidebar'
import {
  duration,
  money,
  type AdminNotification,
  type ApiStatus,
  type DashboardSummary,
} from '../../lib/adminDashboard'

export function NotificationList({
  items,
  onRead,
  compact = false,
}: {
  items: AdminNotification[]
  onRead: (keys: string[]) => void
  compact?: boolean
}) {
  const rows = compact ? items.slice(0, 5) : items
  return (
    <div className="admin-notifications-list">
      {rows.length ? (
        rows.map((item) => (
          <article
            key={item.event_key}
            className={item.read ? 'is-read' : 'is-unread'}
          >
            <span className="admin-event-dot" />
            <div>
              <Link
                to={
                  adminPaths[item.destination as keyof typeof adminPaths] ||
                  '/admin'
                }
                onClick={() => onRead([item.event_key])}
              >
                {item.title}
              </Link>
              <time>{new Date(item.created_at).toLocaleString()}</time>
            </div>
            {!item.read && (
              <button
                type="button"
                onClick={() => onRead([item.event_key])}
                aria-label={`Mark ${item.title} as read`}
              >
                Mark read
              </button>
            )}
          </article>
        ))
      ) : (
        <div className="admin-no-events">
          <Bell size={20} />
          <p>You’re all caught up.</p>
          <span>
            New deposits, reports, messages, and accounts appear here.
          </span>
        </div>
      )}
    </div>
  )
}
export default function AdminDashboard({
  summary,
  api,
  apiError,
  notifications,
  onRead,
}: {
  summary: DashboardSummary | null
  api: ApiStatus | null
  apiError: string
  notifications: AdminNotification[]
  onRead: (keys: string[]) => void
}) {
  const cards = [
    {
      label: 'Registered users',
      value: summary?.total_users,
      foot: `${summary?.active_users ?? 0} users live now`,
      to: 'users',
      Icon: Users,
    },
    {
      label: 'Active sessions',
      value: summary?.active_sessions,
      foot: `${summary?.total_sessions ?? 0} sessions recorded`,
      to: 'users',
      Icon: Activity,
    },
    {
      label: 'Total live time',
      value: summary ? duration(summary.spent_seconds) : undefined,
      foot: 'Recorded transformed session time',
      to: 'users',
      Icon: Clock3,
    },
    {
      label: 'Pending deposits',
      value: summary?.pending_deposits,
      foot: 'Waiting for payment verification',
      to: 'deposits',
      Icon: CreditCard,
    },
  ] as const
  return (
    <div className="admin-overview">
      <div className="admin-overview-intro">
        <div>
          <p className="tool-eyebrow">YOUR SITE, AT A GLANCE</p>
          <h2>A clear view of what’s happening.</h2>
          <p>Accounts, live sessions, and payments in one place.</p>
        </div>
        <span className="admin-refresh-chip">
          <Radio size={13} />
          Updates every 30 seconds
        </span>
      </div>
      <div className="admin-overview-metrics">
        {cards.map(({ label, value, foot, to, Icon }) => (
          <Link
            key={label}
            to={adminPaths[to]}
            className="admin-overview-metric"
          >
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value ?? '—'}</strong>
            <p>
              {foot}
              <ArrowUpRight size={13} />
            </p>
          </Link>
        ))}
      </div>
      <div className="admin-overview-columns">
        <section className="admin-card admin-money-card">
          <div className="admin-card-heading">
            <div>
              <p className="tool-eyebrow">PAYMENTS</p>
              <h2>Money deposited</h2>
              <p>Verified manual deposits, grouped by currency.</p>
            </div>
            <Link to={adminPaths.deposits}>
              <ArrowUpRight size={18} />
              <span className="sr-only">View deposits</span>
            </Link>
          </div>
          {summary?.money.length ? (
            <div className="admin-money-rows">
              {summary.money.map((row) => (
                <div key={row.currency}>
                  <span>{row.currency}</span>
                  <strong>{money(row.approved, row.currency)}</strong>
                  <small>{money(row.pending, row.currency)} pending</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-no-events">
              <CreditCard size={21} />
              <p>No deposits recorded yet.</p>
            </div>
          )}
          <div className="admin-overview-quick">
            <Link to={adminPaths.reports}>
              <ShieldCheck size={16} />
              <span>Open reports</span>
              <b>{summary?.open_reports ?? '—'}</b>
            </Link>
            <Link to={adminPaths.support}>
              <Bell size={16} />
              <span>Open support conversations</span>
              <b>{summary?.open_support ?? '—'}</b>
            </Link>
          </div>
        </section>
        <section className="admin-card admin-api-card">
          <div className="admin-card-heading">
            <div>
              <p className="tool-eyebrow">REALTIME API</p>
              <h2>Connection & activity</h2>
            </div>
            <span className={`admin-api-dot${api ? ' is-connected' : ''}`} />
          </div>
          <dl>
            <div>
              <dt>Application API</dt>
              <dd>{api ? 'Online' : apiError ? 'Unavailable' : 'Checking…'}</dd>
            </div>
            <div>
              <dt>Decart configuration</dt>
              <dd>
                {api
                  ? api.decart_configured
                    ? 'Configured'
                    : 'Key missing'
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Account verification</dt>
              <dd>{api?.account_verification ?? '—'}</dd>
            </div>
            <div>
              <dt>Tokens issued</dt>
              <dd>{api?.tokens_issued ?? '—'}</dd>
            </div>
            <div>
              <dt>Token requests / failures</dt>
              <dd>
                {api ? `${api.token_requests} / ${api.failed_requests}` : '—'}
              </dd>
            </div>
            <div>
              <dt>Server uptime</dt>
              <dd>{api ? duration(api.uptime_seconds) : '—'}</dd>
            </div>
          </dl>
          <p className="admin-field-help">
            Token counters are for this server process since its last restart.
            Decart billing and provider health are not exposed here.
          </p>
          {apiError && <p className="account-error">{apiError}</p>}
        </section>
      </div>
      <section className="admin-card">
        <div className="admin-card-heading">
          <div>
            <p className="tool-eyebrow">NEEDS YOUR ATTENTION</p>
            <h2>Recent notifications</h2>
          </div>
          <Link to={adminPaths.notifications} className="admin-inline-link">
            View all <ArrowUpRight size={14} />
          </Link>
        </div>
        <NotificationList items={notifications} onRead={onRead} compact />
      </section>
    </div>
  )
}
