import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { useAuth } from '../auth/AuthProvider'

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/studio'
  return value
}

function errorCopy(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Try again or create an account.'
  if (/already registered|already exists/i.test(message)) return 'An account with that email already exists. Sign in instead.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email from the message in your inbox, then sign in.'
  return message || 'We could not complete that request. Please try again.'
}

export default function AccountPage() {
  const { user, loading, configured, signIn, signUp, signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const returnPath = safeReturnPath(searchParams.get('next'))
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password)
        navigate(returnPath, { replace: true })
      } else {
        const confirmationRequired = await signUp(email.trim(), password)
        if (confirmationRequired) {
          setMessage('Check your inbox to confirm your email. We will return you to the Studio after confirmation.')
        } else {
          navigate(returnPath, { replace: true })
        }
      }
    } catch (submitError) {
      setError(errorCopy(submitError))
    } finally {
      setBusy(false)
    }
  }

  const changeMode = (nextMode: 'sign-in' | 'sign-up') => {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  return (
    <main className="account-page">
      <div className="account-grain" aria-hidden="true" />
      <header className="account-header">
        <BrandMark />
        <Link className="account-back-link" to="/"><ArrowLeft size={14} aria-hidden="true" /> Back to Kinetelle</Link>
      </header>
      <section className="account-card" aria-labelledby="account-title">
        <div className="account-emblem"><UserRound size={20} aria-hidden="true" /></div>
        <p className="eyebrow account-eyebrow"><span className="eyebrow-rule" /> KINETELLE / ACCOUNT</p>
        {user ? (
          <>
            <h1 id="account-title">Welcome back.</h1>
            <p className="account-intro">Signed in as <strong>{user.email}</strong>. Your saved directions and Studio preferences are linked to this account.</p>
            <Link className="button button-primary account-submit" to={returnPath}>Continue to the Studio <ArrowRight size={15} aria-hidden="true" /></Link>
            <button className="account-signout" type="button" onClick={() => void signOut().then(() => setMessage('You are signed out.')).catch((signOutError) => setError(errorCopy(signOutError)))}>Sign out</button>
          </>
        ) : (
          <>
            <h1 id="account-title">{mode === 'sign-in' ? 'Return to your canvas.' : 'Make room to create.'}</h1>
            <p className="account-intro">Sign in to start live Decart sessions and keep your directions and Studio preferences with you.</p>
            {!configured ? (
              <div className="account-config-message" role="status">
                <LockKeyhole size={17} aria-hidden="true" />
                <div><strong>Accounts are not connected yet.</strong><span>Add the Supabase project URL and publishable key to the local environment, then reload this page.</span></div>
              </div>
            ) : loading ? (
              <p className="account-loading" role="status"><LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> Checking your session…</p>
            ) : (
              <>
                <div className="account-mode-switch" role="group" aria-label="Account access">
                  <button type="button" aria-pressed={mode === 'sign-in'} onClick={() => changeMode('sign-in')}>Sign in</button>
                  <button type="button" aria-pressed={mode === 'sign-up'} onClick={() => changeMode('sign-up')}>Create account</button>
                </div>
                <form className="account-form" onSubmit={(event) => void submit(event)}>
                  <label htmlFor="account-email">Email address</label>
                  <input id="account-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                  <label htmlFor="account-password">Password</label>
                  <input id="account-password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
                  {mode === 'sign-up' && <p className="account-field-note">Use at least 8 characters. Email confirmation may be required.</p>}
                  {error && <p className="account-error" role="alert">{error}</p>}
                  {message && <p className="account-success" role="status"><CheckCircle2 size={15} aria-hidden="true" />{message}</p>}
                  <button className="button button-primary account-submit" type="submit" disabled={busy}>
                    {busy ? <LoaderCircle size={16} className="spin-icon" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                    {busy ? 'Working…' : mode === 'sign-in' ? 'Sign in to Kinetelle' : 'Create account'}
                  </button>
                </form>
                <p className="account-privacy">Your camera preview stays local until you explicitly start a live session.</p>
              </>
            )}
          </>
        )}
        {(error || message) && user && <p className={error ? 'account-error' : 'account-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      </section>
    </main>
  )
}
