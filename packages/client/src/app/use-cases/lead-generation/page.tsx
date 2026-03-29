import type { Metadata } from 'next'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import { StarTheme } from '@/components/theme-context'
import { USE_CASES_BY_SLUG } from '@/app/use-cases/use-cases.data'
import { UseCaseSections } from '@/app/use-cases/components/UseCaseSections'
import { LeadGenerationHero } from '@/app/use-cases/lead-generation/LeadGenerationHero'

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
  return (
    <StarTheme theme="light">
      <div className="min-h-screen bg-background relative">
        <div className="relative z-10">
          {/* Top band (nav + hero) uses dark/starry theme so nav text matches main landing */}
          <div className="star-theme-dark dark">
            <div className="fixed top-0 left-0 right-0 z-50">
              <PublicHeader />
            </div>
            <div className="overflow-x-hidden">
              <LeadGenerationHero useCase={useCase} />
            </div>
          </div>

          {/* Light page: white bands; cream only on the “See how it works” strip inside UseCaseSections */}
          <main className="overflow-x-hidden bg-white text-slate-900">
            <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
              <UseCaseSections useCase={useCase} />
            </div>
          </main>

          <div suppressHydrationWarning className="h-px w-full bg-gradient-to-r from-transparent via-border/70 to-transparent" aria-hidden />
          <PublicFooter fromPath="/use-cases/lead-generation" showTopDivider={false} />
        </div>
      </div>
    </StarTheme>
  )
}
