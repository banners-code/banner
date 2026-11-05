import { ArrowLeft, Bell, Check, Inbox, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import SupportThread from '../components/SupportThread'
import {
  hasSupportAdminAccess,
  loadPublicSupportSettings,
  loadSupportConversations,
  loadSupportMessages,
  removeSupportSubscription,
  saveSupportSettings,
  sendSupportMessage,
  setSupportConversationStatus,
  subscribeToSupportChanges,
  type SupportContactSettings,
  type SupportConversation,
  type SupportMessage,
} from '../lib/supportInbox'
import { supabaseConfigured } from '../lib/supabase'

type AdminPanel = 'inbox' | 'contact'

export default function AdminSupportPage() {
  const { user, loading: authLoading } = useAuth()
  const [adminAccess, setAdminAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<AdminPanel>('inbox')
  const [conversations, setConversations] = useState<SupportConversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [settings, setSettings] = useState<SupportContactSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newMessages, setNewMessages] = useState(0)
  const [browserNotifications, setBrowserNotifications] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null

  const refreshConversations = useCallback(async () => {
    const rows = await loadSupportConversations()
    setConversations(rows)
    setSelectedId((current) => current || rows[0]?.id || '')
  }, [])

  const refreshMessages = useCallback(async () => {
    if (!selectedId) { setMessages([]); return }
    setMessages(await loadSupportMessages(selectedId))
  }, [selectedId])

  const refreshSettings = useCallback(async () => {
    setSettings(await loadPublicSupportSettings())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user || !supabaseConfigured) {
      setAdminAccess(false)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void hasSupportAdminAccess().then(async (allowed) => {
      if (!active) return
      setAdminAccess(allowed)
      if (!allowed) return
      await Promise.all([refreshConversations(), refreshSettings()])
    }).catch((cause) => {
      if (active) {
        setAdminAccess(false)
        setError(cause instanceof Error ? cause.message : 'Support admin access could not be checked.')
      }
    }).finally(() => { if (active) setLoading(false) })
    const channel = subscribeToSupportChanges((payload) => {
      const event = payload as { table?: string; new?: { sender_role?: string } }
      if (event.table === 'support_messages' && event.new?.sender_role === 'customer') {
        setNewMessages((count) => count + 1)
        setNotice('A customer sent a new support message.')
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New Kinetelle support message', { body: 'Open the inbox to read and reply.' })
        }
      }
      void refreshConversations().catch(() => undefined)
      if (event.table === 'support_contact_settings') void refreshSettings().catch(() => undefined)
      if (event.table === 'support_messages') void refreshMessages().catch(() => undefined)
    })
    return () => { active = false; void removeSupportSubscription(channel) }
  }, [authLoading, user, refreshConversations, refreshSettings, refreshMessages])

  useEffect(() => {
    if (!selectedId || !user || adminAccess !== true) return
    void refreshMessages().catch((cause) => setError(cause instanceof Error ? cause.message : 'Conversation messages could not be loaded.'))
  }, [selectedId, user, adminAccess, refreshMessages])

  async function sendReply(body: string) {
    if (!user || !selectedId) return
    setBusy(true)
    try {
      await sendSupportMessage({ conversationId: selectedId, senderId: user.id, body })
      await refreshMessages()
      await refreshConversations()
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(conversation: SupportConversation) {
    setBusy(true)
    setError('')
    try {
      const status = conversation.status === 'open' ? 'closed' : 'open'
      await setSupportConversationStatus(conversation.id, status)
      await refreshConversations()
      setNotice(status === 'closed' ? 'Conversation closed.' : 'Conversation reopened.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Conversation status could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  async function saveContactSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) return
    setBusy(true)
    setError('')
    try {
      const saved = await saveSupportSettings({
        welcome_message: settings.welcome_message.trim(),
        contact_email: settings.contact_email.trim(),
        contact_url: settings.contact_url.trim(),
        contact_label: settings.contact_label.trim(),
        chat_enabled: settings.chat_enabled,
      })
      setSettings(saved)
      setNotice('Public contact details saved. The homepage updates live.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Contact details could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === 'undefined') { setBrowserNotifications('unsupported'); return }
    try {
      setBrowserNotifications(await Notification.requestPermission())
    } catch {
      setBrowserNotifications('denied')
    }
  }

  return (
    <main className="admin-support-page">
      <header className="support-header"><BrandMark /><Link to="/" className="studio-back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to Kinetelle</Link></header>
      <div className="admin-support-main">
        <div className="admin-support-title"><div><p className="eyebrow">KINETELLE / ADMIN</p><h1>Support inbox.</h1></div><div className="admin-support-live-actions"><Link className="button button-outline admin-notification-button" to="/admin"><Settings2 size={14} aria-hidden="true" /> Site control</Link><span className="support-live-badge"><span /> Realtime updates</span><button className="button button-outline admin-notification-button" type="button" onClick={() => void enableBrowserNotifications()} disabled={browserNotifications === 'unsupported' || browserNotifications === 'denied'}><Bell size={14} aria-hidden="true" />{browserNotifications === 'granted' ? 'Browser alerts on' : browserNotifications === 'denied' ? 'Alerts blocked' : browserNotifications === 'unsupported' ? 'Alerts unavailable' : 'Enable browser alerts'}</button></div></div>
        {loading || authLoading ? <p className="support-loading">Checking admin access…</p>
          : !user || !supabaseConfigured ? <section className="support-gate"><Inbox size={20} aria-hidden="true" /><h2>Sign in to continue</h2><p>The support inbox is available to designated Kinetelle administrators.</p><Link className="button button-primary" to="/account?next=%2Fadmin%2Fsupport">Sign in</Link></section>
            : !adminAccess ? <section className="support-gate"><Inbox size={20} aria-hidden="true" /><h2>Admin access isn’t enabled</h2><p>Grant your account the support admin role using the setup instructions, then sign in again.</p><Link className="text-link" to="/">Return to Kinetelle <ArrowLeft size={14} aria-hidden="true" /></Link></section>
              : <>
                  <nav className="admin-support-tabs" aria-label="Support admin sections">
                    <button className={panel === 'inbox' ? 'is-active' : ''} type="button" onClick={() => setPanel('inbox')}><Inbox size={15} aria-hidden="true" /> Inbox {newMessages > 0 && <span className="admin-notification-count">{newMessages}</span>}</button>
                    <button className={panel === 'contact' ? 'is-active' : ''} type="button" onClick={() => setPanel('contact')}><Settings2 size={15} aria-hidden="true" /> Public contact</button>
                  </nav>
                  {notice && <p className="support-live-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></p>}
                  {error && <p className="camera-error" role="alert">{error}</p>}
                  {panel === 'inbox' ? <div className="admin-inbox-layout">
                    <aside className="support-sidebar admin-inbox-sidebar">
                      <div className="support-sidebar-heading"><h2>Conversations</h2><span>{conversations.length}</span></div>
                      {conversations.length === 0 ? <p className="support-sidebar-empty">New customer conversations will appear here.</p> : <div className="support-conversation-list">{conversations.map((conversation) => <button className={`support-conversation-choice ${conversation.id === selectedId ? 'is-selected' : ''}`} type="button" key={conversation.id} onClick={() => { setSelectedId(conversation.id); setNewMessages(0); setNotice('') }}><span><strong>{conversation.subject}</strong><small>{conversation.owner_email} · {conversation.status}</small></span><time>{new Date(conversation.updated_at).toLocaleDateString()}</time></button>)}</div>}
                    </aside>
                    <div className="support-content">
                      {selectedConversation && user ? <><SupportThread conversation={selectedConversation} messages={messages} currentUserId={user.id} adminView busy={busy} onSend={sendReply} /><div className="support-admin-thread-actions"><span>Customer topic: {selectedConversation.category.replace('-', ' ')}</span><button className="button button-outline" type="button" disabled={busy} onClick={() => void toggleStatus(selectedConversation)}>{selectedConversation.status === 'open' ? 'Close conversation' : 'Reopen conversation'}</button></div></>
                        : <section className="support-empty-state"><Inbox size={21} aria-hidden="true" /><h2>No conversation selected</h2><p>Select a customer message to read and reply.</p></section>}
                    </div>
                  </div> : settings && <section className="support-settings-panel"><div><p className="tool-eyebrow">SHOWN ON THE HOMEPAGE</p><h2>Contact details</h2><p>Edit these details to update the public Contact section immediately.</p></div><form onSubmit={(event) => void saveContactSettings(event)}>
                    <label htmlFor="support-welcome">Welcome message</label><textarea id="support-welcome" rows={3} maxLength={500} value={settings.welcome_message} onChange={(event) => setSettings({ ...settings, welcome_message: event.target.value })} required />
                    <label htmlFor="support-contact-email">Public support email</label><input id="support-contact-email" type="email" maxLength={254} value={settings.contact_email} onChange={(event) => setSettings({ ...settings, contact_email: event.target.value })} placeholder="Leave blank to hide an email address" />
                    <label htmlFor="support-contact-url">Public contact link</label><input id="support-contact-url" type="url" maxLength={500} value={settings.contact_url} onChange={(event) => setSettings({ ...settings, contact_url: event.target.value })} placeholder="https://…" />
                    <label htmlFor="support-contact-label">Link label</label><input id="support-contact-label" maxLength={80} value={settings.contact_label} onChange={(event) => setSettings({ ...settings, contact_label: event.target.value })} required />
                    <label className="support-chat-toggle"><input type="checkbox" checked={settings.chat_enabled} onChange={(event) => setSettings({ ...settings, chat_enabled: event.target.checked })} /><span>Enable customer conversations</span></label>
                    <button className="button button-primary" type="submit" disabled={busy}><Check size={15} aria-hidden="true" />{busy ? 'Saving…' : 'Save contact details'}</button>
                  </form></section>}
                </>}
      </div>
    </main>
  )
}
