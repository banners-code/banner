import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { LEGAL_DOCUMENT_VERSION } from '../lib/legal'

type LegalDocument = 'terms' | 'privacy'

function LegalLayout({ document, title, summary, children }: {
  document: LegalDocument
  title: string
  summary: string
  children: ReactNode
}) {
  const otherDocument = document === 'terms' ? { path: '/privacy', label: 'Privacy Policy' } : { path: '/terms', label: 'Terms of Service' }

  return (
    <main className="legal-page">
      <div className="legal-grain" aria-hidden="true" />
      <header className="legal-header">
        <BrandMark />
        <nav aria-label="Legal page navigation">
          <Link to="/"><ArrowLeft size={14} aria-hidden="true" /> Kinetelle home</Link>
          <Link to="/account">Sign in <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </nav>
      </header>

      <article className="legal-document">
        <div className="legal-document-topline">
          <p className="eyebrow"><span className="eyebrow-rule" /> KINETELLE / {document === 'terms' ? 'TERMS' : 'PRIVACY'}</p>
          <Link to={otherDocument.path}>{otherDocument.label} <ArrowUpRight size={13} aria-hidden="true" /></Link>
        </div>
        <h1>{title}</h1>
        <p className="legal-effective">Effective 5 November 2026 <span>·</span> Version {LEGAL_DOCUMENT_VERSION}</p>
        <p className="legal-summary">{summary}</p>
        <div className="legal-content">{children}</div>
        <aside className="legal-contact-card">
          <p className="legal-kicker">QUESTIONS OR A REPORT?</p>
          <h2>Contact the Kinetelle team.</h2>
          <p>Use the contact options on our homepage, or sign in and send a private message to Support.</p>
          <div><Link to="/#contact">View contact options <ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/support">Open Support <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        </aside>
      </article>

      <footer className="legal-footer">
        <BrandMark />
        <span>© 2026 KINETELLE STUDIO</span>
        <nav aria-label="Legal links"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link></nav>
      </footer>
    </main>
  )
}

