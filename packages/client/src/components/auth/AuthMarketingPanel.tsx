'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Deep space base */}
      <div className="absolute inset-0 bg-black" />

      {/* Central nebula glow - dreamy purple/blue galaxy effect */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // Central bright glow - purple to blue
          'radial-gradient(ellipse 1200px 800px at 50% 45%, rgba(168,85,247,0.55), transparent 65%)',
          'radial-gradient(ellipse 1400px 900px at 50% 45%, rgba(139,92,246,0.45), transparent 70%)',
          // Secondary blue layer
          'radial-gradient(ellipse 1000px 700px at 48% 48%, rgba(99,102,241,0.35), transparent 65%)',
          // Soft cyan accent
          'radial-gradient(ellipse 1100px 750px at 52% 42%, rgba(59,130,246,0.28), transparent 68%)',
          // Outer fade with subtle color variation
          'radial-gradient(ellipse 1600px 1000px at 50% 45%, rgba(124,58,237,0.20), transparent 75%)',
        ].join(', '),
      }} />

      {/* Subtle ambient bottom glow */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          'radial-gradient(ellipse 1200px 500px at 50% 100%, rgba(217,70,239,0.12), transparent 70%)',
          'radial-gradient(ellipse 1000px 450px at 50% 100%, rgba(245,158,11,0.08), transparent 65%)',
        ].join(', '),
      }} />

      {/* Star field overlay */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          {/* Star noise filter for scattered stars */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="2.0" numOctaves="5" seed="256" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 0 .04 .15 .4 .7 .95 1" />
            </feComponentTransfer>
          </filter>
          
          {/* Brighter star clusters */}
          <filter id="brightStars" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="512" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 0 0 .1 .5 .9 1" />
            </feComponentTransfer>
          </filter>
        </defs>

        {/* Fine star field */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.25" />
        
        {/* Brighter star accents in the nebula center */}
        <rect x="20%" y="20%" width="60%" height="50%" filter="url(#brightStars)" opacity="0.30" />
      </svg>

      {/* Subtle vignette to darken edges */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0.7) 100%)',
      }} />
    </div>
  )
}

export default AuthMarketingPanel
