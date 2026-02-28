import type { Metadata } from 'next'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import { StarTheme } from '@/components/theme-context'
import { USE_CASES_BY_SLUG } from '@/app/use-cases/use-cases.data'
import { UseCaseSections } from '@/app/use-cases/components/UseCaseSections'
import { LeadGenerationHero } from '@/app/use-cases/lead-generation/LeadGenerationHero'
import { fetchPublicAgentTemplateBySlug } from '@/lib/server/public-templates'

export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

const useCase = USE_CASES_BY_SLUG['lead-generation']

export const metadata: Metadata = {
  title: useCase.seo.title,
  description: useCase.seo.description,
  alternates: {
    canonical: `https://starships.ai${useCase.seo.canonicalPath}`,
  },
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: useCase.seo.title,
    description: useCase.seo.description,
    url: `https://starships.ai${useCase.seo.canonicalPath}`,
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: useCase.seo.ogAlt,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: useCase.seo.title,
    description: useCase.seo.description,
    images: ['/static-assets/og.jpg'],
  },
}

export default async function LeadGenerationUseCasePage() {
  const piper = useCase.primaryTemplateSlug ? await fetchPublicAgentTemplateBySlug({ slug: useCase.primaryTemplateSlug }) : null
  const previewPrompts = piper?.previewPrompts ?? []

  return (
    <StarTheme theme="light">
      <div className="min-h-screen bg-background relative">
        <div
          className="absolute inset-x-0 top-0 h-[620px] pointer-events-none z-[1]"
          aria-hidden
          style={{
            backgroundImage: [
              'radial-gradient(900px 360px at 50% 0%, rgba(124,58,237,0.18), transparent 60%)',
              'radial-gradient(700px 300px at 15% 30%, rgba(59,130,246,0.12), transparent 62%)',
              'radial-gradient(720px 320px at 85% 22%, rgba(245,158,11,0.10), transparent 62%)',
            ].join(', '),
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[120vh] pointer-events-none z-[1]"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse 1000px 700px at 50% 100%, rgba(168,85,247,0.20), transparent 65%)',
              'radial-gradient(ellipse 1200px 850px at 50% 102%, rgba(139,92,246,0.14), transparent 70%)',
              'radial-gradient(ellipse 1400px 1000px at 50% 105%, rgba(99,102,241,0.10), transparent 75%)',
            ].join(', '),
          }}
          aria-hidden
        />

        <div className="relative z-10">
          <div className="fixed top-0 left-0 right-0 z-50">
            <PublicHeader />
          </div>

          <main className="overflow-x-hidden">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="min-h-[95vh]">
                <LeadGenerationHero useCase={useCase} typewriterPrompts={previewPrompts} previewPromptTitles={useCase.previewPromptTitles} />
              </div>
              <div className="pb-12 sm:pb-16">
                <UseCaseSections useCase={useCase} previewPrompts={previewPrompts} />
              </div>
            </div>
          </main>

          <div suppressHydrationWarning className="h-px w-full bg-gradient-to-r from-transparent via-border/70 to-transparent" aria-hidden />
          <PublicFooter fromPath="/use-cases/lead-generation" showTopDivider={false} />
        </div>
      </div>
    </StarTheme>
  )
}
