import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'
import CollaborationHighlights from '@/app/components/CollaborationHighlights'
import ConnectorHighlights from '@/app/components/ConnectorHighlights'
import InvertedShowcaseHighlights from '@/app/components/InvertedShowcaseHighlights'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import Link from 'next/link'

export default function UseCases() {
  return (
    <section className="relative pt-8 sm:pt-10 md:pt-12 pb-0 text-slate-900" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
      <div className="relative max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-center text-slate-900">
          How it <span className="text-primary">works?</span>
        </h2>
        <p className="text-sm md:text-base text-slate-600 text-center max-w-2xl mx-auto mb-10 md:mb-14">Deploy agents, add tools, and collaborate in one workspace.</p>

        <CollaborationHighlights />
      </div>

      <div className="mt-10 sm:mt-12 md:mt-16 bg-white py-10 sm:py-12 md:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <ConnectorHighlights />

          <div className="mt-10 sm:mt-12 md:mt-16">
            <InvertedShowcaseHighlights />
          </div>

          {/* Schedule repetitive tasks */}
          <div className="mt-10 sm:mt-12 md:mt-16">
            <div className="w-full rounded-3xl border border-slate-200 p-3 sm:p-4 md:p-5 shadow-sm" style={{ backgroundColor: '#F8F8FA' }}>
              <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-5 md:gap-6">
                <div
                  className="w-full lg:flex-1 rounded-2xl p-2.5 sm:p-3 md:p-4"
                  style={{
                    background: [
                      'linear-gradient(95deg, rgba(189,126,52,0.92) 0%, rgba(150,70,156,0.90) 32%, rgba(114,47,166,0.92) 58%, rgba(39,24,94,0.95) 100%)',
                      'radial-gradient(circle at 6% 50%, rgba(251,191,36,0.28) 0%, transparent 34%)',
                      'radial-gradient(circle at 96% 52%, rgba(99,102,241,0.30) 0%, transparent 34%)',
                    ].join(', '),
                  }}
                >
                  <div className="rounded-xl overflow-hidden">
                    <ErrorBoundary name="ScheduleRepetitiveTasksDemo">
                      <ScheduleRepetitiveTasksDemo />
                    </ErrorBoundary>
                  </div>
                </div>

                <div className="w-full lg:w-[320px] text-left rounded-2xl p-4 sm:p-5" style={{ backgroundColor: '#F8F8FA' }}>
                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">Schedule repetitive tasks</h3>
                  <p className="mt-3 text-sm sm:text-base text-slate-700 max-w-md">Set recurring schedules once, then review and approve outcomes as your agents execute.</p>
                  <div className="mt-6">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center h-11 px-6 text-sm sm:text-base font-semibold leading-none rounded-full whitespace-nowrap text-white bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition"
                    >
                      Get Started
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
