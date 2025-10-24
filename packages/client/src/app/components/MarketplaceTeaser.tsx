import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function MarketplaceTeaser() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-semibold mb-2">Launch from the Marketplace</h2>
            <p className="text-muted-foreground">Jump‑start with production‑ready agents and tools. Deploy in one click, then tailor prompts, models, and blueprints to your workflow.</p>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Button size="lg" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="store" className="w-4 h-4 mr-2" /> Explore Marketplace
            </Button>
            <Button size="lg" variant="outline" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="tag" className="w-4 h-4 mr-2" /> Browse Templates
            </Button>
          </div>

          {/* Quick category chips */}
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {['all', 'coding', 'automation', 'data', 'integration', 'support'].map(category => (
              <Badge key={category} variant="outline" className="cursor-pointer capitalize" onClick={() => (window.location.href = `/marketplace?category=${encodeURIComponent(category)}`)}>
                <Icon name="tag" className="w-3.5 h-3.5 mr-1.5" /> {category}
              </Badge>
            ))}
          </div>
        </div>
        {/* Featured previews */}
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Card className="p-5 bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => (window.location.href = '/marketplace?category=coding')}>
            <div className="flex items-start gap-3">
              <Icon name="rocket" className="w-5 h-5 mt-1" />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Coding Assistant</h3>
                <p className="text-sm text-muted-foreground mb-2">Ship PR reviews, refactors, and docs with guardrails.</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">coding</Badge>
                  <Badge variant="outline">analysis</Badge>
                  <Badge variant="outline">automation</Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => (window.location.href = '/marketplace?category=data')}>
            <div className="flex items-start gap-3">
              <Icon name="activity" className="w-5 h-5 mt-1" />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Data Analyst</h3>
                <p className="text-sm text-muted-foreground mb-2">Query, summarize, and visualize with reproducible steps.</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">data</Badge>
                  <Badge variant="outline">analysis</Badge>
                  <Badge variant="outline">reporting</Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => (window.location.href = '/marketplace?category=integration')}>
            <div className="flex items-start gap-3">
              <Icon name="plug" className="w-5 h-5 mt-1" />
              <div className="flex-1">
                <h3 className="font-medium mb-1">Integration Toolkit</h3>
                <p className="text-sm text-muted-foreground mb-2">Connect Slack, GitHub, Notion, and more in minutes.</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">integration</Badge>
                  <Badge variant="outline">automation</Badge>
                  <Badge variant="outline">communication</Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
