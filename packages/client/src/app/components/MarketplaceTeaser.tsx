'use client'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
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

  const featuredAgents = agentTemplates.slice(0, 9)
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
                      <div className="h-[270px] rounded-xl bg-muted/40 border border-muted-foreground/20 animate-pulse" />
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
            <span className="text-base sm:text-lg md:text-xl">teammates,</span>
            <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-primary">{toolCount}</span>
            <span className="text-base sm:text-lg md:text-xl">skills and counting</span>
          </div>
          <div className="mt-2 sm:mt-3 md:mt-4">
            <Button size="lg" variant="outline" className="border-primary/60 text-primary hover:bg-primary/10" onClick={goToMarketplace}>
              <Icon name="store" className="w-7 h-7 mr-2" /> Browse marketplace
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
