import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'

export default function FinalCTA() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-3 sm:mb-4">Got a wild idea?</h2>
        <p className="text-sm sm:text-base text-muted-foreground mb-5 sm:mb-6">Beam us a message. Humans are on the other end.</p>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Button size="lg" variant="outline" onClick={() => (window.location.href = 'mailto:tech@theingenuity.co')}>
            <Icon name="chat" className="w-4 h-4 mr-2" /> Contact us
          </Button>
        </div>
      </div>
    </section>
  )
}
