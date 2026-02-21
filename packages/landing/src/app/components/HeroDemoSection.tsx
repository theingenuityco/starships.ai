'use client'

import HeroConversationDemo from '@/app/components/HeroConversationDemo'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import type { AgentTemplateModel } from '@starships/protocol'

export default function HeroDemoSection(props: { initialAgentTemplates?: AgentTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  return (
    <section className="pb-16 sm:pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2">See it in action</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto">
            A quick demo conversation using the same chat experience as your starship.
          </p>
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

