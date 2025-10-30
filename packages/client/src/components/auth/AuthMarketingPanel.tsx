'use client'

import { useMemo } from 'react'

interface AuthMarketingPanelProps {
  className?: string
}

interface Star {
  cx: number
  cy: number
  r: number
  useGlow: boolean
}

// Generate random stars across the viewport
function generateStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    cx: Math.random() * 100,
    cy: Math.random() * 100,
    r: 0.5 + Math.random() * 0.7, // radius between 0.5 and 1.2
    useGlow: Math.random() > 0.7, // 30% chance to use glow effect
  }))
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  // Generate stars once on mount
  const stars = useMemo(() => generateStars(100), [])

  return (
    <div className={className}>
      {/* Deep space base */}
      <div className="absolute inset-0 bg-black" />

      {/* Bottom-center glow spreading upward and outward */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // Core bottom glow - purple/violet (brightest)
          'radial-gradient(ellipse 1000px 700px at 50% 100%, rgba(168,85,247,0.65), transparent 65%)',
          // Secondary layer - blue/purple blend
          'radial-gradient(ellipse 1200px 850px at 50% 102%, rgba(139,92,246,0.50), transparent 70%)',
          // Outer spread - indigo/blue
          'radial-gradient(ellipse 1400px 1000px at 50% 105%, rgba(99,102,241,0.38), transparent 75%)',
          // Soft cyan accent
          'radial-gradient(ellipse 1300px 950px at 50% 103%, rgba(59,130,246,0.28), transparent 72%)',
          // Farthest fade - subtle purple
          'radial-gradient(ellipse 1600px 1150px at 50% 108%, rgba(124,58,237,0.18), transparent 78%)',
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
        
        {/* Brighter star accents in center */}
        <rect x="25%" y="25%" width="50%" height="40%" filter="url(#brightStars)" opacity="0.35" />

        {/* Dynamically generated individual star particles */}
        <g opacity="0.8">
          {stars.map((star, i) => (
            <circle
              key={i}
              cx={`${star.cx}%`}
              cy={`${star.cy}%`}
              r={star.r}
              fill={star.useGlow ? 'url(#starGlow)' : '#ffffff'}
            />
          ))}
        </g>
      </svg>

      {/* Subtle vignette on sides and top only */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 100% 120% at 50% 100%, transparent 40%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,0.7) 100%)',
      }} />
    </div>
  )
}

export default AuthMarketingPanel
