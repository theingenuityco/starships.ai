'use client'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Futuristic space background: deep space + refined nebula + geometric grid + light beams */}
      <div className="absolute inset-0 bg-black" />

      {/* Enhanced nebula washes with futuristic feel */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // top: purple/violet glow
          'radial-gradient(1400px 500px at 50% -8%, rgba(139,92,246,0.38), transparent 68%)',
          // mid-left: blue accent
          'radial-gradient(900px 700px at 10% 45%, rgba(59,130,246,0.22), transparent 65%)',
          // mid-right: cyan accent
          'radial-gradient(800px 650px at 88% 55%, rgba(6,182,212,0.18), transparent 60%)',
          // bottom: amber to magenta sweep
          'radial-gradient(1200px 550px at 35% 100%, rgba(245,158,11,0.28), transparent 65%)',
          'radial-gradient(1000px 500px at 72% 100%, rgba(217,70,239,0.24), transparent 62%)',
        ].join(', '),
      }} />

      {/* Futuristic elements overlay */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          {/* Glowing nodes */}
          <radialGradient id="nodeGlow" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          {/* Light beam gradient */}
          <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.0" />
            <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.0" />
          </linearGradient>
          {/* Geometric line gradient */}
          <linearGradient id="geoLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.0" />
            <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.5" />
            <stop offset="65%" stopColor="#d946ef" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0.0" />
          </linearGradient>
          {/* Enhanced star field noise */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="4" seed="88" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" in="noise" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 0 .1 .3 .7 .95 1" />
            </feComponentTransfer>
          </filter>
        </defs>

        {/* Diagonal light beams */}
        <g opacity="0.15">
          <path d="M-5% 30% L 35% -5%" stroke="url(#beam)" strokeWidth="120" fill="none" />
          <path d="M60% -5% L 105% 45%" stroke="url(#beam)" strokeWidth="100" fill="none" />
          <path d="M-5% 80% L 25% 105%" stroke="url(#beam)" strokeWidth="90" fill="none" />
        </g>

        {/* Geometric connection lines (tech aesthetic) */}
        <g stroke="url(#geoLine)" fill="none" strokeWidth="1" opacity="0.4">
          <path d="M15% 22% L 32% 28% L 48% 18% L 65% 25%" />
          <path d="M18% 68% L 35% 62% L 52% 70% L 68% 64%" />
          <path d="M25% 42% L 42% 48% L 58% 40% L 75% 46%" />
        </g>

        {/* Glowing nodes at line intersections */}
        <g opacity="0.8">
          {[
            ['15%', '22%'], ['32%', '28%'], ['48%', '18%'], ['65%', '25%'],
            ['18%', '68%'], ['35%', '62%'], ['52%', '70%'], ['68%', '64%'],
            ['25%', '42%'], ['42%', '48%'], ['58%', '40%'], ['75%', '46%'],
          ].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="12" fill="url(#nodeGlow)" />
              <circle cx={cx} cy={cy} r="1.5" fill="#ffffff" opacity="0.9" />
            </g>
          ))}
        </g>

        {/* Subtle hexagonal grid pattern overlay (sci-fi feel) */}
        <g opacity="0.08" stroke="#ffffff" strokeWidth="0.5" fill="none">
          <path d="M10% 15% L 12% 12% L 14% 15% L 14% 18% L 12% 21% L 10% 18% Z" />
          <path d="M82% 25% L 84% 22% L 86% 25% L 86% 28% L 84% 31% L 82% 28% Z" />
          <path d="M20% 75% L 22% 72% L 24% 75% L 24% 78% L 22% 81% L 20% 78% Z" />
          <path d="M75% 80% L 77% 77% L 79% 80% L 79% 83% L 77% 86% L 75% 83% Z" />
          <path d="M45% 35% L 47% 32% L 49% 35% L 49% 38% L 47% 41% L 45% 38% Z" />
        </g>

        {/* Star field overlay with better distribution */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.24" />
      </svg>
    </div>
  )
}

export default AuthMarketingPanel
