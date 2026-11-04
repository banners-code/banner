import { ArrowLeft, MessageCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import BrandMark from '../components/BrandMark'
import SupportThread from '../components/SupportThread'
import {
  createSupportConversation,
  loadPublicSupportSettings,
  loadSupportConversations,
  loadSupportMessages,
  removeSupportSubscription,
  sendSupportMessage,
  subscribeToContactSettings,
  subscribeToSupportChanges,
  type SupportCategory,
  type SupportContactSettings,
  type SupportConversation,
  type SupportMessage,
} from '../lib/supportInbox'
import { supabaseConfigured } from '../lib/supabase'

const categoryLabels: Record<SupportCategory, string> = {
  account: 'Account access',
  camera: 'Camera or microphone',
  'live-session': 'Live Decart session',
  technical: 'Technical issue',
  feedback: 'Feedback or idea',
  other: 'Other',
}

export default function SupportPage() {
  const { user, loading: authLoading } = useAuth()
  const [conversations, setConversations] = useState<SupportConversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [settings, setSettings] = useState<SupportContactSettings | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [newConversation, setNewConversation] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<SupportCategory>('other')
  const [firstMessage, setFirstMessage] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedConversation = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) ?? null, [conversations, selectedId])

  const refreshConversations = useCallback(async () => {
    const items = await loadSupportConversations()
    setConversations(items)
    setSelectedId((current) => current || items[0]?.id || '')
  }, [])

  const refreshMessages = useCallback(async () => {
    if (!selectedId) { setMessages([]); return }
    setMessages(await loadSupportMessages(selectedId))
  }, [selectedId])

  useEffect(() => {
    if (!supabaseConfigured) { setSettingsReady(true); return }
    let active = true
    const refresh = () => { void loadPublicSupportSettings().then((value) => { if (active) setSettings(value) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Support details are unavailable.') }).finally(() => { if (active) setSettingsReady(true) }) }
    refresh()
    const channel = subscribeToContactSettings(refresh)
    return () => { active = false; void removeSupportSubscription(channel) }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user || !supabaseConfigured) { setLoading(false); return }
    let active = true
    setLoading(true)
    void refreshConversations().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Support inbox could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    const channel = subscribeToSupportChanges((payload) => {
      const event = payload as { table?: string; new?: { sender_role?: string; conversation_id?: string } }
      if (event.table === 'support_messages' && event.new?.sender_role === 'admin') setNotice('Kinetelle support sent a reply.')
      void refreshConversations().catch(() => undefined)
      if (!event.new?.conversation_id || event.new.conversation_id === selectedId) void refreshMessages().catch(() => undefined)
    })
    return () => { active = false; void removeSupportSubscription(channel) }
  }, [authLoading, user, refreshConversations, refreshMessages, selectedId])

  useEffect(() => {
    if (!selectedId || !user) return
    void refreshMessages().catch((cause) => setError(cause instanceof Error ? cause.message : 'Messages could not be loaded.'))
  }, [selectedId, user, refreshMessages])

  async function startConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user?.email || !subject.trim() || !firstMessage.trim()) return
    setCreating(true)
    setError('')
    try {
      const conversation = await createSupportConversation({ ownerId: user.id, ownerEmail: user.email, category, subject, firstMessage })
      setSubject('')
      setFirstMessage('')
      setNewConversation(false)
      await refreshConversations()
      setSelectedId(conversation.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your message could not be sent.')
    } finally {
      setCreating(false)
    }
  }

  async function sendReply(body: string) {
    if (!user || !selectedId) return
    setSending(true)
    try {
      await sendSupportMessage({ conversationId: selectedId, senderId: user.id, body })
      await refreshMessages()
      await refreshConversations()
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="support-page">
      <header className="support-header"><BrandMark /><Link to="/" className="studio-back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to Kinetelle</Link></header>
      <div className="support-main">
        <div className="support-page-title">
          <div><p className="eyebrow">KINETELLE SUPPORT</p><h1>Contact the studio.</h1></div>
          <p>Send a message and keep the conversation in your account. Replies appear here as they arrive.</p>
        </div>
        {!supabaseConfigured ? <section className="support-gate"><MessageCircle size={20} aria-hidden="true" /><p>Support is unavailable until the account service is configured.</p></section>
          : authLoading ? <p className="support-loading">Checking your account…</p>
            : !user ? <section className="support-gate"><MessageCircle size={20} aria-hidden="true" /><h2>Sign in to contact support</h2><p>Messages and replies are kept in your private support inbox.</p><Link className="button button-primary" to="/account?next=%2Fsupport">Sign in to continue</Link></section>
              : !settingsReady ? <p className="support-loading">Loading support settings…</p>
                : !settings ? <section className="support-gate"><MessageCircle size={20} aria-hidden="true" /><h2>Support is being set up</h2><p>The support database migration has not been applied yet. Please try again later.</p></section>
                : <div className="support-workspace">
                  <aside className="support-sidebar">
                    <div className="support-sidebar-heading"><h2>Your conversations</h2><button className="icon-button" type="button" aria-label="Start a new conversation" title="Start a new conversation" disabled={!settings.chat_enabled} onClick={() => { setNewConversation(true); setSelectedId(''); setError('') }}><Plus size={16} aria-hidden="true" /></button></div>
                    {loading ? <p className="support-loading">Loading messages…</p> : conversations.length === 0 ? <p className="support-sidebar-empty">No conversations yet.</p> : <div className="support-conversation-list">{conversations.map((conversation) => <button className={`support-conversation-choice ${conversation.id === selectedId ? 'is-selected' : ''}`} type="button" key={conversation.id} onClick={() => { setSelectedId(conversation.id); setNewConversation(false); setNotice('') }}><span><strong>{conversation.subject}</strong><small>{categoryLabels[conversation.category]} · {conversation.status}</small></span><time>{new Date(conversation.updated_at).toLocaleDateString()}</time></button>)}</div>}
                  </aside>
                  <div className="support-content">
                    {notice && <p className="support-live-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></p>}
                    {newConversation ? <section className="support-new-conversation"><p className="tool-eyebrow">NEW CONVERSATION</p><h2>How can we help?</h2><p className="support-welcome">{settings.welcome_message}</p><form onSubmit={(event) => void startConversation(event)}><label htmlFor="support-category">Topic</label><select id="support-category" value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label htmlFor="support-subject">Subject</label><input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} required /><label htmlFor="support-first-message">Message</label><textarea id="support-first-message" value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} maxLength={4000} rows={5} required /><div className="support-reply-footer"><p>{error && <span role="alert">{error}</span>}</p><button className="button button-primary" type="submit" disabled={creating || !subject.trim() || !firstMessage.trim()}>{creating ? 'Sending…' : 'Send message'}</button></div></form></section>
                      : selectedConversation && user ? <SupportThread conversation={selectedConversation} messages={messages} currentUserId={user.id} busy={sending} onSend={sendReply} />
                        : <section className="support-empty-state"><MessageCircle size={21} aria-hidden="true" /><h2>{settings.chat_enabled ? 'Start a conversation' : 'New conversations are paused'}</h2><p>{settings.chat_enabled ? 'Ask about your account, camera setup, or live Decart session.' : 'You can still read and reply to conversations already in your inbox.'}</p>{settings.chat_enabled && <button className="button button-primary" type="button" onClick={() => setNewConversation(true)}><Plus size={14} aria-hidden="true" /> New message</button>}</section>}
                    {error && !newConversation && <p className="camera-error" role="alert">{error}</p>}
                  </div>
                </div>}
      </div>
    </main>
  )
}