function TermsDocument() {
  return (
    <LegalLayout
      document="terms"
      title="Terms of Service"
      summary="These terms explain the rules for using Kinetelle Studio. Creating an account requires you to agree to them. If you do not agree, do not create an account or start a live session."
    >
      <section>
        <h2>1. Who may use Kinetelle</h2>
        <p>You must be at least 18 years old to create an account or use Kinetelle. By signing up, you confirm that you are 18 or older. We may close an account if we have a reasonable basis to believe the age confirmation was false.</p>
      </section>
      <section>
        <h2>2. Your account</h2>
        <p>Provide accurate account information, keep your sign-in credentials private, and tell us promptly if you suspect someone else has used your account. You are responsible for activity carried out through your account, except where applicable law says otherwise.</p>
      </section>
      <section>
        <h2>3. Use the Studio lawfully and responsibly</h2>
        <p>You may use Kinetelle only for lawful, authorized creative work. You must not use it to:</p>
        <ul>
          <li>Threaten, harass, defraud, exploit, defame, or unlawfully discriminate against anyone.</li>
          <li>Create or distribute sexual content involving a minor, or sexual or intimate imagery of a person without their clear consent.</li>
          <li>Impersonate someone, create a deceptive likeness, or manipulate a real person's image, voice, or video to harm, deceive, or violate their privacy.</li>
          <li>Upload or transform content you do not have permission to use, including material that infringes copyright, privacy, publicity, or other rights.</li>
          <li>Break applicable law, evade a lawful disclosure requirement, or help someone else do so.</li>
          <li>Probe, disrupt, overload, reverse engineer, or bypass security or access controls in the service.</li>
        </ul>
        <p>Before using a real person's image, voice, or video, obtain any permission required by law and tell them when the result could otherwise mislead them. You are responsible for deciding whether to publish or rely on an AI-generated result.</p>
      </section>
      <section>
        <h2>4. Your content and permissions</h2>
        <p>You keep the rights you already have in prompts, reference images, and other material you provide. You confirm that you have the rights and permissions needed to submit that material and use the resulting output.</p>
        <p>You give Kinetelle permission to handle your material only as needed to provide, secure, and support the service, including sending selected live video, audio, and reference images to Decart when you start a live transformation. Decart processes those inputs under its own applicable terms and privacy policy. Kinetelle does not claim ownership of your inputs or output.</p>
      </section>
      <section>
        <h2>5. AI output and service availability</h2>
        <p>AI output can be inaccurate, unexpected, similar to output generated for someone else, or unsuitable for your purpose. Review it before using or sharing it. Kinetelle is a creative tool, not legal, medical, financial, identity, or other professional advice.</p>
        <p>We work to keep the service available, but live processing depends on browsers, networks, Supabase, Decart, and other systems. We do not promise uninterrupted availability or a particular transformation result.</p>
      </section>
      <section>
        <h2>6. Manual payments and live time</h2>
        <p>If manual funding is enabled, use the payment instructions shown in your signed-in dashboard. When you submit a request, provide the amount paid, payment reference, and a receipt that helps us verify the transfer. A payment request is not an automatic payment confirmation, and live time is added only after an admin reviews and approves it. We may reject a request we cannot reasonably verify. Any mandatory payment, refund, or consumer rights under applicable law still apply.</p>
      </section>
      <section>
        <h2>7. Reports, review, and account action</h2>
        <p>You can report suspected misuse through the contact options on the homepage or through Support. We may review reports and available evidence. A report alone does not guarantee an automatic ban, but we may temporarily restrict an account while investigating a credible or urgent safety concern.</p>
        <p>When we reasonably determine that an account has materially or repeatedly broken these terms, we may remove content where possible, issue a warning, suspend access, or permanently ban the account. You may contact Support to ask us to review an account restriction. We may also preserve or disclose information when required by law or necessary to protect people, the service, or legal rights.</p>
      </section>
      <section>
        <h2>8. Responsibility and limits</h2>
        <p>You are responsible for your inputs, permissions, and decisions about how you use or share outputs. Kinetelle is not responsible for unlawful or unauthorized acts that a user carries out with the service. To the extent permitted by applicable law, we exclude indirect or consequential loss arising from a user's misuse of the service.</p>
        <p>Nothing in these terms excludes liability for Kinetelle's own conduct where the law does not allow that exclusion, or removes any mandatory consumer or data-protection right you have.</p>
      </section>
      <section>
        <h2>9. Changes and contact</h2>
        <p>We may update the service or these terms. If a change materially affects users, we will post the revised terms and take any notice or renewed acceptance steps required by law. The version and effective date appear at the top of this page.</p>
        <p>For questions or to appeal an account decision, use the contact methods on the homepage or <Link to="/support">contact Support</Link>.</p>
      </section>
      <p className="legal-reference-note">Kinetelle sets an 18+ minimum even if a third-party provider permits younger users on its own service.</p>
    </LegalLayout>
  )
}

