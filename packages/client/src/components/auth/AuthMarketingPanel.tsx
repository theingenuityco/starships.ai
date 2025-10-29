'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Premium space background (static): deep space + enhanced nebula + planet + star field */}
      <div className="absolute inset-0 bg-black" />

      {/* Enhanced nebula washes with better blending */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // top: purple/violet rim
          'radial-gradient(1400px 500px at 50% -8%, rgba(139,92,246,0.42), transparent 68%)',
          // bottom left: amber glow
          'radial-gradient(1200px 600px at 15% 105%, rgba(245,158,11,0.35), transparent 65%)',
          // bottom right: magenta wash
          'radial-gradient(1000px 550px at 85% 105%, rgba(217,70,239,0.32), transparent 62%)',
          // mid-left accent: blue
          'radial-gradient(800px 800px at 8% 50%, rgba(59,130,246,0.18), transparent 60%)',
        ].join(', '),
      }} />

      {/* Enhanced space elements */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          {/* Planet with atmospheric limb */}
          <radialGradient id="planet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0b0f17" />
            <stop offset="70%" stopColor="#0b0f17" />
            <stop offset="92%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          {/* Orbital rings gradient */}
          <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.0" />
            <stop offset="30%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#d946ef" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0.0" />
          </linearGradient>
          {/* Enhanced star field noise */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="4" seed="42" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 .08 .25 .65 .9 1" />
            </feComponentTransfer>
          </filter>
        </defs>

        {/* Larger planet positioned for dramatic limb (bottom right) */}
        <g opacity="0.85">
          <circle cx="88%" cy="94%" r="520" fill="url(#planet)" />
        </g>

        {/* Orbital rings with more presence */}
        <g opacity="0.45" stroke="url(#ring)" fill="none" strokeWidth="1.5">
          <path d="M6% 68% Q 50% 56%, 94% 62%" />
          <path d="M8% 76% Q 50% 64%, 92% 70%" />
          <path d="M10% 84% Q 50% 72%, 90% 78%" />
        </g>

        {/* Star field overlay with better distribution */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.22" />
      </svg>
    </div>
  )
}

export default AuthMarketingPanel
