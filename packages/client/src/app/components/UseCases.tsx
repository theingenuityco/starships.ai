'use client'

import CollaborationHighlights from '@/app/components/CollaborationHighlights'
import ConnectorHighlights from '@/app/components/ConnectorHighlights'
import InvertedShowcaseHighlights from '@/app/components/InvertedShowcaseHighlights'
import { landingPrimaryCtaSection, shellMuted, shellMutedLift } from '@/app/components/landing/landingSurface'
import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'
import Icon from '@/components/primitives/Icon'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import Link from 'next/link'

const LANDING_USE_CASE_CARDS = [
  {
    title: 'Lead generation',
    icon: 'users',
    description: 'Find qualified leads that match your ideal customer profile.',
    imageSrc: '/landing/showcase/lead-generation.png',
    imageAlt: 'Lead generation use case preview',
  },
  {
    title: 'Lead enrichment',
    icon: 'database',
    description: 'Enrich each lead with company details, contacts, and context.',
    imageSrc: '/landing/showcase/lead-enrichment.png',
    imageAlt: 'Lead enrichment use case preview',
  },
  {
    title: 'Lead reach out',
    icon: 'mail',
    description: 'Create personalized outreach messages ready to review and send.',
    imageSrc: '/landing/showcase/gmail.png',
    imageAlt: 'Lead reach out use case preview',
  },
] as const

