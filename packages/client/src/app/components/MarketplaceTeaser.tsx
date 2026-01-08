'use client'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MarketplaceTeaser() {
  const router = useRouter()
  const { data: agentTemplates = [], isLoading: agentLoading } = useAgentTemplates()
  const { data: toolTemplates = [] } = useToolTemplates()

  const agentCount = agentTemplates.length
  const toolCount = toolTemplates.length

  const featuredAgents = (() => {
    // Curate a small set that matches the hero demo. Fallback to the first N templates if not found.
    const wanted = ['Aria', 'Iris', 'Saga']
    const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase()
    const byNameOrSlug = (name: string) => {
      const n = normalize(name)
      return (
        agentTemplates.find(t => normalize(t.name) === n) ??
        agentTemplates.find(t => normalize((t as any).slug) === n) ??
        agentTemplates.find(t => normalize(t.name).includes(n))
      )
    }

    const picked = wanted.map(byNameOrSlug).filter(Boolean) as typeof agentTemplates
    if (picked.length >= 2) return picked.slice(0, 9)
    return agentTemplates.slice(0, 9)
  })()
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  const goToMarketplace = () => router.push('/marketplace?from=public')

  useEffect(() => {
    if (!carouselApi) return
    const id = setInterval(() => {
      if (!isHovering) {
        try {
          carouselApi.scrollNext()
        } catch {}
      }
    }, 3200)
    return () => clearInterval(id)
  }, [carouselApi, isHovering])

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">Hire from the Marketplace</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-6 md:mb-8">Start with ready‑made AI teammates and skills. Deploy in one click.</p>
        </div>

        {/* Featured agents carousel */}
        <div className="mt-6">
          <Carousel className="px-2 sm:px-4 md:px-8" opts={{ loop: true }} setApi={setCarouselApi} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
            <CarouselContent>
              {agentLoading
                ? [...Array(6)].map((_, idx) => (
                    <CarouselItem key={idx} className="basis-full sm:basis-1/2 lg:basis-1/3">
                      {/* Match the approximate AgentTemplateCard layout to prevent layout shift */}
                      <div className="h-full flex flex-col rounded-lg bg-card border border-border/40 shadow-sm overflow-hidden pointer-events-none">
                        {/* Header (matches DeployedAgentCard: p-6, pt-5, pb-3, space-y-3) */}
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

                        {/* Footer/content (matches CardContent: p-6 pt-0 pb-5 mt-auto) */}
                        <div className="p-6 pt-0 pb-5 mt-auto">
                          <div className="flex items-center justify-between gap-3">
                            <Skeleton className="h-6 w-24 rounded-md" />
                            <Skeleton className="h-9 w-24 rounded-md" />
                          </div>
                        </div>
                      </div>
                    </CarouselItem>
                  ))
                : featuredAgents.map(template => (
                    <CarouselItem key={template.id} className="basis-full sm:basis-1/2 lg:basis-1/3">
                      <AgentTemplateCard template={template} onClick={goToMarketplace} showDeployCta={false} />
                    </CarouselItem>
                  ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:inline-flex" />
            <CarouselNext className="hidden md:inline-flex" />
          </Carousel>
        </div>

        {/* Counts and CTA below carousel */}
        <div className="mt-10 md:mt-12 flex flex-col items-center text-center gap-3 sm:gap-4">
          <div className="inline-flex items-baseline gap-2">
            <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{agentCount}</span>
            <span className="text-base sm:text-lg md:text-xl">agents,</span>
            <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{toolCount}</span>
            <span className="text-base sm:text-lg md:text-xl">tools and counting</span>
          </div>
          <div className="mt-2 sm:mt-3 md:mt-4">
            <Button size="lg" variant="outline" className="h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg border-primary/60 text-primary hover:bg-primary/10" onClick={goToMarketplace}>
              <Icon name="store" className="w-8 h-8 sm:w-9 sm:h-9 mr-2" /> Browse marketplace
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
