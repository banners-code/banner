import { ImagePlus, LoaderCircle, Plus, Save, Trash2, Video } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import HomepageMedia from '../../components/HomepageMedia'
import { saveHomepageSettings, uploadHomepageMedia, type HomepageFAQ, type HomepageSettings, type HomepageTextPair, type MediaKind } from '../../lib/homepageContent'

type EditableHomepage = Omit<HomepageSettings, 'id' | 'updated_at'>

const fallbackSteps: HomepageTextPair[] = [
  { title: 'Preview your source', copy: 'Check your framing locally in the browser.' },
  { title: 'Shape the direction', copy: 'Refine a prompt and add an optional image reference.' },
  { title: 'Go live when ready', copy: 'Start a live session only when you choose to.' },
]
const fallbackFeatures: HomepageTextPair[] = [
  { title: 'A camera preview before you go live', copy: 'Check your framing in the browser and choose an available camera.' },
]
const fallbackFAQs: HomepageFAQ[] = [
  { question: 'What do I need to use Kinetelle Studio?', answer: 'Use a modern browser with a webcam and microphone.' },
]

function editableFromSettings(settings: HomepageSettings): EditableHomepage {
  const { id: _id, updated_at: _updatedAt, ...editable } = settings
  return {
    ...editable,
    workflow_steps: Array.isArray(editable.workflow_steps) && editable.workflow_steps.length ? editable.workflow_steps : fallbackSteps,
    feature_cards: Array.isArray(editable.feature_cards) && editable.feature_cards.length ? editable.feature_cards : fallbackFeatures,
    faq_items: Array.isArray(editable.faq_items) && editable.faq_items.length ? editable.faq_items : fallbackFAQs,
  }
}

function TextPairList({ title, items, onChange, maxItems }: { title: string; items: HomepageTextPair[]; onChange: (items: HomepageTextPair[]) => void; maxItems: number }) {
  return (
    <fieldset className="admin-list-editor">
      <legend>{title}</legend>
      {items.map((item, index) => <div className="admin-list-editor-row" key={index}>
        <label className="admin-field-label">Item {index + 1} title<input maxLength={120} value={item.title} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} required /></label>
        <label className="admin-field-label">Description<textarea rows={2} maxLength={500} value={item.copy} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, copy: event.target.value } : row))} required /></label>
        <button className="admin-remove-row" type="button" onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))} disabled={items.length <= 1} aria-label={`Remove item ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button>
      </div>)}
      <button className="admin-add-row" type="button" onClick={() => onChange([...items, { title: '', copy: '' }])} disabled={items.length >= maxItems}><Plus size={14} aria-hidden="true" /> Add item</button>
    </fieldset>
  )
}

function FAQList({ items, onChange }: { items: HomepageFAQ[]; onChange: (items: HomepageFAQ[]) => void }) {
  return (
    <fieldset className="admin-list-editor">
      <legend>Questions and answers</legend>
      {items.map((item, index) => <div className="admin-list-editor-row admin-faq-editor-row" key={index}>
        <label className="admin-field-label">Question {index + 1}<input maxLength={200} value={item.question} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, question: event.target.value } : row))} required /></label>
        <label className="admin-field-label">Answer<textarea rows={3} maxLength={1200} value={item.answer} onChange={(event) => onChange(items.map((row, rowIndex) => rowIndex === index ? { ...row, answer: event.target.value } : row))} required /></label>
        <button className="admin-remove-row" type="button" onClick={() => onChange(items.filter((_, rowIndex) => rowIndex !== index))} disabled={items.length <= 1} aria-label={`Remove question ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button>
      </div>)}
      <button className="admin-add-row" type="button" onClick={() => onChange([...items, { question: '', answer: '' }])} disabled={items.length >= 10}><Plus size={14} aria-hidden="true" /> Add question</button>
    </fieldset>
  )
}

function mediaKindFor(file: File): MediaKind {
  return file.type.startsWith('video/') ? 'video' : 'image'
}

