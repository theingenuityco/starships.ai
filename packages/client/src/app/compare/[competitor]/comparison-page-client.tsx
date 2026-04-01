'use client'

import Link from 'next/link'

import type { ComparisonContent } from '@/app/compare/comparison-content'
import { PublicFooter } from '@/app/components/PublicFooter'
import { StarTheme } from '@/components/theme-context'
import PublicHeader from '@/components/navigation/PublicHeader'
import ComparisonHero from '@/app/compare/components/ComparisonHero'
import ComparisonFeatureMatrix from '@/app/compare/components/ComparisonFeatureMatrix'
import MigrationSteps from '@/app/compare/components/MigrationSteps'
import ComparisonProofStrip from '@/app/compare/components/ComparisonProofStrip'
import ComparisonFaq from '@/app/compare/components/ComparisonFaq'
import Icon from '@/components/primitives/Icon'
import { landingWhiteCtaOnGradientLg } from '@/app/components/landing/landingSurface'
import HeroImageShowcase from '@/app/components/HeroImageShowcase'

export default function ComparisonPageClient(props: { content: ComparisonContent }) {
  const { content } = props

  return (
    <StarTheme theme="light">
      <div className="min-h-screen bg-background">
        <div className="star-theme-dark dark">
          <div className="fixed left-0 right-0 top-0 z-50">
            <PublicHeader />
          </div>
          <ComparisonHero content={content} />
        </div>

        <main className="overflow-x-hidden bg-white text-slate-900">
          <section className="px-4 py-16 sm:px-8 sm:py-24">
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                Why teams switch from <span className="text-primary">{content.competitorName} to Starships</span>
              </h2>
              <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
                If your team needs more than calendar optimization, these are the operational differences that matter most.
              </p>
              <div className="-mx-4 mt-8 sm:-mx-6">
                <HeroImageShowcase />
              </div>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {content.differentiators.map(item => (
                  <article
                    key={item.title}
                    className="rounded-none border border-slate-200 bg-[#F8F8FA] p-6 shadow-[3px_3px_0_0_rgb(226_232_240)]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-slate-200 bg-white text-primary shadow-[3px_3px_0_0_rgb(226_232_240)]">
                        <Icon name={item.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold tracking-tight text-slate-900">{item.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <ComparisonFeatureMatrix content={content} />
          <MigrationSteps content={content} />
          <ComparisonProofStrip content={content} />

          <section className="mx-auto w-full max-w-7xl px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-10">
            <div className="group relative w-full">
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
              </div>
              <div className="relative flex w-full flex-col items-stretch gap-6 overflow-hidden rounded-none border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-6 py-8 text-white shadow-lg sm:px-8 sm:py-9 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="text-2xl font-semibold text-white md:text-3xl">{content.finalCta.title}</h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/90">{content.finalCta.subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href={content.finalCta.primaryHref} className={landingWhiteCtaOnGradientLg}>
                    {content.finalCta.primaryLabel}
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <ComparisonFaq content={content} />
        </main>

        <PublicFooter fromPath={content.seo.canonicalPath} showTopDivider={true} topDividerVariant="theme" />
      </div>
    </StarTheme>
  )
}
