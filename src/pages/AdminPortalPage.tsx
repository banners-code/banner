import { ArrowLeft, CreditCard, Globe2, Inbox, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import FundingManager from '../features/admin/FundingManager'
import HomepageEditor from '../features/admin/HomepageEditor'
import { loadHomepageSettings, removeHomepageSettingsSubscription, subscribeToHomepageSettings, type HomepageSettings } from '../lib/homepageContent'
import { loadAllFundingRequests, loadFundingSettings, removeFundingSubscription, subscribeToFundingRequests, type FundingSettings, type ManualFundingRequest } from '../lib/manualFunding'
import { hasSupportAdminAccess } from '../lib/supportInbox'
import { supabaseConfigured } from '../lib/supabase'

type AdminSection = 'homepage' | 'funding'

export default function AdminPortalPage() {
  const { user, loading: authLoading } = useAuth()
  const [adminAccess, setAdminAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<AdminSection>('homepage')
  const [homepage, setHomepage] = useState<HomepageSettings | null>(null)
  const [fundingSettings, setFundingSettings] = useState<FundingSettings | null>(null)
  const [fundingRequests, setFundingRequests] = useState<ManualFundingRequest[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user || !supabaseConfigured) {
      setAdminAccess(false)
      setLoading(false)
      return
    }
    let active = true
    let confirmedAdmin = false
    let homepageChannel: ReturnType<typeof subscribeToHomepageSettings> | null = null
    let fundingChannel: ReturnType<typeof subscribeToFundingRequests> | null = null
    setLoading(true)
    void hasSupportAdminAccess().then(async (allowed) => {
      if (!active) return
      setAdminAccess(allowed)
      confirmedAdmin = allowed
      if (!allowed) return
      const [homepageResult, fundingResult, requestResult] = await Promise.all([
        loadHomepageSettings(),
        loadFundingSettings(),
        loadAllFundingRequests(),
      ])
      if (!active) return
      setHomepage(homepageResult)
      setFundingSettings(fundingResult)
      setFundingRequests(requestResult)
      homepageChannel = subscribeToHomepageSettings(() => {
        void loadHomepageSettings().then((value) => { if (active) setHomepage(value) }).catch(() => undefined)
      })
      fundingChannel = subscribeToFundingRequests(() => {
        void loadAllFundingRequests().then((value) => { if (active) setFundingRequests(value) }).catch(() => undefined)
      })
    }).catch((cause) => {
      if (active) {
        setAdminAccess(confirmedAdmin)
        setError(cause instanceof Error ? cause.message : 'Admin access or site settings could not be loaded.')
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      if (homepageChannel) void removeHomepageSettingsSubscription(homepageChannel)
      if (fundingChannel) void removeFundingSubscription(fundingChannel)
    }
  }, [authLoading, user?.id])

  return (
    <main className="admin-support-page admin-console-page">
      <header className="support-header"><BrandMark /><Link to="/dashboard" className="studio-back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to dashboard</Link></header>
      <div className="admin-support-main admin-console-main">
        <div className="admin-support-title"><div><p className="eyebrow">KINETELLE / ADMIN</p><h1>Site control.</h1></div><span className="support-live-badge"><span /> ADMIN WORKSPACE</span></div>
        {loading || authLoading ? <p className="support-loading"><LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> Checking admin access…</p>
          : !user || !supabaseConfigured ? <section className="support-gate"><Inbox size={20} aria-hidden="true" /><h2>Sign in to continue</h2><p>Sign in with a designated Kinetelle administrator account to manage the site.</p><Link className="button button-primary" to="/account?next=%2Fadmin">Sign in</Link></section>
            : !adminAccess ? <section className="support-gate"><Inbox size={20} aria-hidden="true" /><h2>Admin access isn’t enabled</h2><p>Grant your account the support admin role, then sign in again. The role protects the site editor, funding settings, receipts, and support inbox.</p><Link className="text-link" to="/">Return to Kinetelle <ArrowLeft size={14} aria-hidden="true" /></Link></section>
              : <>
                  <nav className="admin-console-nav" aria-label="Admin workspace sections">
                    <button className={section === 'homepage' ? 'is-active' : ''} type="button" onClick={() => { setSection('homepage'); setError('') }}><Globe2 size={15} aria-hidden="true" /> Homepage</button>
                    <button className={section === 'funding' ? 'is-active' : ''} type="button" onClick={() => { setSection('funding'); setError('') }}><CreditCard size={15} aria-hidden="true" /> Manual funding{fundingRequests.some((request) => request.status === 'pending') && <span className="admin-notification-count">{fundingRequests.filter((request) => request.status === 'pending').length}</span>}</button>
                    <Link to="/admin/support"><Inbox size={15} aria-hidden="true" /> Inbox & contact</Link>
                  </nav>
                  {error && <div className="admin-setup-alert" role="alert"><strong>Admin data could not load.</strong><span>{error}. Apply the admin site and manual funding migration before using these controls.</span></div>}
                  {section === 'homepage' && homepage ? <HomepageEditor initial={homepage} onSaved={setHomepage} /> : null}
                  {section === 'funding' && fundingSettings ? <FundingManager initialSettings={fundingSettings} initialRequests={fundingRequests} onSettingsSaved={setFundingSettings} onRequestsChanged={setFundingRequests} /> : null}
                </>}
      </div>
    </main>
  )
}
