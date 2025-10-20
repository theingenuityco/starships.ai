import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function PricingTeaser() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <Card className="p-6 bg-white/5 border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold mb-2">Pricing that scales with you</h2>
            <p className="text-sm text-muted-foreground">Dev (free), Team, Enterprise. Start free, upgrade when ready.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => (window.location.href = '/pricing')}>See pricing</Button>
            <Button variant="outline" onClick={() => (window.location.href = '/signup')}>
              Start free
            </Button>
          </div>
        </Card>
      </div>
    </section>
  )
}
