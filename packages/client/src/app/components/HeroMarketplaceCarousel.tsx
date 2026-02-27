'use client'

import { useAgentTemplates } from '@/hooks/useTemplates'
import type { AgentTemplateModel } from '@starships/protocol'
import { HeroMarketplaceCarouselView } from '@/app/components/HeroMarketplaceCarouselView'

type HeroMarketplaceCarouselProps = {
  initialAgentTemplates?: AgentTemplateModel[]
  autoPlay?: boolean
  onSelectionChange?: (template: AgentTemplateModel) => void
}

/**
 * Fetches templates via React Query. This file MUST only be loaded on the client (e.g. via
 * dynamic import with ssr: false). Use HeroMarketplaceCarouselView with server data for SSR.
 */
export default function HeroMarketplaceCarousel({ initialAgentTemplates = [], autoPlay = true, onSelectionChange }: HeroMarketplaceCarouselProps) {
  const useServerInitial = initialAgentTemplates.length > 0
  const { data, isLoading } = useAgentTemplates(undefined, !useServerInitial)
  const agentTemplates = (useServerInitial ? initialAgentTemplates : (data ?? [])) as AgentTemplateModel[]
  const agentTemplatesLoading = isLoading && !useServerInitial

  return (
    <HeroMarketplaceCarouselView
      agentTemplates={agentTemplates}
      agentTemplatesLoading={agentTemplatesLoading}
      autoPlay={autoPlay}
      onSelectionChange={onSelectionChange}
    />
  )
}
