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
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#looks">Looks</a>
        <a href="#faq">FAQ</a>
        <a href="#contact">Contact</a>
        <Link to={user ? '/dashboard' : '/account'}><UserRound size={14} aria-hidden="true" />{loading ? 'Account' : user ? 'Dashboard' : 'Sign in'}</Link>
      </nav>
      <Link className="button button-outline site-header-cta" to={user ? '/dashboard' : '/studio'}>
        {user ? 'Your dashboard' : 'Open Studio'} <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </header>
  )
}
