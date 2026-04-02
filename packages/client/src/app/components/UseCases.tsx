import CollaborationHighlights from '@/app/components/CollaborationHighlights'
import ConnectorHighlights from '@/app/components/ConnectorHighlights'
import InvertedShowcaseHighlights from '@/app/components/InvertedShowcaseHighlights'
import { landingPrimaryCtaSection, shellMuted, shellMutedLift } from '@/app/components/landing/landingSurface'
import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import Link from 'next/link'

const LANDING_USE_CASE_CARDS = [
  {
    title: 'Lead generation',
    description: 'Find high-intent prospects quickly and generate tailored outreach-ready lead lists.',
    imageSrc: '/landing/showcase/lead-generation.png',
    imageAlt: 'Lead generation use case preview',
  },
  {
    title: 'Lead enrichment',
    description: 'Append firmographic details, contacts, and context so every lead is actionable.',
    imageSrc: '/landing/showcase/lead-enrichment.png',
    imageAlt: 'Lead enrichment use case preview',
  },
  {
    title: 'Lead reach out',
    description: 'Draft personalized outreach at scale and prepare messages for immediate send.',
    imageSrc: '/landing/showcase/gmail.png',
    imageAlt: 'Lead reach out use case preview',
  },
] as const

export default function UseCases() {
  return (
    <section className="relative pt-8 sm:pt-10 md:pt-12 pb-0 text-slate-900" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
      <div className="relative max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-center text-slate-900">
          How it <span className="text-primary">works?</span>
        </h2>
        <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto mb-10 md:mb-14">Deploy agents, add tools, and collaborate in one workspace.</p>

        <CollaborationHighlights />

        <div className="mt-10 sm:mt-12 md:mt-14">
          <h3 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
            Use <span className="text-primary">Cases</span>
          </h3>
          <div className="mt-6 sm:mt-8 space-y-5 sm:space-y-6">
            {LANDING_USE_CASE_CARDS.map(useCase => (
              <article key={useCase.title} className={`w-full p-3 sm:p-4 md:p-5 ${shellMuted} ${shellMutedLift}`}>
                <div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 lg:flex-row">
                  <div className="w-full lg:flex-1 rounded-none overflow-hidden border border-slate-200 bg-white">
                    <img
                      src={useCase.imageSrc}
                      alt={useCase.imageAlt}
                      className="block w-full h-auto use-case-zoom-image"
                      style={{
                        animationName: 'use-case-zoom-pan-loop',
                        animationDuration: '6200ms',
                        animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        animationDelay: '600ms',
                        animationIterationCount: 'infinite',
                        transformOrigin: 'center top',
                      }}
                    />
                  </div>
                  <div className="w-full lg:w-[320px] text-left rounded-none p-2 sm:p-3 md:p-4">
                    <h4 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">{useCase.title}</h4>
                    <p className="mt-3 text-sm sm:text-base text-slate-700 max-w-md">{useCase.description}</p>
                    <div className="mt-6">
                      <Link href="/login" className={landingPrimaryCtaSection}>
                        Get Started Free
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 sm:mt-12 md:mt-16 bg-white py-10 sm:py-12 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <ConnectorHighlights />

          <div className="mt-10 sm:mt-12 md:mt-16">
            <InvertedShowcaseHighlights />
          </div>

          {/* Schedule repetitive tasks */}
          <div className="mt-10 sm:mt-12 md:mt-16">
            <div className={`w-full p-3 sm:p-4 md:p-5 ${shellMuted} ${shellMutedLift}`}>
              <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-5 md:gap-6">
                <div
                  className="w-full lg:flex-1 rounded-none p-2.5 sm:p-3 md:p-4"
                  style={{
                    background: [
                      'linear-gradient(95deg, rgba(189,126,52,0.92) 0%, rgba(150,70,156,0.90) 32%, rgba(114,47,166,0.92) 58%, rgba(39,24,94,0.95) 100%)',
                      'radial-gradient(circle at 6% 50%, rgba(251,191,36,0.28) 0%, transparent 34%)',
                      'radial-gradient(circle at 96% 52%, rgba(99,102,241,0.30) 0%, transparent 34%)',
                    ].join(', '),
                  }}
                >
                  <div className="rounded-none overflow-hidden">
                    <ErrorBoundary name="ScheduleRepetitiveTasksDemo">
                      <ScheduleRepetitiveTasksDemo />
                    </ErrorBoundary>
                  </div>
                </div>

                <div className="w-full lg:w-[320px] text-left rounded-none p-4 sm:p-5">
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">Schedule repetitive tasks</h3>
                  <p className="mt-3 text-sm sm:text-base text-slate-700 max-w-md">Set recurring schedules once, then review and approve outcomes as your agents execute.</p>
                  <div className="mt-6">
                    <Link href="/login" className={landingPrimaryCtaSection}>
                      Get Started Free
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
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
            /* After zoom, shift image up to reveal more of the lower content area. */
            transform: scale(1.42) translateY(-16%);
          }
          100% {
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </section>
  )
}
