import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8">Top use cases</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="search" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Data research & enrichment</h3>
                <p className="text-sm text-muted-foreground">Increase coverage with guardrails; extract, dedupe, and enrich entities.</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="bot" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Internal workflow copilot</h3>
                <p className="text-sm text-muted-foreground">Reduce manual steps across tools with safe, auditable automations.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
