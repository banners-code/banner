import { ArrowDown, ArrowRight, ArrowUpRight, Aperture, Focus, MoveUpRight, Sparkles, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import HeroArtwork from '../components/HeroArtwork'
import { ContactSection, FAQSection, FeaturesSection } from '../components/MarketingSections'
import SiteHeader from '../components/SiteHeader'
import { studioPresets } from '../data/presets'

const steps = [
  { number: '01', title: 'Preview your source', copy: 'Enable your camera, choose an available input, and check your framing locally in the browser.' },
  { number: '02', title: 'Shape the direction', copy: 'Start with Photorealistic Human, refine the prompt, and add an optional image reference.' },
  { number: '03', title: 'Go live when ready', copy: 'Sign in and start a Decart session. Adjust your direction as it runs, then stop when you are done.' },
]

export default function LandingPage() {
  return (
    <div className="marketing-page">
      <div className="marketing-grain" aria-hidden="true" />
      <SiteHeader />

      <main>
        <section className="hero-section shell">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-rule" /> A LIVE VISUAL STUDIO</p>
            <h1>Live image.<br /><em>New possibility.</em></h1>
            <p className="hero-intro">A focused creative space for seeing a familiar frame in a different light. Shape a direction, keep the moment live.</p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/studio">
                Enter the Studio <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <a className="text-link" href="#how-it-works">Discover how it works <ArrowDown size={14} aria-hidden="true" /></a>
            </div>
            <div className="hero-footnote"><span className="signal-dot" /> Local preview · Decart session is opt-in</div>
          </div>

          <div className="hero-visual-wrap">
            <div className="hero-visual-label hero-visual-label-top"><span>FIELD STUDY / 01</span><span>LIVE FRAME</span></div>
            <div className="hero-visual-stage">
              <HeroArtwork />
              <div className="hero-crosshair" aria-hidden="true"><span /><span /></div>
              <div className="hero-side-note"><span className="hero-side-line" /> THE MOMENT, RECOMPOSED</div>
              <div className="hero-floating-card">
                <span className="floating-card-kicker"><span className="signal-dot" /> DEMO STUDY</span>
                <span className="floating-card-title">Photorealistic Human</span>
                <span className="floating-card-note">Natural proportions / true-to-life detail</span>
              </div>
              <div className="hero-index">K—01</div>
            </div>
            <div className="hero-visual-label hero-visual-label-bottom"><span>INPUT / DIRECTION / STUDY</span><span>00:08</span></div>
          </div>
        </section>

        <section className="signal-strip shell" aria-label="Creative workflow">
          <span className="signal-strip-label">THE WORKFLOW</span>
          <div className="signal-strip-item"><Aperture size={17} aria-hidden="true" /><span>Live source</span></div>
          <span className="signal-strip-connector" aria-hidden="true" />
          <div className="signal-strip-item"><WandSparkles size={17} aria-hidden="true" /><span>Visual direction</span></div>
          <span className="signal-strip-connector" aria-hidden="true" />
          <div className="signal-strip-item"><Focus size={17} aria-hidden="true" /><span>Considered output</span></div>
          <Link to="/studio" className="signal-strip-link">Open workspace <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>

        <section className="approach-section shell" id="how-it-works">
          <div className="section-heading approach-heading">
            <div>
              <p className="eyebrow">HOW IT WORKS</p>
              <h2>From camera to<br /><em>live direction.</em></h2>
            </div>
            <p className="section-intro">The Studio keeps setup simple and lets you decide when to move from local preview to a live Decart session.</p>
          </div>
          <div className="approach-grid">
            {steps.map((step) => (
              <article className="approach-card" key={step.number}>
                <div className="approach-card-top"><span>{step.number}</span><span className="approach-card-line" /></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <FeaturesSection />

        <section className="looks-section shell" id="looks">
          <div className="section-heading looks-heading">
            <div>
              <p className="eyebrow">THE STARTING DIRECTION</p>
              <h2>Photorealistic.<br /><em>Human.</em></h2>
            </div>
            <Link className="text-link" to="/studio">Explore this direction <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className="look-grid">
            {studioPresets.map((preset, index) => (
              <Link className="look-card" to={`/studio?preset=${preset.id}`} key={preset.id}>
                <div className={`look-card-art ${preset.swatch}`}>
                  <div className="look-card-art-shape" />
                  <span className="look-card-index">0{index + 1}</span>
                  <span className="look-card-open"><ArrowUpRight size={16} aria-hidden="true" /></span>
                  <span className="look-card-demo">DEMO LOOK</span>
                </div>
                <div className="look-card-copy"><div><h3>{preset.name}</h3><p>{preset.note}</p></div><span className="look-card-category">{preset.category}</span></div>
              </Link>
            ))}
          </div>
        </section>

        <FAQSection />

        <ContactSection />

        <section className="statement-section shell">
          <div className="statement-symbol"><Sparkles size={20} aria-hidden="true" /></div>
          <p className="eyebrow">THE IDEA IS YOURS</p>
          <h2>See the ordinary<br /><em>become something else.</em></h2>
          <p className="statement-copy">A camera, a point of view, and room to experiment. Explore a local look or start a live Decart session in the Studio.</p>
          <Link className="button button-primary" to="/studio">Shape the moment <MoveUpRight size={16} aria-hidden="true" /></Link>
        </section>
      </main>

      <footer className="site-footer shell">
        <BrandMark />
        <p>Camera preview stays local until you choose to start a live Decart session.</p>
        <span className="footer-copyright">© 2026 KINETELLE STUDIO</span>
      </footer>
    </div>
  )
}
