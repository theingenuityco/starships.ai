import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function MarketplaceTeaser() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-semibold mb-2">Launch from the Marketplace</h2>
            <p className="text-muted-foreground">Browse ready‑to‑use agent and tool templates. Deploy in one click, then customize prompts, models, and blueprints.</p>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Button size="lg" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="store" className="w-4 h-4 mr-2" /> Explore marketplace
            </Button>
            <Button size="lg" variant="outline" onClick={() => (window.location.href = '/marketplace')}>
              <Icon name="tag" className="w-4 h-4 mr-2" /> Templates
            </Button>
          </div>
        </div>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Card className="p-5 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="sparkles" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">One‑click deploy</h3>
                <p className="text-sm text-muted-foreground">Start with a proven base and get productive immediately.</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="wrench" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Customize anything</h3>
                <p className="text-sm text-muted-foreground">Edit prompts, models, and blueprints to fit your workflow.</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="check-circle" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Type‑safe by design</h3>
                <p className="text-sm text-muted-foreground">Schema‑aware tools and blueprint linting built‑in.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
