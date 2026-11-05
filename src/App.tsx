import { Link, Route, Routes } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import BrandMark from './components/BrandMark'
import LandingPage from './pages/LandingPage'
import AccountPage from './pages/AccountPage'
import StudioPage from './pages/StudioPage'
import SupportPage from './pages/SupportPage'
import UserDashboardPage from './pages/UserDashboardPage'
import LegalPage from './pages/LegalPage'
import AdminPortalPage from './pages/AdminPortalPage'
import StudioAccessGate from './features/moderation/StudioAccessGate'
import ReportPage from './pages/ReportPage'

function NotFound() {
  return (
    <main className="not-found">
      <BrandMark />
      <p className="eyebrow">FRAME NOT FOUND</p>
      <h1>This scene is still being imagined.</h1>
      <Link className="button button-primary" to="/">
        <ArrowLeft size={16} aria-hidden="true" /> Back to the beginning
      </Link>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/studio" element={<StudioAccessGate><StudioPage /></StudioAccessGate>} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/dashboard" element={<UserDashboardPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/admin/*" element={<AdminPortalPage />} />
      <Route path="/terms" element={<LegalPage document="terms" />} />
      <Route path="/privacy" element={<LegalPage document="privacy" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
