'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Premium futuristic background: deep space + smooth nebula + subtle grid */}
      <div className="absolute inset-0 bg-black" />

      {/* Smooth nebula washes - elegant and refined */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // top: purple/violet glow (stronger)
          'radial-gradient(1600px 550px at 50% -5%, rgba(139,92,246,0.45), transparent 70%)',
          // mid-left: blue accent
          'radial-gradient(1000px 800px at 8% 50%, rgba(59,130,246,0.25), transparent 68%)',
          // mid-right: cyan/teal accent
          'radial-gradient(900px 750px at 92% 50%, rgba(6,182,212,0.20), transparent 65%)',
          // bottom-left: amber glow
          'radial-gradient(1300px 600px at 25% 102%, rgba(245,158,11,0.32), transparent 68%)',
          // bottom-right: magenta wash
          'radial-gradient(1100px 550px at 78% 102%, rgba(217,70,239,0.28), transparent 65%)',
        ].join(', '),
      }} />

      {/* Subtle dot grid pattern (very low contrast) */}
      <div className="absolute inset-0 opacity-[0.15]" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 0.5px, transparent 0.5px)',
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0',
      }} />

      {/* Futuristic elements overlay */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          {/* Smooth gradient for lines */}
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.0" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0.0" />
          </linearGradient>
          {/* Diagonal beam gradient */}
          <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.0" />
            <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.0" />
          </linearGradient>
          {/* Star noise filter */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="4" seed="128" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 .06 .2 .55 .85 1" />
            </feComponentTransfer>
          </filter>
        </defs>

        {/* Diagonal light beams - very subtle */}
        <g opacity="0.12">
          <path d="M-10% 25% L 40% -10%" stroke="url(#beam)" strokeWidth="140" fill="none" />
          <path d="M55% -10% L 110% 50%" stroke="url(#beam)" strokeWidth="120" fill="none" />
        </g>

        {/* Elegant curved lines (no dots/nodes) */}
        <g stroke="url(#lineGradient)" fill="none" strokeWidth="1.2" opacity="0.35">
          <path d="M10% 20% Q 30% 25%, 50% 20% T 90% 20%" />
          <path d="M10% 65% Q 30% 70%, 50% 65% T 90% 65%" />
          <path d="M15% 42% Q 45% 48%, 75% 42%" />
        </g>

        {/* Fine star field overlay */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.20" />
      </svg>
    </div>
  )
}

export default AuthMarketingPanel
