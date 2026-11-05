import { Activity, ArrowLeft, ArrowRight, Camera, CircleHelp, Clock3, CreditCard, Inbox, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import { loadLiveUsageSummary, type LiveUsageSession, type LiveUsageSummary } from '../lib/liveUsage'
import { hasSupportAdminAccess } from '../lib/supportInbox'
import ManualFundingPanel from '../features/funding/ManualFundingPanel'

type LoadState = 'loading' | 'ready' | 'error'

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
  return `${remainingSeconds}s`
}

function formatAvailableTime(seconds: number) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${totalMinutes}m`
}

function sessionDuration(session: LiveUsageSession) {
  return formatDuration(session.duration_seconds)
}

function formatSessionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Session date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date)
}

function DashboardLoading() {
  return (
    <main className="dashboard-page">
      <header className="dashboard-header"><BrandMark /></header>
      <div className="dashboard-loading" role="status"><LoaderCircle size={17} className="spin-icon" aria-hidden="true" /> Preparing your workspace…</div>
    </main>
  )
}

export default function UserDashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<LiveUsageSummary | null>(null)
  const [supportAdmin, setSupportAdmin] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [fundingExpanded, setFundingExpanded] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true

    const refresh = async () => {
      try {
        const nextSummary = await loadLiveUsageSummary()
        if (!active) return
        setSummary(nextSummary)
        setLoadState('ready')
        setLastUpdated(new Date())
      } catch {
        if (!active) return
        setLoadState('error')
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [user?.id])

  useEffect(() => {
    let active = true
    if (!user) { setSupportAdmin(false); return }
    void hasSupportAdminAccess().then((allowed) => { if (active) setSupportAdmin(allowed) }).catch(() => { if (active) setSupportAdmin(false) })
    return () => { active = false }
  }, [user?.id])

  const remainingSeconds = useMemo(() => {
    if (!summary) return 0
    return Math.max(0, summary.credited_seconds - summary.spent_seconds)
  }, [summary])

  if (authLoading) return <DashboardLoading />
  if (!user) return <Navigate to="/account?next=%2Fdashboard" replace />

  const greeting = user.email?.split('@')[0] || 'creator'
  const signOutUser = async () => {
    setSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      navigate('/account', { replace: true })
    } catch {
      setSignOutError('Sign out could not be completed. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-grain" aria-hidden="true" />
      <header className="dashboard-header">
        <BrandMark />
        <div className="dashboard-header-actions">
          <Link to="/support" className="dashboard-quiet-link"><CircleHelp size={15} aria-hidden="true" /> Help</Link>
          {supportAdmin && <Link to="/admin" className="dashboard-quiet-link"><Inbox size={15} aria-hidden="true" /> Admin</Link>}
          <Link to="/account" className="dashboard-user-pill"><span className="dashboard-avatar">{greeting.slice(0, 1).toUpperCase()}</span><span>{user.email}</span></Link>
          <button type="button" className="dashboard-signout" onClick={() => void signOutUser()} disabled={signingOut} aria-label="Sign out">
            {signingOut ? <LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> : <LogOut size={15} aria-hidden="true" />}
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <section className="dashboard-main">
        <div className="dashboard-topline">
          <Link className="dashboard-back" to="/"><ArrowLeft size={14} aria-hidden="true" /> Kinetelle home</Link>
          <span className="dashboard-live-mark"><span /> PRIVATE CREATIVE ACCOUNT</span>
        </div>

        {signOutError && <p className="dashboard-signout-error" role="alert">{signOutError}</p>}

        <div className="dashboard-welcome">
          <div>
            <p className="eyebrow"><span className="eyebrow-rule" /> YOUR CREATIVE SPACE</p>
            <h1>Welcome in, <em>{greeting}.</em></h1>
            <p className="dashboard-welcome-copy">Your live time and recent Studio activity, all in one place.</p>
          </div>
          <Link className="button button-primary dashboard-studio-cta" to="/studio"><Sparkles size={16} aria-hidden="true" /> Enter Live Studio <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>

        {loadState === 'error' && (
          <div className="dashboard-data-alert" role="alert">
            <Activity size={17} aria-hidden="true" />
            <div><strong>Your usage data could not be loaded.</strong><span>Apply the live usage and time credit migration in Supabase, then refresh this page.</span></div>
            <button type="button" onClick={() => { setLoadState('loading'); void loadLiveUsageSummary().then((next) => { setSummary(next); setLoadState('ready'); setLastUpdated(new Date()) }).catch(() => setLoadState('error')) }} aria-label="Retry loading usage" title="Retry"><RefreshCw size={15} aria-hidden="true" /></button>
          </div>
        )}

        <div className="dashboard-metrics" aria-live="polite">
          <article className="dashboard-metric dashboard-metric-primary">
            <div className="dashboard-metric-top"><span>LIVE TIME AVAILABLE</span><Clock3 size={16} aria-hidden="true" /></div>
            <p className="dashboard-metric-value">{loadState === 'ready' && summary ? formatAvailableTime(remainingSeconds) : '—'}</p>
            <p className="dashboard-metric-foot">Available for Decart live sessions</p>
            <div className="dashboard-time-track" aria-hidden="true"><span style={{ width: `${summary && summary.credited_seconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / summary.credited_seconds) * 100)) : 0}%` }} /></div>
            <button className="button button-primary dashboard-fund-button" type="button" aria-expanded={fundingExpanded} aria-controls="dashboard-funding-panel" onClick={() => setFundingExpanded((expanded) => !expanded)}><CreditCard size={15} aria-hidden="true" /> Fund account <ArrowRight size={14} aria-hidden="true" /></button>
          </article>

          <article className="dashboard-metric">
            <div className="dashboard-metric-top"><span>LIVE TIME USED</span><Activity size={16} aria-hidden="true" /></div>
            <p className="dashboard-metric-value">{loadState === 'ready' && summary ? formatDuration(summary.spent_seconds) : '—'}</p>
            <p className="dashboard-metric-foot">Time spent in transformed sessions</p>
          </article>

          <article className="dashboard-metric">
            <div className="dashboard-metric-top"><span>LIVE SESSIONS</span><Camera size={16} aria-hidden="true" /></div>
            <p className="dashboard-metric-value">{loadState === 'ready' && summary ? summary.session_count.toLocaleString() : '—'}</p>
            <p className="dashboard-metric-foot">Sessions started in Live Studio</p>
          </article>
        </div>

        {fundingExpanded && (
          <ManualFundingPanel user={user} />
        )}

        <div className="dashboard-lower-grid">
          <section className="dashboard-activity-card" aria-labelledby="dashboard-activity-title">
            <div className="dashboard-section-heading">
              <div><p className="dashboard-panel-eyebrow">YOUR RECENT WORK</p><h2 id="dashboard-activity-title">Live session activity</h2></div>
              <div className="dashboard-updated">{lastUpdated && loadState === 'ready' ? `UPDATED ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(lastUpdated)}` : ''}</div>
            </div>
            {loadState === 'loading' ? (
              <div className="dashboard-empty"><LoaderCircle size={16} className="spin-icon" aria-hidden="true" /> Loading your usage…</div>
            ) : loadState === 'error' ? (
              <div className="dashboard-empty">Session history is unavailable until the usage data can be loaded.</div>
            ) : summary?.sessions.length ? (
              <div className="dashboard-session-list">
                {summary.sessions.map((session) => (
                  <article className="dashboard-session-row" key={session.id}>
                    <span className={`dashboard-session-icon${session.active ? ' is-active' : ''}`}><Camera size={15} aria-hidden="true" /></span>
                    <div className="dashboard-session-copy"><strong>Live Studio session</strong><span>{formatSessionDate(session.started_at)}</span></div>
                    <span className="dashboard-session-duration">{sessionDuration(session)}</span>
                    <span className={`dashboard-session-state${session.active ? ' is-active' : ''}`}>{session.active ? 'ACTIVE' : 'ENDED'}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty dashboard-empty-first">
                <div className="dashboard-empty-orbit"><Camera size={18} aria-hidden="true" /></div>
                <strong>Your first live session will appear here.</strong>
                <span>Start a transformation in the Studio to begin tracking live time.</span>
                <Link to="/studio">Open Live Studio <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            )}
          </section>

          <aside className="dashboard-side-card">
            <div className="dashboard-side-icon"><ShieldCheck size={17} aria-hidden="true" /></div>
            <p className="dashboard-panel-eyebrow">YOUR PRIVATE SPACE</p>
            <h2>Built around your sessions.</h2>
            <p>Your camera stays in the browser until you start a live transformation. Studio activity is linked to this signed-in account.</p>
            <Link to="/account">Account settings <ArrowRight size={14} aria-hidden="true" /></Link>
            {supportAdmin && <Link to="/admin">Open admin workspace <ArrowRight size={14} aria-hidden="true" /></Link>}
          </aside>
        </div>

        <footer className="dashboard-footer"><span>KINETELLE STUDIO · MEMBER SPACE</span><span>Need a hand? <Link to="/support">Contact support</Link></span></footer>
      </section>
    </main>
  )
}
