import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import { loadReports, submitReport, type AbuseReport } from '../lib/moderation'

export default function ReportPage() {
  const { user, loading } = useAuth()
  const [identity,setIdentity] = useState('')
  const [details,setDetails] = useState('')
  const [reports,setReports] = useState<AbuseReport[]>([])
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(() => { if (!user) return; let active=true; void loadReports().then((data) => { if (active) setReports(data.filter((row) => row.reporter_id===user.id)) }).catch(() => { if (active) setError('Reports are unavailable. Please contact Support.') }); return () => { active=false } },[user?.id])
  async function send(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { await submitReport(identity,details); setIdentity(''); setDetails(''); setNotice('Your report was submitted for review.'); setReports((await loadReports()).filter((row) => row.reporter_id===user?.id)) }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Report could not be submitted.') }
    finally { setBusy(false) }
  }
  if (!loading && !user) return <Navigate to="/account?next=%2Freport" replace />
  return <main className="account-page"><header className="account-header"><BrandMark /><Link to="/support">Support inbox</Link></header><section className="account-card moderation-report-page"><p className="eyebrow">TRUST / SAFETY</p><h1>Report misuse.</h1><p className="account-intro">Tell us which account or content concerns you and what happened. Reports are reviewed before account action. Avoid including passwords, bank details, or unrelated private information.</p><form className="admin-editor-form" onSubmit={(event) => void send(event)}><label className="admin-field-label">Reported email, user ID, or content link<input value={identity} onChange={(event) => setIdentity(event.target.value)} minLength={3} maxLength={254} required /></label><label className="admin-field-label">What happened?<textarea rows={5} value={details} onChange={(event) => setDetails(event.target.value)} minLength={10} maxLength={4000} required /></label>{error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="account-success" role="status">{notice}</p>}<button className="button button-primary" disabled={busy || loading}>{busy ? 'Submitting…' : 'Submit report'}</button></form><div className="manual-funding-history"><h3>Your reports</h3>{reports.map((report) => <article className="moderation-detail" key={report.id}><strong>{report.reported_identity}</strong><p>{report.status} · {new Date(report.created_at).toLocaleDateString()}</p>{report.admin_note && <p>{report.admin_note}</p>}</article>)}{!reports.length && <p className="admin-field-help">No reports submitted yet.</p>}</div></section></main>
}
