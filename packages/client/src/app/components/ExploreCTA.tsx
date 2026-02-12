'use client'

import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'

type ExploreRequestKind = 'agent' | 'connector' | 'automation' | 'anything'

function ctaLabelFor(kind: ExploreRequestKind): string {
  if (kind === 'anything') return 'Request anything'
  const article = kind === 'connector' ? 'a' : 'an'
  return `Request ${article} ${kind}`
}

export default function ExploreCTA(props: { kind: ExploreRequestKind }) {
  const kind = props.kind
  const label = ctaLabelFor(kind)

  return (
    <section className="relative z-20 py-14 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-3 sm:mb-4">Looking for something specific?</h2>
        <p className="text-sm sm:text-base text-muted-foreground mb-5 sm:mb-6">
          Tell us what you want to see in Explore and we’ll build it (or help you build it).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Button
            size="lg"
            variant="outline"
            className="bg-transparent border-current text-muted-foreground"
            onClick={() => {
              track({ type: 'explore_request_cta_clicked', destination: 'mailto:tech@theingenuity.co', kind })
              window.location.href = 'mailto:tech@theingenuity.co'
            }}
          >
            <Icon name="chat" className="w-4 h-4 mr-2" /> {label}
          </Button>
        </div>
      </div>
    </section>
  )
}

