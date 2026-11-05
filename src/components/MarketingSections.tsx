import { ArrowUpRight, BookmarkCheck, Camera, ImagePlus, Mail, MessageCircle, Radio, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { HomepageSettings } from '../lib/homepageContent'
import { loadPublicSupportSettings, removeSupportSubscription, subscribeToContactSettings, type SupportContactSettings } from '../lib/supportInbox'
import { supabaseConfigured } from '../lib/supabase'

const features = [
  {
    icon: Camera,
    title: 'A camera preview before you go live',
    copy: 'Check your framing in the browser and choose from the cameras available on your device.',
  },
  {
    icon: Sparkles,
    title: 'One considered starting direction',
    copy: 'Begin with Photorealistic Human, then refine the result with a prompt that fits your frame.',
  },
  {
    icon: ImagePlus,
    title: 'Optional visual references',
    copy: 'Add a JPG, PNG, or WebP image to give the live transformation another visual cue.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Direction you can adjust live',
    copy: 'Update your prompt or reference image while a Decart session is running.',
  },
  {
    icon: Radio,
    title: 'A deliberate path to live output',
    copy: 'Explore a local visual study first. Start a live Decart session only when you choose to.',
  },
  {
    icon: BookmarkCheck,
    title: 'A personal direction library',
    copy: 'When signed in, save, revisit, export, or remove your Studio directions and preferences.',
  },
]

const questions = [
  {
    question: 'What do I need to use Kinetelle Studio?',
    answer: 'Use a modern browser with a webcam and microphone, allow the requested device permissions, and keep a stable internet connection for live processing. You can explore a local camera preview before signing in.',
  },
  {
    question: 'When does my camera leave the browser?',
    answer: 'Your camera and microphone stay in the browser while you preview the source. Starting a live Decart session sends the active stream and any selected reference image to Decart for processing.',
  },
  {
    question: 'Can I change the direction during a live session?',
    answer: 'Yes. You can edit the prompt and replace or remove the optional reference image from the Direction panel while the session is active.',
  },
  {
    question: 'Is the local preview the same as live AI output?',
    answer: 'No. The local preview is a visual demonstration in your browser. The transformed live output begins after you sign in and start a Decart session.',
  },
  {
    question: 'Can I save my prompts and preferences?',
    answer: 'Signed-in users can save and manage directions. Your account also lets you export or delete the Studio directions and preferences stored for you.',
  },
]

export function FeaturesSection({ settings }: { settings?: HomepageSettings | null }) {
  const cards = settings?.feature_cards?.length ? settings.feature_cards : features
  return (
    <section className="features-section shell" id="features" aria-labelledby="features-heading">
      <div className="section-heading features-heading">
        <div>
          <p className="eyebrow">{settings?.feature_eyebrow || 'TOOLS FOR A LIVE FRAME'}</p>
          <h2 id="features-heading">{settings?.feature_heading_one || 'Thoughtful controls.'}<br /><em>{settings?.feature_heading_two || 'Room to experiment.'}</em></h2>
        </div>
        <p className="section-intro">{settings?.feature_intro || 'A camera source, a visual direction, and a clear choice about when your live session begins.'}</p>
      </div>
      <div className="feature-grid">
        {cards.map(({ title, copy }, index) => {
          const Icon = features[index % features.length].icon
          return (
          <article className="feature-card" key={title}>
            <div className="feature-card-top">
              <span className="feature-card-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="feature-card-index">0{index + 1}</span>
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
          )
        })}
      </div>
    </section>
  )
}

export function FAQSection({ settings }: { settings?: HomepageSettings | null }) {
  const items = settings?.faq_items?.length ? settings.faq_items : questions
  return (
    <section className="faq-section shell" id="faq" aria-labelledby="faq-heading">
      <div className="faq-intro">
        <p className="eyebrow">{settings?.faq_eyebrow || 'CLEAR BEFORE YOU CREATE'}</p>
        <h2 id="faq-heading">{settings?.faq_heading_one || 'A few useful'}<br /><em>{settings?.faq_heading_two || 'answers.'}</em></h2>
        <p>{settings?.faq_intro || 'Understand the camera preview, live processing, and saved directions before you begin.'}</p>
      </div>
      <div className="faq-list">
        {items.map(({ question, answer }) => (
          <details className="faq-item" key={question}>
            <summary>
              <span>{question}</span>
              <span className="faq-toggle" aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function safeContactUrl(value: string) {
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''
  } catch {
    return ''
  }
}

export function ContactSection() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<SupportContactSettings | null>(null)

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    const refresh = () => { void loadPublicSupportSettings().then((value) => { if (active) setSettings(value) }).catch(() => undefined) }
    refresh()
    const channel = subscribeToContactSettings(refresh)
    return () => { active = false; void removeSupportSubscription(channel) }
  }, [])

  const contactUrl = settings ? safeContactUrl(settings.contact_url) : ''
  return (
    <section className="contact-section shell" id="contact" aria-labelledby="contact-heading">
      <div className="contact-copy">
        <p className="eyebrow">CONTACT / SUPPORT</p>
        <h2 id="contact-heading">A conversation<br /><em>starts here.</em></h2>
        <p>{settings?.welcome_message ?? 'Questions about your account, camera setup, or live session? Send the Kinetelle team a message.'}</p>
      </div>
      <div className="contact-card">
        <span className="contact-card-icon"><MessageCircle size={18} aria-hidden="true" /></span>
        <h3>Talk with Kinetelle support</h3>
        <p>Send a private message and follow replies in your support inbox.</p>
        {!settings ? <span className="contact-unavailable">Support contact is being set up.</span> : settings.chat_enabled ? <Link className="button button-primary" to={user ? '/support' : '/account?next=%2Fsupport'}>{user ? 'Start a conversation' : 'Sign in to contact us'} <ArrowUpRight size={15} aria-hidden="true" /></Link> : <span className="contact-unavailable">New conversations are temporarily paused.</span>}
        {(settings?.contact_email || contactUrl) && <div className="contact-alternatives">
          {settings?.contact_email && <a href={`mailto:${encodeURIComponent(settings.contact_email)}`}><Mail size={14} aria-hidden="true" />{settings.contact_email}</a>}
          {contactUrl && <a href={contactUrl} target="_blank" rel="noreferrer"><ArrowUpRight size={14} aria-hidden="true" />{settings?.contact_label || 'More ways to reach us'}</a>}
        </div>}
        <span className="contact-update-note">Contact details are managed by the Kinetelle support team.</span>
      </div>
    </section>
  )
}
