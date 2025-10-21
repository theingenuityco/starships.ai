import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'

export default function FinalCTA() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-semibold mb-4">Ready to build?</h2>
        <p className="text-muted-foreground mb-6">Talk directly with our engineering team.</p>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Button size="lg" variant="outline" onClick={() => (window.location.href = 'mailto:team@starships.ai')}>
            <Icon name="chat" className="w-4 h-4 mr-2" /> Talk to engineering
          </Button>
        </div>
      </div>
    </section>
  )
}
