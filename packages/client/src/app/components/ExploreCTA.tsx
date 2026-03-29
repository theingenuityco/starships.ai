'use client'

import { landingSecondaryCta } from '@/app/components/landing/landingSurface'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'

type ExploreRequestKind = 'agent' | 'connector' | 'automation' | 'anything'

function ctaLabelFor(kind: ExploreRequestKind): string {
  if (kind === 'anything') return 'Request anything'
  const article = kind === 'connector' ? 'a' : 'an'
  return `Request ${article} ${kind}`
}

export default function ExploreCTA(props: { kind: ExploreRequestKind; tone?: 'light' | 'dark' }) {
  const kind = props.kind
  const tone = props.tone ?? 'light'
  const label = ctaLabelFor(kind)
  const isDark = tone === 'dark'

  return (
    <section className={`relative z-20 py-20 sm:py-24 px-4 ${isDark ? 'text-white' : ''}`}>
      <div className="max-w-4xl mx-auto text-center">
        <h2 className={`text-2xl sm:text-3xl md:text-4xl font-semibold mb-3 sm:mb-4 ${isDark ? 'text-white' : ''}`}>
          Looking for something specific?
        </h2>
        <p className={`text-sm sm:text-base mb-5 sm:mb-6 ${isDark ? 'text-white/75' : 'text-muted-foreground'}`}>
          Tell us what you want to see in Explore and we’ll build it (or help you build it).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <button
            type="button"
            className={`${landingSecondaryCta} h-12 w-full min-w-[11rem] px-8 sm:w-auto`}
            onClick={() => {
              track({ type: 'explore_request_cta_clicked', destination: 'mailto:tech@theingenuity.co', kind })
              window.location.href = 'mailto:tech@theingenuity.co'
            }}
          >
            <Icon name="chat" className="h-4 w-4" /> {label}
          </button>
        </div>
      </div>
    </section>
  )
}
