'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Deep space base */}
      <div className="absolute inset-0 bg-black" />

      {/* App-matched nebula gradient: blue-purple-magenta shades */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // Top: blue tones (#5865c9 region)
          'radial-gradient(ellipse 850px 580px at 50% 25%, rgba(88,101,201,0.65), transparent 60%)',
          'radial-gradient(ellipse 1000px 680px at 50% 22%, rgba(88,101,201,0.48), transparent 65%)',
          // Mid-upper: purple transition (#7b5db8 region)
          'radial-gradient(ellipse 900px 650px at 48% 38%, rgba(123,93,184,0.55), transparent 62%)',
          'radial-gradient(ellipse 950px 700px at 52% 40%, rgba(123,93,184,0.42), transparent 65%)',
          // Mid-lower: magenta tones (#a855a8 region)
          'radial-gradient(ellipse 850px 620px at 50% 58%, rgba(168,85,168,0.48), transparent 63%)',
          'radial-gradient(ellipse 950px 680px at 50% 62%, rgba(168,85,168,0.38), transparent 66%)',
          // Bottom: deeper magenta with pink accent (#c94873 region)
          'radial-gradient(ellipse 800px 500px at 50% 85%, rgba(201,72,115,0.40), transparent 65%)',
          'radial-gradient(ellipse 900px 550px at 50% 88%, rgba(201,72,115,0.28), transparent 68%)',
        ].join(', '),
      }} />

      {/* Star field and particles overlay */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          {/* Fine star noise */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="5" seed="256" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 0 .03 .12 .35 .65 .9 1" />
            </feComponentTransfer>
          </filter>
          
          {/* Brighter star clusters in center */}
          <filter id="brightStars" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="512" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 0 0 .08 .4 .85 1" />
            </feComponentTransfer>
          </filter>

          {/* Star glow effect */}
          <radialGradient id="starGlow" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Fine star field across entire background */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.28" />
        
        {/* Brighter star accents in nebula center */}
        <rect x="25%" y="25%" width="50%" height="40%" filter="url(#brightStars)" opacity="0.35" />

        {/* Individual visible star particles scattered throughout */}
        <g opacity="0.8">
          {/* Top left region */}
          <circle cx="12%" cy="18%" r="0.8" fill="#ffffff" />
          <circle cx="8%" cy="12%" r="1.2" fill="url(#starGlow)" />
          <circle cx="18%" cy="22%" r="0.6" fill="#ffffff" />
          <circle cx="15%" cy="28%" r="1" fill="url(#starGlow)" />
          <circle cx="5%" cy="20%" r="0.7" fill="#ffffff" />
          <circle cx="10%" cy="35%" r="0.8" fill="#ffffff" />
          <circle cx="20%" cy="15%" r="0.6" fill="#ffffff" />
          <circle cx="14%" cy="8%" r="0.9" fill="url(#starGlow)" />
          <circle cx="6%" cy="30%" r="0.7" fill="#ffffff" />
          
          {/* Top center region */}
          <circle cx="35%" cy="10%" r="0.8" fill="#ffffff" />
          <circle cx="42%" cy="15%" r="1" fill="url(#starGlow)" />
          <circle cx="50%" cy="12%" r="0.7" fill="#ffffff" />
          <circle cx="58%" cy="18%" r="0.9" fill="#ffffff" />
          <circle cx="48%" cy="8%" r="0.6" fill="#ffffff" />
          <circle cx="52%" cy="20%" r="0.8" fill="url(#starGlow)" />
          
          {/* Top right region */}
          <circle cx="82%" cy="15%" r="0.9" fill="#ffffff" />
          <circle cx="88%" cy="20%" r="1.1" fill="url(#starGlow)" />
          <circle cx="78%" cy="25%" r="0.7" fill="#ffffff" />
          <circle cx="92%" cy="12%" r="0.8" fill="#ffffff" />
          <circle cx="85%" cy="10%" r="0.7" fill="#ffffff" />
          <circle cx="90%" cy="28%" r="0.9" fill="#ffffff" />
          <circle cx="94%" cy="22%" r="0.6" fill="#ffffff" />
          <circle cx="80%" cy="8%" r="1" fill="url(#starGlow)" />
          
          {/* Center left */}
          <circle cx="8%" cy="45%" r="0.9" fill="#ffffff" />
          <circle cx="12%" cy="52%" r="0.7" fill="#ffffff" />
          <circle cx="18%" cy="48%" r="1.1" fill="url(#starGlow)" />
          <circle cx="15%" cy="55%" r="0.6" fill="#ffffff" />
          <circle cx="10%" cy="60%" r="0.8" fill="#ffffff" />
          
          {/* Center scattered */}
          <circle cx="35%" cy="35%" r="1" fill="url(#starGlow)" />
          <circle cx="45%" cy="30%" r="0.7" fill="#ffffff" />
          <circle cx="55%" cy="38%" r="0.9" fill="#ffffff" />
          <circle cx="62%" cy="32%" r="1.2" fill="url(#starGlow)" />
          <circle cx="48%" cy="50%" r="0.8" fill="#ffffff" />
          <circle cx="38%" cy="45%" r="0.7" fill="#ffffff" />
          <circle cx="52%" cy="42%" r="0.9" fill="#ffffff" />
          <circle cx="42%" cy="52%" r="0.6" fill="#ffffff" />
          <circle cx="58%" cy="48%" r="1" fill="url(#starGlow)" />
          <circle cx="32%" cy="52%" r="0.7" fill="#ffffff" />
          <circle cx="65%" cy="45%" r="0.8" fill="#ffffff" />
          <circle cx="40%" cy="38%" r="0.6" fill="#ffffff" />
          
          {/* Center right */}
          <circle cx="85%" cy="45%" r="0.8" fill="#ffffff" />
          <circle cx="90%" cy="52%" r="1" fill="url(#starGlow)" />
          <circle cx="82%" cy="50%" r="0.7" fill="#ffffff" />
          <circle cx="88%" cy="58%" r="0.9" fill="#ffffff" />
          <circle cx="92%" cy="48%" r="0.6" fill="#ffffff" />
          
          {/* Bottom left region */}
          <circle cx="15%" cy="68%" r="0.9" fill="#ffffff" />
          <circle cx="10%" cy="75%" r="1" fill="url(#starGlow)" />
          <circle cx="22%" cy="72%" r="0.7" fill="#ffffff" />
          <circle cx="18%" cy="82%" r="0.8" fill="#ffffff" />
          <circle cx="8%" cy="80%" r="0.9" fill="#ffffff" />
          <circle cx="12%" cy="88%" r="0.7" fill="#ffffff" />
          <circle cx="20%" cy="85%" r="1.1" fill="url(#starGlow)" />
          <circle cx="6%" cy="70%" r="0.6" fill="#ffffff" />
          
          {/* Bottom center */}
          <circle cx="35%" cy="75%" r="0.8" fill="#ffffff" />
          <circle cx="42%" cy="80%" r="1" fill="url(#starGlow)" />
          <circle cx="48%" cy="72%" r="0.7" fill="#ffffff" />
          <circle cx="52%" cy="82%" r="0.9" fill="#ffffff" />
          <circle cx="58%" cy="78%" r="0.6" fill="#ffffff" />
          <circle cx="45%" cy="88%" r="0.8" fill="#ffffff" />
          
          {/* Bottom right region */}
          <circle cx="78%" cy="70%" r="1.1" fill="url(#starGlow)" />
          <circle cx="85%" cy="65%" r="0.8" fill="#ffffff" />
          <circle cx="82%" cy="78%" r="0.9" fill="#ffffff" />
          <circle cx="88%" cy="75%" r="0.7" fill="#ffffff" />
          <circle cx="90%" cy="82%" r="1" fill="url(#starGlow)" />
          <circle cx="92%" cy="72%" r="0.6" fill="#ffffff" />
          <circle cx="80%" cy="85%" r="0.8" fill="#ffffff" />
          <circle cx="86%" cy="88%" r="0.7" fill="#ffffff" />
          
          {/* Additional scattered particles */}
          <circle cx="28%" cy="45%" r="0.6" fill="#ffffff" />
          <circle cx="70%" cy="48%" r="0.8" fill="#ffffff" />
          <circle cx="40%" cy="62%" r="0.7" fill="#ffffff" />
          <circle cx="58%" cy="58%" r="0.9" fill="url(#starGlow)" />
          <circle cx="25%" cy="60%" r="0.6" fill="#ffffff" />
          <circle cx="68%" cy="62%" r="0.8" fill="#ffffff" />
          <circle cx="32%" cy="68%" r="0.7" fill="#ffffff" />
          <circle cx="72%" cy="55%" r="0.9" fill="url(#starGlow)" />
        </g>
      </svg>

      {/* Stronger vignette to match reference */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 65% 60% at 50% 50%, transparent 20%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0.85) 100%)',
      }} />
    </div>
  )
}

export default AuthMarketingPanel
