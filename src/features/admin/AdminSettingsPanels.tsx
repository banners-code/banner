import { useEffect, useState } from 'react'
import HomepageEditor from './HomepageEditor'
import FundingManager from './FundingManager'
import AutomaticPaymentSetup from './AutomaticPaymentSetup'
import PricingSettings from './PricingSettings'
import {
  loadHomepageSettings,
  subscribeToHomepageSettings,
  removeHomepageSettingsSubscription,
  type HomepageSettings,
} from '../../lib/homepageContent'
import {
  loadFundingSettings,
  loadAllFundingRequests,
  type FundingSettings,
  type ManualFundingRequest,
} from '../../lib/manualFunding'

export function AppSettingsPanel() {
  const [settings, setSettings] = useState<HomepageSettings | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => {
      void loadHomepageSettings()
        .then((data) => {
          if (active) {
            setSettings(data)
            setError('')
          }
        })
        .catch(() => {
          if (active) setError('App settings could not load. Refresh to retry.')
        })
    }
    refresh()
    const channel = subscribeToHomepageSettings(refresh)
    return () => {
      active = false
      void removeHomepageSettingsSubscription(channel)
    }
  }, [])
  return error ? (
    <p role="alert" className="account-error">
      {error}
    </p>
  ) : settings ? (
    <HomepageEditor initial={settings} onSaved={setSettings} />
  ) : (
    <p role="status">Loading app settings…</p>
  )
}
export function FundingPanel({ view }: { view: 'settings' | 'queue' }) {
  const [settings, setSettings] = useState<FundingSettings | null>(null),
    [requests, setRequests] = useState<ManualFundingRequest[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = () => {
      void Promise.all([loadFundingSettings(), loadAllFundingRequests()])
        .then(([s, r]) => {
          if (active) {
            setSettings(s)
            setRequests(r)
            setError('')
          }
        })
        .catch(() => {
          if (active) setError('Payment data could not load. Refresh to retry.')
        })
    }
    refresh()
    const timer =
      view === 'queue' ? window.setInterval(refresh, 30_000) : undefined
    return () => {
      active = false
      if (timer) window.clearInterval(timer)
    }
  }, [view])
  return (
    <>
      {view === 'settings' && <PricingSettings fundingSettings={settings} />}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {settings ? (
        <FundingManager
          key={view}
          initialSettings={settings}
          initialRequests={requests}
          onSettingsSaved={setSettings}
          onRequestsChanged={setRequests}
          view={view}
        />
      ) : (
        !error && <p role="status">Loading payment data…</p>
      )}
      {view === 'settings' && <AutomaticPaymentSetup />}
    </>
  )
}
