import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'

export default function MarketplaceTeaser() {
  const { data: agentTemplates = [] } = useAgentTemplates()
  const { data: toolTemplates = [] } = useToolTemplates()

  const agentCount = agentTemplates.length
  const toolCount = toolTemplates.length

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold">Launch from the Marketplace</h2>
          <p className="text-muted-foreground max-w-2xl">Start with ready‑made agents and tools. Deploy in one click.</p>
          <p className="text-sm text-muted-foreground">
            {agentCount} agents, {toolCount} tools — and counting
          </p>
          <div>
            <Button size="lg" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="store" className="w-4 h-4 mr-2" /> Open marketplace
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
