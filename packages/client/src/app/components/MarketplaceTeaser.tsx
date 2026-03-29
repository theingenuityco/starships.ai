'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'

type MarketplaceTeaserProps = {
  initialAgentTemplates?: AgentTemplateModel[]
  initialToolTemplates?: ToolTemplateModel[]
}

function pickFeaturedAgents(allAgents: AgentTemplateModel[]): AgentTemplateModel[] {
  const wanted = ['Aria', 'Iris', 'Saga']
  const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase()

  const byNameOrSlug = (name: string): AgentTemplateModel | undefined => {
    const n = normalize(name)
    return (
      allAgents.find(t => normalize(t.name) === n) ??
      allAgents.find(t => normalize((t as any).slug) === n) ??
      allAgents.find(t => normalize(t.name).includes(n))
    )
  }

  const picked = wanted.map(byNameOrSlug).filter(Boolean) as AgentTemplateModel[]
  if (picked.length >= 2) return picked.slice(0, 9)
  return allAgents.slice(0, 9)
}

function AgentCarouselSkeletonItem() {
  return (
    <div className="h-full flex flex-col rounded-none bg-card border border-border/40 shadow-sm overflow-hidden pointer-events-none">
      <div className="p-6 pt-5 pb-3 space-y-3">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[86%]" />
            <Skeleton className="h-4 w-[78%]" />
          </div>
        </div>
      </div>

      <div className="p-6 pt-0 pb-5 mt-auto">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}

type FeaturedAgentsCarouselProps = {
  agents: AgentTemplateModel[]
  loading: boolean
  onAgentClick: () => void
}

function FeaturedAgentsCarousel({ agents, loading, onAgentClick }: FeaturedAgentsCarouselProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (!carouselApi) return
    const id = window.setInterval(() => {
      if (!isHovering) {
        try {
          carouselApi.scrollNext()
        } catch {
          /* ignore */
        }
      }
    }, 3200)
    return () => window.clearInterval(id)
  }, [carouselApi, isHovering])

  return (
    <Carousel
      className="px-2 sm:px-4 md:px-8"
      opts={{ loop: true }}
      setApi={setCarouselApi}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <CarouselContent>
        {loading
          ? [...Array(6)].map((_, idx) => (
              <CarouselItem key={idx} className="basis-full sm:basis-1/2 lg:basis-1/3">
                <AgentCarouselSkeletonItem />
              </CarouselItem>
            ))
          : agents.map(template => (
              <CarouselItem key={template.id} className="basis-full sm:basis-1/2 lg:basis-1/3">
                <AgentTemplateCard template={template} onClick={onAgentClick} showDeployCta={false} cardClassName="rounded-none" />
              </CarouselItem>
            ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:inline-flex" />
      <CarouselNext className="hidden md:inline-flex" />
    </Carousel>
  )
}

export default function MarketplaceTeaser({ initialAgentTemplates, initialToolTemplates }: MarketplaceTeaserProps) {
  const router = useRouter()

  const serverAgents = initialAgentTemplates ?? []
  const serverTools = initialToolTemplates ?? []

  const useServerInitialAgents = serverAgents.length > 0
  const useServerInitialTools = serverTools.length > 0

  const { data: agentData, isLoading: agentLoadingRaw } = useAgentTemplates(undefined, !useServerInitialAgents)
  const { data: toolData, isLoading: toolLoadingRaw } = useToolTemplates(undefined, !useServerInitialTools)

  const agentTemplates = (useServerInitialAgents ? serverAgents : agentData ?? []) as AgentTemplateModel[]
  const toolTemplates = (useServerInitialTools ? serverTools : toolData ?? []) as ToolTemplateModel[]
  const agentLoading = agentLoadingRaw && !useServerInitialAgents
  const toolLoading = toolLoadingRaw && !useServerInitialTools

  const featuredAgents = useMemo(() => pickFeaturedAgents(agentTemplates), [agentTemplates])

  const agentCount = agentTemplates.length
  const toolCount = toolTemplates.length

  const goToMarketplace = () => router.push('/explore')

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">Explore agents and connectors</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-6 md:mb-8">
            Find and install agents and connectors. Deploy in one click.
          </p>
        </div>

        <div className="mt-6">
          <FeaturedAgentsCarousel agents={featuredAgents} loading={agentLoading} onAgentClick={goToMarketplace} />
        </div>

        <div className="mt-10 md:mt-12 flex flex-col items-center text-center gap-3 sm:gap-4">
          <div className="inline-flex items-baseline gap-2">
            <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{agentLoading && !agentCount ? '–' : agentCount}</span>
            <span className="text-base sm:text-lg md:text-xl">agents,</span>
            <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{toolLoading && !toolCount ? '–' : toolCount}</span>
            <span className="text-base sm:text-lg md:text-xl">tools and counting</span>
          </div>
          <div className="mt-2 sm:mt-3 md:mt-4">
            <Button
              size="lg"
              variant="outline"
              className="h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg border-primary/60 text-primary hover:bg-primary/10"
              onClick={goToMarketplace}
            >
              <Icon name="store" className="w-8 h-8 sm:w-9 sm:h-9 mr-2" />
              Explore
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
