'use client'

import Icon from '@/components/primitives/Icon'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Premium space background (static): deep black + nebula + planet silhouette + star noise */}
      <div className="absolute inset-0 bg-black" />

      {/* Edge glow gradients to match landing hero (top purple, bottom amber→magenta) */}
      <div className="absolute inset-0" style={{
        backgroundImage: [
          // top rim glow: purple/violet
          'radial-gradient(1200px 420px at 50% -10%, rgba(139,92,246,0.35), transparent 65%)',
          // bottom rim glow: amber → magenta sweep
          'radial-gradient(1400px 520px at 50% 105%, rgba(245,158,11,0.30), transparent 62%)',
          'radial-gradient(1200px 480px at 60% 110%, rgba(217,70,239,0.28), transparent 60%)',
        ].join(', '),
      }} />

      {/* Planet silhouette with limb glow */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <radialGradient id="planet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0b0f17" />
            <stop offset="70%" stopColor="#0b0f17" />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.0" />
          </radialGradient>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="0">
            {/* amber → magenta transition like bottom glow */}
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.0" />
            <stop offset="35%" stopColor="#f59e0b" stopOpacity="0.32" />
            <stop offset="65%" stopColor="#d946ef" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0.0" />
          </linearGradient>
          {/* Procedural star noise */}
          <filter id="starNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="8" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.85 0" in="noise" result="high" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 0 .05 .2 .6 .9 1 1" />
            </feComponentTransfer>
          </filter>
        </defs>

        {/* planet positioned off-screen bottom-right for a cinematic limb */}
        <g opacity="0.9">
          <circle cx="88%" cy="92%" r="420" fill="url(#planet)" />
        </g>

        {/* orbital rings */}
        <g opacity="0.35" stroke="url(#ring)" fill="none" strokeWidth="1.2">
          <path d="M8% 70% C 35% 60%, 65% 80%, 92% 62%" />
          <path d="M10% 78% C 38% 68%, 62% 88%, 90% 70%" />
        </g>

        {/* star noise overlay */}
        <rect x="0" y="0" width="100%" height="100%" filter="url(#starNoise)" opacity="0.18" />
      </svg>

      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col justify-center px-10 xl:px-16 text-white">
        {/* Logo + small tagline */}
        <div className="mb-8 flex items-center gap-3 opacity-90">
          <Icon name="rocket" className="h-6 w-6 text-primary" />
          <span className="text-sm text-gray-300">Starships.ai</span>
        </div>

        <div>
          <h1 className="text-5xl font-bold mb-6 text-white">
            Build intelligent agent workflows
          </h1>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed max-w-2xl">
            Design, deploy, and monitor AI agents with complete visibility and control.
          </p>

          {/* Benefits list */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                <Icon name="rocket-launch" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Rapid agent development & deployment</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                <Icon name="wrench" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Pre-built tools & customization</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                <Icon name="store" className="w-5 h-5 text-primary" />
              </div>
              <span className="text-gray-200">Marketplace of agents & tools</span>
            </div>
          </div>
        </div>

        {/* Footer links intentionally removed per request */}
      </div>
    </div>
  )
}

export default AuthMarketingPanel


