import { ArrowUpRight, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { SupportConversation, SupportMessage } from '../lib/supportInbox'

type SupportThreadProps = {
  conversation: SupportConversation
  messages: SupportMessage[]
  currentUserId: string
  adminView?: boolean
  busy?: boolean
  onSend: (body: string) => Promise<void>
}

export default function SupportThread({ conversation, messages, currentUserId, adminView = false, busy = false, onSend }: SupportThreadProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setDraft(''); setError('') }, [conversation.id])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || busy || conversation.status === 'closed') return
    setError('')
    try {
      await onSend(body)
      setDraft('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The message could not be sent. Try again.')
    }
  }

  return (
    <section className="support-thread" aria-label={`Conversation: ${conversation.subject}`}>
      <header className="support-thread-heading">
        <div>
          <p className="tool-eyebrow">{conversation.category.replace('-', ' ').toUpperCase()} · {conversation.status.toUpperCase()}</p>
          <h2>{conversation.subject}</h2>
          {adminView && <p className="support-thread-email">{conversation.owner_email}</p>}
        </div>
        {adminView && <span className="support-live-badge"><span /> Live inbox</span>}
      </header>
      <div className="support-message-list" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 ? <p className="support-empty-thread">Your conversation is ready. Send a message to begin.</p> : messages.map((message) => (
          <article className={`support-message ${message.sender_id === currentUserId ? 'support-message-own' : ''}`} key={message.id}>
            <div className="support-message-meta">
              <strong>{message.sender_role === 'admin' ? 'Kinetelle support' : adminView ? conversation.owner_email : 'You'}</strong>
              <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
            </div>
            <p>{message.body}</p>
          </article>
        ))}
      </div>
      <form className="support-reply-form" onSubmit={(event) => void submit(event)}>
        <label className="visually-hidden" htmlFor="support-reply">Write a message</label>
        <textarea id="support-reply" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder={conversation.status === 'closed' ? 'This conversation is closed.' : 'Write your message…'} disabled={busy || conversation.status === 'closed'} />
        <div className="support-reply-footer">
          {error ? <p className="camera-error" role="alert">{error}</p> : <p>{draft.trim().length}/4000</p>}
          <button className="button button-primary" type="submit" disabled={!draft.trim() || busy || conversation.status === 'closed'}>
            <Send size={14} aria-hidden="true" />{busy ? 'Sending…' : 'Send'} <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  )
}
