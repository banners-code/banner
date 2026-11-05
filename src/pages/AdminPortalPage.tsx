import { Bell, Menu, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import AdminSidebar, {
  adminPaths,
  adminTitles,
  type AdminSection,
} from '../features/admin/AdminSidebar'
import AdminDashboard, {
  NotificationList,
} from '../features/admin/AdminDashboard'
import {
  AppSettingsPanel,
  FundingPanel,
} from '../features/admin/AdminSettingsPanels'
import ModerationManager from '../features/admin/ModerationManager'
import AdminSupportPage from './AdminSupportPage'
import {
  getAdminDashboard,
  getAdminApiStatus,
  getAdminNotifications,
  markNotificationsRead,
  type DashboardSummary,
  type ApiStatus,
  type AdminNotification,
} from '../lib/adminDashboard'
import { hasSupportAdminAccess } from '../lib/supportInbox'

export default function AdminPortalPage() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation(),
    navigate = useNavigate()
  const [params] = useSearchParams()
  const section = (Object.keys(adminPaths) as AdminSection[]).find(
    (key) => adminPaths[key] === location.pathname,
  )
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [accessError, setAccessError] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [api, setApi] = useState<ApiStatus | null>(null)
  const [events, setEvents] = useState<AdminNotification[]>([])
  const [error, setError] = useState(''),
    [apiError, setApiError] = useState('')
  const [revision, setRevision] = useState(0),
    [drawer, setDrawer] = useState(false)
  const [updated, setUpdated] = useState<Date | null>(null)
  const dialog = useRef<HTMLDialogElement>(null),
    menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (authLoading) return
    let active = true
    setAllowed(null)
    setAccessError('')
    if (!user) {
      setAllowed(false)
      return
    }
    void hasSupportAdminAccess()
      .then((value) => {
        if (active) setAllowed(value)
      })
      .catch(() => {
        if (active) {
          setAccessError(
            'Admin access could not be verified. Refresh to retry.',
          )
          setAllowed(false)
        }
      })
    return () => {
      active = false
    }
  }, [user?.id, authLoading])
  useEffect(() => {
    if (!allowed) return
    let active = true
    const refresh = () => {
      void Promise.allSettled([
        getAdminDashboard(),
        getAdminNotifications(),
        getAdminApiStatus(),
      ]).then(([stats, notifications, health]) => {
        if (!active) return
        if (stats.status === 'fulfilled') {
          setSummary(stats.value)
          setError('')
          setUpdated(new Date())
        } else
          setError(
            'Dashboard data is unavailable. Check the admin dashboard migration and database connection.',
          )
        if (notifications.status === 'fulfilled') setEvents(notifications.value)
        else setError('Notifications could not be loaded. Refresh to retry.')
        if (health.status === 'fulfilled') {
          setApi(health.value)
          setApiError('')
        } else {
          setApi(null)
          setApiError(
            'API status is unavailable. Check that the application server is running.',
          )
        }
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [allowed, revision])
  useEffect(() => {
    setDrawer(false)
    window.scrollTo(0, 0)
  }, [location.pathname, location.search])
  useEffect(() => {
    const node = dialog.current
    if (drawer && !node?.open) node?.showModal()
    else if (!drawer && node?.open) node.close()
  }, [drawer])
  async function onRead(keys: string[]) {
    if (!keys.length) return
    try {
      await markNotificationsRead(keys)
      setEvents((current) =>
        current.map((event) =>
          keys.includes(event.event_key) ? { ...event, read: true } : event,
        ),
      )
    } catch {
      setError('Notifications could not be marked read. Please retry.')
    }
  }
  const closeDrawer = () => {
    setDrawer(false)
    menuButton.current?.focus()
  }
  if (!section) return <Navigate to="/admin" replace />
  if (authLoading || allowed === null)
    return (
      <main className="account-page">
        <header className="account-header">
          <BrandMark />
        </header>
        <p className="dashboard-loading" role="status">
          Checking admin access…
        </p>
      </main>
    )
  if (!user || !allowed)
    return (
      <main className="account-page">
        <header className="account-header">
          <BrandMark />
        </header>
        <section className="account-card">
          <h1>{user ? 'Admin access required.' : 'Sign in to continue.'}</h1>
          <p className="account-intro">
            {accessError ||
              'This workspace is available to designated Kinetelle administrators.'}
          </p>
          <Link
            className="button button-primary"
            to={user ? '/dashboard' : '/account?next=%2Fadmin'}
          >
            {user ? 'Member dashboard' : 'Sign in'}
          </Link>
        </section>
      </main>
    )
  const unread = events.filter((event) => !event.read).length
  const sideProps = {
    section,
    unread,
    pending: summary?.pending_deposits ?? 0,
    onNavigate: closeDrawer,
    email: user.email ?? '',
  }
  return (
    <div className="admin-workspace">
      <aside className="admin-workspace-sidebar">
        <AdminSidebar {...sideProps} />
      </aside>
      <dialog
        ref={dialog}
        className="admin-drawer"
        onCancel={() => setDrawer(false)}
        onClose={() => setDrawer(false)}
        aria-label="Admin menu"
      >
        <button
          className="admin-drawer-close"
          onClick={closeDrawer}
          aria-label="Close admin menu"
        >
          <X size={20} />
        </button>
        <AdminSidebar {...sideProps} />
      </dialog>
      <div className="admin-workspace-body">
        <header className="admin-workspace-topbar">
          <button
            ref={menuButton}
            className="admin-mobile-menu"
            onClick={() => setDrawer(true)}
            aria-label="Open admin menu"
            aria-expanded={drawer}
          >
            <Menu size={20} />
          </button>
          <div>
            <span>WORKSPACE / KINETELLE</span>
            <strong>{adminTitles[section]}</strong>
          </div>
          <div className="admin-topbar-actions">
            <button
              type="button"
              aria-label="Refresh admin data"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={17} />
            </button>
            <Link
              to={adminPaths.notifications}
              aria-label={`Notifications, ${unread} unread`}
            >
              <Bell size={18} />
              {unread > 0 && <b>{unread}</b>}
            </Link>
            <span className="admin-avatar">
              {(user.email || 'A')[0].toUpperCase()}
            </span>
          </div>
        </header>
        <main className="admin-workspace-main">
          <div className="admin-page-heading">
            <div>
              <p className="tool-eyebrow">KINETELLE CONTROL ROOM</p>
              <h1>{adminTitles[section]}</h1>
            </div>
            {updated && (
              <time>
                Updated{' '}
                {updated.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            )}
          </div>
          {error && (
            <p className="admin-setup-alert" role="alert">
              {error}
            </p>
          )}
          {section === 'dashboard' && (
            <AdminDashboard
              summary={summary}
              api={api}
              apiError={apiError}
              notifications={events}
              onRead={(keys) => void onRead(keys)}
            />
          )}
          {section === 'app-settings' && <AppSettingsPanel />}
          {(section === 'payment-settings' || section === 'deposits') && (
            <FundingPanel
              view={section === 'deposits' ? 'queue' : 'settings'}
            />
          )}
          {(section === 'users' ||
            section === 'reports' ||
            section === 'audit') && (
            <ModerationManager
              key={section}
              section={section}
              initialQuery={params.get('search') || ''}
              onFindUser={(identity) =>
                navigate(`/admin/users?search=${encodeURIComponent(identity)}`)
              }
            />
          )}
          {(section === 'support' || section === 'contact-settings') && (
            <AdminSupportPage
              embedded
              activePanel={section === 'support' ? 'inbox' : 'contact'}
            />
          )}
          {section === 'notifications' && (
            <section className="admin-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Site notifications</h2>
                  <p>
                    {unread} unread · Latest 100 open items and recent accounts
                  </p>
                </div>
                <button
                  className="button button-outline"
                  disabled={!unread}
                  onClick={() =>
                    void onRead(
                      events
                        .filter((event) => !event.read)
                        .map((event) => event.event_key),
                    )
                  }
                >
                  Mark all read
                </button>
              </div>
              <NotificationList
                items={events}
                onRead={(keys) => void onRead(keys)}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
