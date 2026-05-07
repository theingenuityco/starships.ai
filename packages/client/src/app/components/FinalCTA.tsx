'use client'

import { landingSecondaryCtaDark } from '@/app/components/landing/landingSurface'
import Icon from '@/components/primitives/Icon'
import { track } from '@/lib/analytics'

export default function FinalCTA() {
  return (
    <section className="relative z-20 px-4 py-20 sm:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="mb-3 text-2xl font-bold text-white sm:mb-4 sm:text-3xl md:text-4xl">
          Got a <span className="text-primary">wild idea?</span>
        </h2>
        <p className="mb-5 text-sm text-white/60 sm:mb-6 sm:text-base">Beam us a message. Humans are on the other end.</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            className={`${landingSecondaryCtaDark} h-12 w-full min-w-[11rem] px-8 sm:w-auto`}
            onClick={() => {
              window.open('https://github.com/brayn003/starships.ai', '_blank')
            }}
          >
            <Icon name="github" className="h-4 w-4" /> View on GitHub
          </button>
          <button
            type="button"
            className={`${landingSecondaryCtaDark} h-12 w-full min-w-[11rem] px-8 sm:w-auto`}
            onClick={() => {
              track({ type: 'discord_cta_clicked' })
              window.open('https://discord.gg/wzF7xfjrKv', '_blank')
            }}
          >
            <Icon name="discord" className="h-4 w-4" /> Join Discord
          </button>
        </div>
      </div>
    </section>
  )
}
