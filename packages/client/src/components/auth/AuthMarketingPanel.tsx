'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Deep space base */}
      <div className="absolute inset-0 bg-black" />

      {/* Tighter central nebula glow - more concentrated */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // Core bright glow - purple (tighter)
          'radial-gradient(ellipse 800px 550px at 50% 45%, rgba(168,85,247,0.60), transparent 55%)',
          'radial-gradient(ellipse 950px 650px at 50% 45%, rgba(139,92,246,0.48), transparent 60%)',
          // Secondary blue layer (tighter)
          'radial-gradient(ellipse 700px 500px at 48% 48%, rgba(99,102,241,0.38), transparent 58%)',
          // Soft cyan accent (tighter)
          'radial-gradient(ellipse 750px 520px at 52% 42%, rgba(59,130,246,0.30), transparent 60%)',
          // Outer fade (much tighter)
          'radial-gradient(ellipse 1100px 750px at 50% 45%, rgba(124,58,237,0.22), transparent 65%)',
        ].join(', '),
      }} />

      {/* Subtle ambient bottom glow (reduced) */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          'radial-gradient(ellipse 900px 350px at 50% 100%, rgba(217,70,239,0.10), transparent 65%)',
          'radial-gradient(ellipse 750px 300px at 50% 100%, rgba(245,158,11,0.06), transparent 60%)',
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

      {/* Stronger vignette to darken edges more */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 65% 55% at 50% 45%, transparent 25%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.85) 100%)',
      }} />
    </div>
  )
}

export default AuthMarketingPanel
