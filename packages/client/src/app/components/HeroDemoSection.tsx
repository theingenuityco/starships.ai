'use client'

import HeroConversationDemo from '@/app/components/HeroConversationDemo'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import type { AgentTemplateModel } from '@starships/protocol'

export default function HeroDemoSection(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  return (
    <section className="relative pb-16 sm:pb-20 px-4 bg-white text-slate-900">
      {/* Circular glow behind the heading + demo card (let it extend above the section; we'll mask only the bottom) */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-420px] -translate-x-1/2 z-[-20] w-[1800px] h-[1800px] rounded-full"
        style={{
          background: 'radial-gradient(circle at center, rgba(168,85,247,0.7) 0%, rgba(147,112,255,0.5) 32%, transparent 78%)',
          filter: 'blur(14px)',
        }}
        aria-hidden
      />
      {/* Fade the bottom of this white section (including content) into the warm "How it works" background below,
          similar to the Dewang-style blend. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 sm:h-32 z-20"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 45%, #FBF5ED 100%)',
        }}
        aria-hidden
      />
      <div className="relative max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-slate-900">See it in action</h2>
          <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto">A quick demo conversation using the same chat experience as your starship.</p>
        </div>

        <div className="w-full text-left">
          <ErrorBoundary name="HeroConversationDemo">
            <HeroConversationDemo initialAgentTemplates={initialAgentTemplates} />
          </ErrorBoundary>
        </div>
      </div>
    </section>
  )
}
