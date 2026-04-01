'use client'

import Hero from '@/app/components/Hero'
import HeroImageShowcase from '@/app/components/HeroImageShowcase'
import UseCases from '@/app/components/UseCases'
import TestimonialsSection from '@/app/components/TestimonialsSection'
import Security from '@/app/components/Security'
import FAQ from '@/app/components/FAQ'
import FinalCTA from '@/app/components/FinalCTA'
import StarryBackground from '@/app/components/StarryBackground'
import { PublicFooter } from '@/app/components/PublicFooter'

import { StarTheme } from '@/components/theme-context'
import PublicHeader from '@/components/navigation/PublicHeader'
import type { AgentTemplateModel, ToolTemplateModel } from '@starships/protocol'
import dynamic from 'next/dynamic'

// `useAuth` / `useUserStarships` need TanStack Query. Some SSR paths (e.g. Next 16 + Turbopack)
// do not see `QueryClientProvider` for this segment; load after mount so hooks run on the client only.
const PricingTeaser = dynamic(() => import('@/app/components/PricingTeaser'), {
  ssr: false,
  loading: () => (
    <section className="relative bg-white pt-8 pb-12 sm:pt-10 sm:pb-14 px-4" aria-busy>
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="min-h-[148px] rounded-none bg-slate-100/80 sm:min-h-[160px]" />
      </div>
    </section>
  ),
})

export default function HomePageClient(props: { initialAgentTemplates?: AgentTemplateModel[]; initialToolTemplates?: ToolTemplateModel[] }) {
  const initialAgentTemplates = props.initialAgentTemplates ?? []
  const initialToolTemplates = props.initialToolTemplates ?? []

  return (
    <StarTheme theme="dark">
      <div className="min-h-[100dvh] bg-[#050b24] relative">
        <StarryBackground className="opacity-70" style={{ '--star-color': 'rgba(255,255,255,0.9)' } as any} />
        {/* Bottom glow for the whole landing page (decorative background, never above content).
            NOTE: This is the original footer glow – kept as-is. */}
        <div
          className="absolute inset-x-0 bottom-[10vh] h-[120vh] pointer-events-none z-[1]"
          style={{
            backgroundImage: [
              // Core bottom glow - very subtle
              'radial-gradient(ellipse 1000px 700px at 50% 94%, rgba(168,85,247,0.16), transparent 65%)',
              // Secondary layer - blue/purple blend
              'radial-gradient(ellipse 1200px 850px at 50% 96%, rgba(139,92,246,0.12), transparent 70%)',
              // Outer spread - indigo/blue, barely visible
              'radial-gradient(ellipse 1400px 1000px at 50% 100%, rgba(99,102,241,0.10), transparent 75%)',
              // Soft cyan accent
              'radial-gradient(ellipse 1300px 950px at 50% 97%, rgba(59,130,246,0.08), transparent 72%)',
              // Farthest fade - faint halo
              'radial-gradient(ellipse 1600px 1150px at 50% 103%, rgba(124,58,237,0.05), transparent 78%)',
            ].join(', '),
          }}
          aria-hidden
        />

        {/* Foreground content */}
        <div className="relative z-10">
          <PublicHeader />

          {/* Hero alone: keep horizontal clip without forcing overflow-y (which would clip the showcase overlap). */}
          <div className="overflow-x-hidden">
            <Hero initialAgentTemplates={initialAgentTemplates} />
          </div>
          <HeroImageShowcase />
          <div className="overflow-x-hidden">
            {/* Remaining landing sections */}
            <UseCases />
            <TestimonialsSection />
            <Security />
            <PricingTeaser />
            <div className="bg-white text-slate-900">
              <FAQ />
              <FinalCTA />
            </div>
            <PublicFooter fromPath="/" continuesLandingBackground topDividerVariant="landingDark" />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}
