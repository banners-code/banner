import { ArrowLeft, ArrowRight, CheckCircle2, Download, KeyRound, LoaderCircle, LockKeyhole, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { useAuth } from '../auth/AuthProvider'
import { deleteStudioData, exportStudioData } from '../lib/studioLibrary'
import { hasSupportAdminAccess } from '../lib/supportInbox'

type AccountMode = 'sign-in' | 'sign-up' | 'request-reset' | 'update-password'

function errorCopy(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Try again or create an account.'
  if (/already registered|already exists/i.test(message)) return 'An account with that email already exists. Sign in instead.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email from the message in your inbox, then sign in.'
  return message || 'We could not complete that request. Please try again.'
}

export default function AccountPage() {
  const { user, loading, configured, passwordRecovery, signIn, signUp, requestPasswordReset, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const returnPath = '/dashboard'
  const [mode, setMode] = useState<AccountMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [dataBusy, setDataBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [supportAdmin, setSupportAdmin] = useState(false)

  useEffect(() => {
    if (passwordRecovery) setMode('update-password')
    else if (!user) setMode((current) => current === 'update-password' ? 'sign-in' : current)
  }, [passwordRecovery, user?.id])

  useEffect(() => {
    let active = true
    if (!user) { setSupportAdmin(false); return }
    void hasSupportAdminAccess().then((allowed) => { if (active) setSupportAdmin(allowed) }).catch(() => { if (active) setSupportAdmin(false) })
    return () => { active = false }
  }, [user?.id])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (mode === 'update-password' && password !== passwordConfirmation) {
      setError('The passwords do not match. Enter the same password in both fields.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password)
        navigate(returnPath, { replace: true })
      } else if (mode === 'sign-up') {
        const confirmationRequired = await signUp(email.trim(), password)
        if (confirmationRequired) {
          setMessage('Check your inbox to confirm your email. We will return you to your dashboard after confirmation.')
        } else {
          navigate(returnPath, { replace: true })
        }
      } else if (mode === 'request-reset') {
        await requestPasswordReset(email.trim())
        setMessage('If an account exists for that email, a password reset link will arrive shortly.')
      } else {
        await updatePassword(password)
        setPassword('')
        setPasswordConfirmation('')
        setMode('sign-in')
        setMessage('Your password has been updated.')
      }
    } catch (submitError) {
      setError(errorCopy(submitError))
    } finally {
      setBusy(false)
    }
  }

  const changeMode = (nextMode: AccountMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')
    setPassword('')
    setPasswordConfirmation('')
  }

  const downloadStudioData = async () => {
    if (!user || dataBusy) return
    setDataBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await exportStudioData(user)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'kinetelle-studio-data-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Your Studio data export has been downloaded.')
    } catch {
      setError('Your Studio data could not be exported. Check the Supabase connection and try again.')
    } finally {
      setDataBusy(false)
    }
  }

  const clearStudioData = async () => {
    if (!user || dataBusy || !window.confirm('Delete all saved directions and Studio preferences for this account? This cannot be undone.')) return
    setDataBusy(true)
    setError('')
    setMessage('')
    try {
      await deleteStudioData(user)
      setMessage('Saved directions and Studio preferences have been deleted.')
    } catch {
      setError('Studio data could not be fully deleted. Check the Supabase connection and try again.')
    } finally {
      setDataBusy(false)
    }
  }

  const recoveryForm = mode === 'update-password' && passwordRecovery
  const recoveryRequest = mode === 'request-reset'
  const showSignInOrSignUp = mode === 'sign-in' || mode === 'sign-up'

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
        {recoveryForm ? (
          <>
            <h1 id="account-title">Choose a new password.</h1>
            <p className="account-intro">Your reset link is ready. Set a new password for your Kinetelle account.</p>
            <form className="account-form" onSubmit={(event) => void submit(event)}>
              <label htmlFor="account-password">New password</label>
              <input id="account-password" name="new-password" autoComplete="new-password" type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <label htmlFor="account-password-confirmation">Confirm new password</label>
              <input id="account-password-confirmation" name="new-password-confirmation" autoComplete="new-password" type="password" minLength={8} maxLength={72} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
              {error && <p className="account-error" role="alert">{error}</p>}
              <button className="button button-primary account-submit" type="submit" disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin-icon" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        ) : user ? (
          <>
            <h1 id="account-title">Welcome back.</h1>
            <p className="account-intro">Signed in as <strong>{user.email}</strong>. Your saved directions and Studio preferences are linked to this account.</p>
            <Link className="button button-primary account-submit" to={returnPath}>Open your dashboard <ArrowRight size={15} aria-hidden="true" /></Link>
            <div className="account-support-links"><Link to="/support">Contact support</Link>{supportAdmin && <Link to="/admin/support">Open admin inbox</Link>}</div>
            <section className="account-data-card" aria-labelledby="account-data-title">
              <h2 id="account-data-title">Your Studio data</h2>
              <p>Export a copy of your saved directions and preferences, or remove them from this account.</p>
              <div className="account-data-actions">
                <button className="account-data-button" type="button" onClick={() => void downloadStudioData()} disabled={dataBusy}>
                  {dataBusy ? <LoaderCircle size={14} className="spin-icon" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                  Download data
                </button>
                <button className="account-data-button account-data-delete" type="button" onClick={() => void clearStudioData()} disabled={dataBusy}>
                  <Trash2 size={14} aria-hidden="true" /> Delete saved data
                </button>
              </div>
            </section>
            <button className="account-signout" type="button" onClick={() => void signOut().then(() => setMessage('You are signed out.')).catch((signOutError) => setError(errorCopy(signOutError)))}>Sign out</button>
          </>
        ) : (
          <>
            <h1 id="account-title">{mode === 'sign-in' ? 'Return to your canvas.' : mode === 'sign-up' ? 'Make room to create.' : 'Send a reset link.'}</h1>
            <p className="account-intro">{recoveryRequest ? 'Enter your account email and we will send a password reset link if an account exists.' : 'Sign in to start live Decart sessions and keep your directions and Studio preferences with you.'}</p>
            {!configured ? (
              <div className="account-config-message" role="status">
                <LockKeyhole size={17} aria-hidden="true" />
                <div><strong>Accounts are not connected yet.</strong><span>Add the Supabase project URL and publishable key to the local environment, then reload this page.</span></div>
              </div>
            ) : loading ? (
              <p className="account-loading" role="status"><LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> Checking your session…</p>
            ) : (
              <>
                {showSignInOrSignUp && (
                  <div className="account-mode-switch" role="group" aria-label="Account access">
                    <button type="button" aria-pressed={mode === 'sign-in'} onClick={() => changeMode('sign-in')}>Sign in</button>
                    <button type="button" aria-pressed={mode === 'sign-up'} onClick={() => changeMode('sign-up')}>Create account</button>
                  </div>
                )}
                <form className="account-form" onSubmit={(event) => void submit(event)}>
                  {mode !== 'update-password' && (
                    <>
                      <label htmlFor="account-email">Email address</label>
                      <input id="account-email" name="email" autoComplete="email" autoCapitalize="none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </>
                  )}
                  {showSignInOrSignUp && (
                    <>
                      <label htmlFor="account-password">Password</label>
                      <input id="account-password" name={mode === 'sign-in' ? 'current-password' : 'new-password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
                    </>
                  )}
                  {mode === 'sign-up' && <p className="account-field-note">Use at least 8 characters. Email confirmation may be required.</p>}
                  {error && <p className="account-error" role="alert">{error}</p>}
                  {message && <p className="account-success" role="status"><CheckCircle2 size={15} aria-hidden="true" />{message}</p>}
                  <button className="button button-primary account-submit" type="submit" disabled={busy}>
                    {busy ? <LoaderCircle size={16} className="spin-icon" aria-hidden="true" /> : recoveryRequest ? <KeyRound size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                    {busy ? 'Working…' : mode === 'sign-in' ? 'Sign in to Kinetelle' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}
                  </button>
                </form>
                {mode === 'sign-in' && <button className="account-forgot" type="button" onClick={() => changeMode('request-reset')}>Forgot password?</button>}
                {recoveryRequest && <button className="account-signout" type="button" onClick={() => changeMode('sign-in')}>Back to sign in</button>}
                <p className="account-privacy">Your camera preview stays local until you explicitly start a live session.</p>
              </>
            )}
          </>
        )}
        {(error || message) && user && !recoveryForm && <p className={error ? 'account-error' : 'account-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      </section>
    </main>
  )
}
