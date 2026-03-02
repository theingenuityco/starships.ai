'use client'

import HeroConversationDemo from '@/app/components/HeroConversationDemo'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import type { AgentTemplateModel } from '@starships/protocol'

export default function HeroDemoSection(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  return (
    <section className="relative pb-16 sm:pb-20 px-4">
      {/* Circular glow behind the heading + demo card */}
      <div
        className="pointer-events-none absolute left-1/2 top-[-480px] -translate-x-1/2 z-0 w-[1800px] h-[1800px] rounded-full"
        style={{
          // Larger, soft purple circular glow that comfortably wraps the whole section
          background: 'radial-gradient(circle at center, rgba(168,85,247,0.7) 0%, rgba(147,112,255,0.5) 32%, transparent 80%)',
          filter: 'blur(14px)',
        }}
        aria-hidden
      />
      <div className="relative max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2">See it in action</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto">A quick demo conversation using the same chat experience as your starship.</p>
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
