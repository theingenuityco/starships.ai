import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'

export default function MarketplaceTeaser() {
  const { data: agentTemplates = [], isLoading: agentLoading } = useAgentTemplates()
  const { data: toolTemplates = [] } = useToolTemplates()

  const agentCount = agentTemplates.length
  const toolCount = toolTemplates.length

  const featuredAgents = agentTemplates.slice(0, 9)

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold mb-2">Launch from the Marketplace</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-12 md:mb-16">Start with ready‑made agents and tools. Deploy in one click.</p>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Icon name="sparkles" className="w-4 h-4 opacity-80" />
            {agentCount} agents, {toolCount} tools — and counting
          </p>
          <div>
            <Button size="lg" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="store" className="w-4 h-4 mr-2" /> Open marketplace
            </Button>
          </div>
        </div>

        {/* Featured agents carousel */}
        <div className="mt-8">
          <Carousel className="px-8">
            <CarouselContent>
              {agentLoading
                ? [...Array(6)].map((_, idx) => (
                    <CarouselItem key={idx} className="basis-full sm:basis-1/2 lg:basis-1/3">
                      <div className="h-[340px] rounded-xl bg-muted/40 border border-muted-foreground/20 animate-pulse" />
                    </CarouselItem>
                  ))
                : featuredAgents.map(template => (
                    <CarouselItem key={template.id} className="basis-full sm:basis-1/2 lg:basis-1/3">
                      <AgentTemplateCard template={template} onClick={() => (window.location.href = '/marketplace')} />
                    </CarouselItem>
                  ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:inline-flex" />
            <CarouselNext className="hidden md:inline-flex" />
          </Carousel>
        </div>
      </div>
    </section>
  )
}