function PrivacyDocument() {
  return (
    <LegalLayout
      document="privacy"
      title="Privacy Policy"
      summary="This policy describes the information Kinetelle Studio uses, why it is used, and the choices available to you. It reflects the current account, support, and live Studio features."
    >
      <section>
        <h2>1. Who is responsible for your data</h2>
        <p>Kinetelle Studio (“Kinetelle,” “we,” or “us”) is the service operator responsible for the personal information it determines how to use. For privacy questions or requests, use the current contact options in the homepage Contact section. Signed-in users can also message Support.</p>
      </section>
      <section>
        <h2>2. Information we use</h2>
        <ul>
          <li><strong>Account information:</strong> email address, authentication identifiers, and the versions of the Terms and Privacy Policy you accepted, the date of acceptance, and your 18+ confirmation. Supabase provides account authentication; Kinetelle does not receive your plaintext password.</li>
          <li><strong>Studio information:</strong> prompts, chosen direction, aspect preference, and saved directions you choose to store.</li>
          <li><strong>Usage and account records:</strong> live-session start/end and heartbeat times, calculated duration, and any time-credit grants recorded for your account.</li>
          <li><strong>Manual funding requests:</strong> the amount and currency you report, payment reference, receipt image or PDF, optional note, review outcome, admin response, and live time granted after approval. Receipt files are stored in a private bucket.</li>
          <li><strong>Support messages:</strong> conversation subject, category, message text, account email, and replies.</li>
          <li><strong>Public site content:</strong> administrators may upload images or videos for the public homepage. Uploaded homepage media is publicly accessible as site content.</li>
          <li><strong>Technical records:</strong> request route, method, status, request identifier, and processing duration for service diagnostics and security. The app's API logs do not include request bodies or access tokens. Hosting providers may keep their own network or access logs.</li>
        </ul>
      </section>
      <section>
        <h2>3. Camera, microphone, and reference images</h2>
        <p>Your camera preview stays in your browser until you choose to start a live transformation. When you start one, the browser sends the active camera and microphone stream, plus any reference image you selected, to Decart for processing. Kinetelle's application server issues a short-lived connection token; it does not receive or store the raw stream. Kinetelle does not save raw camera, microphone, or reference-image files in its Supabase database.</p>
        <p>Decart receives the media you choose to send and handles it under its own applicable terms and privacy policy. Review <a href="https://decart.ai/privacy-policy" target="_blank" rel="noreferrer">Decart's Privacy Policy</a> and <a href="https://decart.ai/terms" target="_blank" rel="noreferrer">Terms of Use</a> before going live. Provider processing and retention are outside Kinetelle's control.</p>
      </section>
      <section>
        <h2>4. Why we use information</h2>
        <p>We use account details to create and secure accounts; Studio data to restore features you choose to save; usage records to show session time and account balances; payment references and receipts to verify manual funding requests and post accurate live time; and support messages to answer requests. We also use limited technical records to operate the service, investigate abuse, protect users, and meet legal obligations.</p>
        <p>Camera and microphone access are requested by your browser. Sending media to Decart happens only after you choose to start a live transformation. Where applicable law requires consent or another legal basis, we rely on that basis for the relevant processing.</p>
      </section>
      <section>
        <h2>5. Service providers and international processing</h2>
        <p>We use Supabase for authentication and database services. We use Decart to process live transformations you start. The selected hosting provider operates the Kinetelle application server. These providers process information to provide their services to us and may process it in locations outside your country. Their own privacy terms and the service configuration determine their handling; we do not control independent provider systems.</p>
        <p>We may disclose information when required by law, to respond to valid legal requests, to protect users or the service, or to address a credible safety or rights violation.</p>
      </section>
      <section>
        <h2>6. Retention and security</h2>
        <p>We retain account information while the account is active and as needed to provide the service. Saved Studio information remains until you delete it or request account deletion. Session, credit, support, manual funding, and receipt records are kept as needed to operate accounts, verify or reconcile payments, resolve disputes, address abuse, and meet legal obligations. Technical log retention also depends on the hosting provider's configuration.</p>
        <p>We use access controls and other reasonable safeguards, but no internet service can guarantee absolute security. If you believe your account is at risk, change your password and contact Support.</p>
      </section>
      <section>
        <h2>7. Your choices and privacy rights</h2>
        <p>You can stop a live session at any time and choose whether to save prompts or preferences. Account settings let you export saved Studio data or delete saved directions and preferences. To request access to other information, correction, deletion of your account, restriction or objection to processing, or another privacy right, use the contact options on the homepage or message Support.</p>
        <p>Depending on the law that applies, you may have rights to be informed, access and correct information, request erasure or restriction, object to processing, withdraw consent, and receive portable data. In Nigeria, the Nigeria Data Protection Act 2023 sets out data-subject rights, including the right to lodge a complaint with the Nigeria Data Protection Commission. See the <a href="https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf" target="_blank" rel="noreferrer">Act</a> and the <a href="https://ndpc.gov.ng/" target="_blank" rel="noreferrer">NDPC</a>.</p>
      </section>
      <section>
        <h2>8. Age and updates</h2>
        <p>Kinetelle accounts are for adults 18 and older. We collect a self-confirmation at signup, not a date of birth or identity document. If we learn that an account belongs to someone under 18, we may suspend it and take steps to delete associated personal information where the law allows.</p>
        <p>We may update this policy when the service or legal requirements change. The current version and effective date are shown at the top of this page. Material changes may require renewed notice or consent.</p>
      </section>
    </LegalLayout>
  )
}

export default function LegalPage({ document }: { document: LegalDocument }) {
  return document === 'terms' ? <TermsDocument /> : <PrivacyDocument />
}
