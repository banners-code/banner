export default function HeroArtwork() {
  return (
    <svg className="hero-artwork" viewBox="0 0 760 620" role="img" aria-labelledby="hero-art-title hero-art-description">
      <title id="hero-art-title">A study in changing light</title>
      <desc id="hero-art-description">An abstract portrait framed by soft amber and lime light with subtle camera guides.</desc>
      <defs>
        <linearGradient id="hero-ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c3429" />
          <stop offset="0.56" stopColor="#171b16" />
          <stop offset="1" stopColor="#5b3c31" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="67%" cy="34%" r="58%">
          <stop offset="0" stopColor="#d1f17a" stopOpacity=".58" />
          <stop offset=".46" stopColor="#91a767" stopOpacity=".16" />
          <stop offset="1" stopColor="#10120f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-face" x1=".1" y1=".3" x2=".9" y2=".8">
          <stop offset="0" stopColor="#c98e77" />
          <stop offset=".52" stopColor="#8c6657" />
          <stop offset="1" stopColor="#403931" />
        </linearGradient>
        <linearGradient id="hero-shirt" x1=".3" y1="0" x2=".8" y2="1">
          <stop offset="0" stopColor="#7f8a71" />
          <stop offset="1" stopColor="#31382e" />
        </linearGradient>
        <pattern id="hero-grain" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="2" r=".55" fill="#f0f0e9" opacity=".2" />
          <circle cx="5" cy="6" r=".4" fill="#f0f0e9" opacity=".12" />
        </pattern>
        <clipPath id="hero-clip"><rect width="760" height="620" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#hero-clip)">
        <rect width="760" height="620" fill="url(#hero-ground)" />
        <rect width="760" height="620" fill="url(#hero-glow)" />
        <circle cx="554" cy="178" r="188" fill="none" stroke="#d1f17a" strokeOpacity=".22" strokeWidth="1" />
        <circle cx="554" cy="178" r="236" fill="none" stroke="#d1f17a" strokeOpacity=".1" strokeWidth="1" />
        <path d="M-36 479C72 403 113 230 244 183c80-29 137 6 171 64-89 22-164 120-195 263-22 103-71 143-176 111L-36 479Z" fill="#20281f" opacity=".8" />
        <path d="M345 628c-21-103-5-204 53-291 27-42 72-69 116-69 51 0 91 33 112 85 36 90 43 184 33 275H345Z" fill="url(#hero-shirt)" />
        <path d="M429 319c-25-24-40-57-40-94 0-78 48-135 116-135 72 0 120 58 119 136 0 68-37 124-93 146-36 14-72-6-102-53Z" fill="url(#hero-face)" />
        <path d="M390 231c-9-97 46-170 127-170 65 0 110 47 119 121-40-28-74-57-95-88-27 48-83 83-151 93v44Z" fill="#22221c" />
        <path d="M480 220c9-7 20-8 29-3M565 220c10-7 21-7 31-1" stroke="#332a24" strokeWidth="5" strokeLinecap="round" />
        <path d="M500 267c18 11 37 11 54-1" fill="none" stroke="#49352e" strokeWidth="4" strokeLinecap="round" />
        <path d="M470 174c23-6 47-5 65 3M558 178c16-4 31-2 45 5" stroke="#d1f17a" strokeOpacity=".4" strokeWidth="2" />
        <path d="M443 355c41 20 98 17 135-8" fill="none" stroke="#e2aa89" strokeOpacity=".48" strokeWidth="2" />
        <rect width="760" height="620" fill="url(#hero-grain)" opacity=".34" />
        <path d="M38 73V38h35M722 73V38h-35M38 547v35h35M722 547v35h-35" fill="none" stroke="#f0f0e9" strokeOpacity=".66" strokeWidth="1.5" />
        <circle cx="380" cy="302" r="5" fill="#d1f17a" />
      </g>
    </svg>
  )
}