export function LandingUseCasesSection() {
  return (
    <div className="bg-white py-10 sm:py-12 md:py-14">
      <div className="relative max-w-7xl mx-auto px-4">
        <div className="pt-10 sm:pt-12 md:pt-16">
          <div className="mb-8 sm:mb-10 md:mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
              Use <span className="text-primary">Cases</span>
            </h3>
            <p className="mt-2 text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto">
              Find leads, enrich data, and send outreach faster.
            </p>
          </div>
          <div className="space-y-5 sm:space-y-6">
            {LANDING_USE_CASE_CARDS.map(useCase => (
              <article key={useCase.title} className={`w-full p-3 sm:p-4 md:p-5 ${shellMuted} ${shellMutedLift}`}>
                <div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 lg:flex-row">
                  <div
                    className="w-full lg:flex-1 rounded-lg p-2.5 sm:p-3 md:p-4"
                    style={{
                      background: [
                        useCase.title === 'Lead enrichment'
                          ? 'linear-gradient(95deg, rgba(39,24,94,0.95) 0%, rgba(114,47,166,0.92) 42%, rgba(150,70,156,0.90) 68%, rgba(189,126,52,0.92) 100%)'
                          : 'linear-gradient(95deg, rgba(189,126,52,0.92) 0%, rgba(150,70,156,0.90) 32%, rgba(114,47,166,0.92) 58%, rgba(39,24,94,0.95) 100%)',
                        useCase.title === 'Lead enrichment'
                          ? 'radial-gradient(circle at 6% 50%, rgba(99,102,241,0.30) 0%, transparent 34%)'
                          : 'radial-gradient(circle at 6% 50%, rgba(251,191,36,0.28) 0%, transparent 34%)',
                        useCase.title === 'Lead enrichment'
                          ? 'radial-gradient(circle at 96% 52%, rgba(251,191,36,0.28) 0%, transparent 34%)'
                          : 'radial-gradient(circle at 96% 52%, rgba(99,102,241,0.30) 0%, transparent 34%)',
                      ].join(', '),
                    }}
                  >
                    <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={useCase.imageSrc}
                        alt={useCase.imageAlt}
                        className="block w-full h-auto use-case-zoom-image"
                        style={{
                          animationName: useCase.title === 'Lead enrichment' ? 'use-case-zoom-loop' : 'use-case-zoom-pan-loop',
                          animationDuration: useCase.title === 'Lead enrichment' ? '7200ms' : '6200ms',
                          animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                          animationDelay: '600ms',
                          animationIterationCount: 'infinite',
                          transformOrigin: 'center top',
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-full lg:w-[320px] text-left p-2 sm:p-3 md:p-4">
                    <h4 className="inline-flex items-center gap-2 text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                      <span className="inline-flex items-center justify-center text-primary">
                        <Icon name={useCase.icon} size={22} />
                      </span>
                      {useCase.title}
                    </h4>
                    <p className="mt-2 text-sm md:text-base text-slate-700 max-w-md">{useCase.description}</p>
                    <div className="mt-6">
                      <Link href="/login" className={landingPrimaryCtaSection}>
                        <span>Get Started Free</span>
                        <Icon name="chevron-right" className="ml-1 h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes use-case-zoom-loop {
          0%,
          20% {
            transform: scale(1);
          }
          48%,
          82% {
            transform: scale(1.42);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes use-case-zoom-pan-loop {
          0% {
            transform: scale(1) translateY(0);
          }
          20% {
            transform: scale(1) translateY(0);
          }
          48% {
            transform: scale(1.42) translateY(0);
          }
          82% {
            transform: scale(1.42) translateY(-16%);
          }
          100% {
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default function UseCases() {
  return (
    <section className="relative pb-0 text-slate-900">
      <div className="pt-8 sm:pt-10 md:pt-12 pb-10 sm:pb-12 md:pb-14" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
        <div className="relative max-w-7xl mx-auto px-4">
        <div className="mb-8 sm:mb-10 md:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
            How it <span className="text-primary">works?</span>
          </h2>
          <p className="mt-2 text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto">Deploy agents, add tools, and collaborate in one workspace.</p>
        </div>

        <CollaborationHighlights />
        </div>
      </div>

      <LandingUseCasesSection />

      <div className="py-10 sm:py-12 md:py-14" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8 sm:mb-10 md:mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
              Connector <span className="text-primary">Library</span>
            </h3>
            <p className="mt-2 text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto">
              Connect your stack so agents can take action across every tool your team already uses.
            </p>
          </div>
          <ConnectorHighlights />
        </div>
      </div>

      <div className="bg-white py-10 sm:py-12 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-8 sm:mb-10 md:mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
              Team Workflow <span className="text-primary">Automation</span>
            </h3>
            <p className="mt-2 text-sm md:text-base text-slate-600 text-center">
              Coordinate teammates and recurring tasks in one shared workspace.
            </p>
          </div>

          <div>
            <InvertedShowcaseHighlights />
          </div>

          {/* Schedule repetitive tasks */}
          <div className="mt-10 sm:mt-12 md:mt-16">
            <div className={`w-full p-3 sm:p-4 md:p-5 ${shellMuted} ${shellMutedLift}`}>
              <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-5 md:gap-6">
                <div
                  className="w-full lg:flex-1 rounded-lg p-2.5 sm:p-3 md:p-4"
                  style={{
                    background: [
                      'linear-gradient(95deg, rgba(189,126,52,0.92) 0%, rgba(150,70,156,0.90) 32%, rgba(114,47,166,0.92) 58%, rgba(39,24,94,0.95) 100%)',
                      'radial-gradient(circle at 6% 50%, rgba(251,191,36,0.28) 0%, transparent 34%)',
                      'radial-gradient(circle at 96% 52%, rgba(99,102,241,0.30) 0%, transparent 34%)',
                    ].join(', '),
                  }}
                >
                  <div className="rounded-lg overflow-hidden">
                    <ErrorBoundary name="ScheduleRepetitiveTasksDemo">
                      <ScheduleRepetitiveTasksDemo />
                    </ErrorBoundary>
                  </div>
                </div>

                <div className="w-full lg:w-[320px] text-left p-4 sm:p-5">
                  <h3 className="inline-flex items-center gap-2 text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                    <span className="inline-flex items-center justify-center text-primary">
                      <Icon name="calendar" size={22} />
                    </span>
                    Schedule repetitive tasks
                  </h3>
                  <p className="mt-2 text-sm md:text-base text-slate-700 max-w-md">Set recurring schedules once, then review and approve outcomes as your agents execute.</p>
                  <div className="mt-6">
                    <Link href="/login" className={landingPrimaryCtaSection}>
                      <span>Get Started Free</span>
                      <Icon name="chevron-right" className="ml-1 h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
