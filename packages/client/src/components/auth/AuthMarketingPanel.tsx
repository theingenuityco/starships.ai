'use client'

import Icon from '@/components/primitives/Icon'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Spacey background: deep black base with subtle static starfield (no animation) */}
      <div className="absolute inset-0 bg-black" />
      <svg className="absolute inset-0 w-full h-full opacity-70" role="img" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <radialGradient id="starGlow" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* small stars */}
        <g fill="white" opacity="0.5">
          <circle cx="5%" cy="12%" r="0.6" />
          <circle cx="18%" cy="28%" r="0.7" />
          <circle cx="12%" cy="66%" r="0.6" />
          <circle cx="28%" cy="78%" r="0.5" />
          <circle cx="42%" cy="18%" r="0.6" />
          <circle cx="57%" cy="12%" r="0.7" />
          <circle cx="63%" cy="34%" r="0.5" />
          <circle cx="71%" cy="22%" r="0.6" />
          <circle cx="76%" cy="68%" r="0.6" />
          <circle cx="84%" cy="46%" r="0.5" />
          <circle cx="90%" cy="30%" r="0.6" />
          <circle cx="93%" cy="82%" r="0.5" />
          <circle cx="36%" cy="54%" r="0.6" />
          <circle cx="48%" cy="72%" r="0.6" />
          <circle cx="24%" cy="12%" r="0.5" />
        </g>
        {/* glow clusters for subtle nebula-like feel */}
        <g opacity="0.18">
          <circle cx="22%" cy="35%" r="180" fill="url(#starGlow)" />
          <circle cx="68%" cy="24%" r="140" fill="url(#starGlow)" />
          <circle cx="78%" cy="72%" r="160" fill="url(#starGlow)" />
        </g>
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


