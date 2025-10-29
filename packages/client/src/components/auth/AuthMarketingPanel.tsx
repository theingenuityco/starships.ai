'use client'

import Icon from '@/components/primitives/Icon'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Minimal background grid (no gradients, no animation) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,1)',
          backgroundImage:
            'radial-gradient(transparent 1px, rgba(255,255,255,0.02) 1px)',
          backgroundSize: '12px 12px',
          backgroundPosition: '0 0',
        }}
      />

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

        {/* Footer links */}
        <div className="mt-10 text-xs text-white/60">
          <a className="hover:text-white/80" href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
          <span className="mx-2">•</span>
          <a className="hover:text-white/80" href="/terms" target="_blank" rel="noreferrer">Terms</a>
        </div>
      </div>
    </div>
  )
}

export default AuthMarketingPanel


