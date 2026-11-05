import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import BrandMark from '../../components/BrandMark'
import { getAccountAccess, type AccountAccess } from '../../lib/moderation'

export default function StudioAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [access, setAccess] = useState<AccountAccess | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [checkedUser, setCheckedUser] = useState('')
  useEffect(() => {
    if (!user) return
    let active = true
    const refresh = () => { void getAccountAccess().then((next) => {
      if (active) { setAccess(next); setCheckedUser(user.id); setError('') }
    }).catch(() => { if (active) { setError('We could not verify your account access. Please retry.'); setAccess(null) } }) }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [user?.id, retry])
  if (!loading && !user) return children
  if (!loading && !error && checkedUser === user?.id && access?.status === 'active') return children
  return <main className="account-page"><header className="account-header"><BrandMark /><Link to="/dashboard">Dashboard</Link></header><section className="account-card moderation-gate">
    <p className="eyebrow">ACCOUNT ACCESS</p>
    <h1>{error ? 'Access check unavailable.' : access && checkedUser === user?.id ? access.status === 'banned' ? 'Account restricted.' : 'Account suspended.' : 'Checking your account…'}</h1>
    {error ? <><p role="alert">{error}</p><button className="button button-primary" onClick={() => { setError(''); setRetry((value) => value + 1) }}>Retry access check</button></> : access && checkedUser === user?.id && <><p>{access.reason}</p>{access.suspended_until && <p>Suspension ends {new Date(access.suspended_until).toLocaleString()}.</p>}<p>You can still view your account and contact Support to request a review.</p><Link className="button button-primary" to="/support">Contact Support</Link></>}
  </section></main>
}
