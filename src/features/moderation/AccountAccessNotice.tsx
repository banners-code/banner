import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccountAccess, type AccountAccess } from '../../lib/moderation'

export default function AccountAccessNotice({ userId }: { userId: string }) {
  const [access, setAccess] = useState<AccountAccess | null>(null)
  useEffect(() => {
    let active = true
    setAccess(null)
    const refresh = () => { void getAccountAccess().then((next) => { if (active) setAccess(next) }).catch(() => undefined) }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [userId])
  if (!access || access.status === 'active') return null
  return <aside className="admin-setup-alert" role="status"><strong>{access.status === 'banned' ? 'Your account is restricted.' : 'Your account is suspended.'}</strong><span>{access.reason}</span>{access.suspended_until && <span>Ends {new Date(access.suspended_until).toLocaleString()}</span>}<Link to="/support">Contact Support to request a review</Link></aside>
}
