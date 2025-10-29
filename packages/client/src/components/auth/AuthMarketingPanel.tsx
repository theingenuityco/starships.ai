'use client'

import Icon from '@/components/primitives/Icon'

interface AuthMarketingPanelProps {
  className?: string
}

export function AuthMarketingPanel({ className }: AuthMarketingPanelProps) {
  return (
    <div className={className}>
      {/* Futuristic background: vignette + dot grid + constellation lines (no animation) */}
      <div className="absolute inset-0 bg-black" />
      {/* Vignette */}
      <div className="absolute inset-0" style={{
        backgroundImage:
          'radial-gradient(1200px 600px at 20% 30%, rgba(44,44,84,0.35), transparent 60%), radial-gradient(900px 500px at 80% 70%, rgba(28,64,88,0.28), transparent 60%)',
      }} />
      {/* Dot grid */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage:
          'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        backgroundPosition: '0 0',
      }} />
      {/* Constellation layer */}
      <svg className="absolute inset-0 w-full h-full" role="img" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.0" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
          </linearGradient>
          <radialGradient id="nodeGlow" r="60%">
            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* soft guide lines */}
        <g stroke="url(#lineGlow)" strokeWidth="1.2" opacity="0.55">
          <path d="M10% 25% L 28% 38% L 44% 22% L 58% 30% L 74% 18%" />
          <path d="M18% 72% L 32% 56% L 48% 68% L 62% 52% L 80% 66%" />
          <path d="M22% 40% L 36% 50% L 52% 42% L 70% 48%" />
        </g>
        {/* nodes with glow */}
        <g>
          {[
            ['10%','25%'],['28%','38%'],['44%','22%'],['58%','30%'],['74%','18%'],
            ['18%','72%'],['32%','56%'],['48%','68%'],['62%','52%'],['80%','66%'],
            ['22%','40%'],['36%','50%'],['52%','42%'],['70%','48%'],
          ].map(([cx, cy], i) => (
            <g key={i} opacity={0.9}>
              <circle cx={cx} cy={cy} r="10" fill="url(#nodeGlow)" />
              <circle cx={cx} cy={cy} r="1.6" fill="#ffffff" />
            </g>
          ))}
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