function MediaSettings({
  label,
  kind,
  url,
  file,
  onKind,
  onUrl,
  onFile,
}: {
  label: string
  kind: MediaKind
  url: string
  file: File | null
  onKind: (kind: MediaKind) => void
  onUrl: (url: string) => void
  onFile: (file: File | null) => void
}) {
  const [filePreview, setFilePreview] = useState('')
  useEffect(() => {
    if (!file) { setFilePreview(''); return }
    const url = URL.createObjectURL(file)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const allowed = kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm'
  return (
    <fieldset className="admin-media-field">
      <legend>{label}</legend>
      <div className="admin-media-controls">
        <label className="admin-field-label">Media type
          <select value={kind} onChange={(event) => { onKind(event.target.value as MediaKind); onFile(null) }}>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>
        <label className="admin-field-label">Direct media URL
          <input type="url" value={url} onChange={(event) => onUrl(event.target.value)} placeholder="https://example.com/media.mp4" />
        </label>
        <label className="admin-upload-control">
          {kind === 'video' ? <Video size={15} aria-hidden="true" /> : <ImagePlus size={15} aria-hidden="true" />}
          <span>{file ? file.name : `Upload ${kind}`}</span>
          <input type="file" accept={allowed} onChange={(event) => {
            const selected = event.target.files?.[0] ?? null
            if (selected) onKind(mediaKindFor(selected))
            onFile(selected)
            event.currentTarget.value = ''
          }} />
        </label>
      </div>
      <p className="admin-field-help">Use a direct HTTPS link to an image or MP4/WebM file. Uploads support JPG, PNG, WebP, MP4, or WebM.</p>
      {(url || file) && <div className="admin-media-preview-wrap"><span>PREVIEW</span>
        {file && file.type.startsWith('image/')
          ? <img className="admin-media-preview" src={filePreview} alt={`${label} upload preview`} />
          : file && file.type.startsWith('video/')
            ? <video className="admin-media-preview" src={filePreview} muted controls playsInline />
            : <HomepageMedia kind={kind} url={url} alt={`${label} preview`} className="admin-media-preview" controls />}
      </div>}
    </fieldset>
  )
}

function validMediaUrl(value: string) {
  if (!value.trim()) return true
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
  } catch {
    return false
  }
}

export default function HomepageEditor({ initial, onSaved }: { initial: HomepageSettings; onSaved: (settings: HomepageSettings) => void }) {
  const [draft, setDraft] = useState<EditableHomepage>(() => editableFromSettings(initial))
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [demoFile, setDemoFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setDraft(editableFromSettings(initial))
  }, [initial])

  const edit = <Key extends keyof EditableHomepage>(key: Key, value: EditableHomepage[Key]) => setDraft((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!validMediaUrl(draft.hero_media_url) || !validMediaUrl(draft.demo_media_url)) {
      setError('Media links must use HTTPS (HTTP is allowed only on localhost).')
      return
    }
    if (heroFile && heroFile.size > (heroFile.type.startsWith('video/') ? 100 : 15) * 1024 * 1024) {
      setError('The hero image limit is 15 MB and the hero video limit is 100 MB.')
      return
    }
    if (demoFile && demoFile.size > (demoFile.type.startsWith('video/') ? 100 : 15) * 1024 * 1024) {
      setError('The demo image limit is 15 MB and the demo video limit is 100 MB.')
      return
    }

    setBusy(true)
    try {
      const next = { ...draft }
      if (heroFile) next.hero_media_url = await uploadHomepageMedia(heroFile, 'hero')
      if (demoFile) next.demo_media_url = await uploadHomepageMedia(demoFile, 'demo')
      const saved = await saveHomepageSettings(next)
      setHeroFile(null)
      setDemoFile(null)
      onSaved(saved)
      setNotice('Homepage content saved. The public page updates live.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Homepage content could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="admin-editor-form" onSubmit={(event) => void submit(event)}>
      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / HERO</p><h2>Opening message</h2><p>Edit the first message people see on the Kinetelle homepage.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Eyebrow <input maxLength={80} value={draft.hero_eyebrow} onChange={(event) => edit('hero_eyebrow', event.target.value)} required /></label>
          <label className="admin-field-label">Headline, first line <input maxLength={100} value={draft.hero_title_line_one} onChange={(event) => edit('hero_title_line_one', event.target.value)} required /></label>
          <label className="admin-field-label">Headline, second line <input maxLength={100} value={draft.hero_title_line_two} onChange={(event) => edit('hero_title_line_two', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Introduction <textarea rows={3} maxLength={500} value={draft.hero_intro} onChange={(event) => edit('hero_intro', event.target.value)} required /></label>
          <label className="admin-field-label">Primary action label <input maxLength={60} value={draft.hero_primary_action} onChange={(event) => edit('hero_primary_action', event.target.value)} required /></label>
          <label className="admin-field-label">Secondary action label <input maxLength={80} value={draft.hero_secondary_action} onChange={(event) => edit('hero_secondary_action', event.target.value)} required /></label>
        </div>
        <MediaSettings label="Hero image or video" kind={draft.hero_media_kind} url={draft.hero_media_url} file={heroFile} onKind={(value) => edit('hero_media_kind', value)} onUrl={(value) => edit('hero_media_url', value)} onFile={setHeroFile} />
      </section>

      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / HOW IT WORKS</p><h2>Workflow section</h2><p>Edit the section heading and the numbered steps. Keep the directions accurate to the current product.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Eyebrow <input maxLength={80} value={draft.workflow_eyebrow} onChange={(event) => edit('workflow_eyebrow', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, first line <input maxLength={100} value={draft.workflow_heading_one} onChange={(event) => edit('workflow_heading_one', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, second line <input maxLength={100} value={draft.workflow_heading_two} onChange={(event) => edit('workflow_heading_two', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Section introduction <textarea rows={2} maxLength={500} value={draft.workflow_intro} onChange={(event) => edit('workflow_intro', event.target.value)} required /></label>
        </div>
        <TextPairList title="Steps" items={draft.workflow_steps} maxItems={6} onChange={(value) => edit('workflow_steps', value)} />
      </section>

      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / FEATURES</p><h2>Feature section</h2><p>Manage the section heading and each feature card.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Eyebrow <input maxLength={80} value={draft.feature_eyebrow} onChange={(event) => edit('feature_eyebrow', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, first line <input maxLength={100} value={draft.feature_heading_one} onChange={(event) => edit('feature_heading_one', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, second line <input maxLength={100} value={draft.feature_heading_two} onChange={(event) => edit('feature_heading_two', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Section introduction <textarea rows={2} maxLength={500} value={draft.feature_intro} onChange={(event) => edit('feature_intro', event.target.value)} required /></label>
        </div>
        <TextPairList title="Feature cards" items={draft.feature_cards} maxItems={8} onChange={(value) => edit('feature_cards', value)} />
      </section>

      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / DEMONSTRATION</p><h2>Featured demo</h2><p>Add a representative image or a direct MP4/WebM video link. This is presentation media, not live AI output.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Demo title <input maxLength={120} value={draft.demo_title} onChange={(event) => edit('demo_title', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Demo description <textarea rows={3} maxLength={500} value={draft.demo_description} onChange={(event) => edit('demo_description', event.target.value)} required /></label>
        </div>
        <MediaSettings label="Demo image or video" kind={draft.demo_media_kind} url={draft.demo_media_url} file={demoFile} onKind={(value) => edit('demo_media_kind', value)} onUrl={(value) => edit('demo_media_url', value)} onFile={setDemoFile} />
      </section>

      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / FAQ</p><h2>Frequently asked questions</h2><p>Manage the visible answers customers can expand on the homepage.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Eyebrow <input maxLength={80} value={draft.faq_eyebrow} onChange={(event) => edit('faq_eyebrow', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, first line <input maxLength={100} value={draft.faq_heading_one} onChange={(event) => edit('faq_heading_one', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, second line <input maxLength={100} value={draft.faq_heading_two} onChange={(event) => edit('faq_heading_two', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Section introduction <textarea rows={2} maxLength={500} value={draft.faq_intro} onChange={(event) => edit('faq_intro', event.target.value)} required /></label>
        </div>
        <FAQList items={draft.faq_items} onChange={(value) => edit('faq_items', value)} />
      </section>

      <section className="admin-editor-section">
        <div className="admin-editor-heading"><div><p className="tool-eyebrow">HOMEPAGE / CLOSING MESSAGE</p><h2>Final call to action</h2><p>Edit the closing text above the site footer.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field-label">Heading, first line <input maxLength={100} value={draft.closing_heading_one} onChange={(event) => edit('closing_heading_one', event.target.value)} required /></label>
          <label className="admin-field-label">Heading, second line <input maxLength={100} value={draft.closing_heading_two} onChange={(event) => edit('closing_heading_two', event.target.value)} required /></label>
          <label className="admin-field-label admin-field-wide">Introduction <textarea rows={3} maxLength={500} value={draft.closing_copy} onChange={(event) => edit('closing_copy', event.target.value)} required /></label>
        </div>
      </section>

      {error && <p className="account-error" role="alert">{error}</p>}
      {notice && <p className="account-success" role="status">{notice}</p>}
      <button className="button button-primary admin-save-button" type="submit" disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin-icon" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
        {busy ? 'Saving changes…' : 'Save homepage changes'}
      </button>
    </form>
  )
}
