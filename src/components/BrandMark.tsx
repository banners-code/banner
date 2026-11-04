import { Link } from 'react-router-dom'

type BrandMarkProps = {
  compact?: boolean
  className?: string
}

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  return (
    <Link className={`brand-lockup ${compact ? 'brand-lockup-compact' : ''} ${className}`} to="/" aria-label="Kinetelle Studio home">
      <svg className="brand-symbol" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect x="2.5" y="2.5" width="39" height="39" rx="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 12.5h12.2a5.3 5.3 0 0 1 0 10.6H17.8a5.3 5.3 0 0 0 0 10.6H30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M29.5 12.5v10.6M14.5 23.1v10.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".54" />
      </svg>
      {!compact && (
        <span className="brand-wording">
          <span className="brand-name">Kinetelle</span>
          <span className="brand-caption">LIVE VISUAL STUDIO</span>
        </span>
      )}
    </Link>
  )
}
