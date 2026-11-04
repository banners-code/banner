import { ArrowUpRight, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from './BrandMark'

export default function SiteHeader() {
  const { user, loading } = useAuth()
  return (
    <header className="site-header">
      <BrandMark />
      <nav className="site-nav" aria-label="Main navigation">
        <a href="#approach">The approach</a>
        <a href="#looks">Looks</a>
        <Link to="/account"><UserRound size={14} aria-hidden="true" />{loading ? 'Account' : user ? 'Your account' : 'Sign in'}</Link>
      </nav>
      <Link className="button button-outline site-header-cta" to="/studio">
        Open Studio <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </header>
  )
}
