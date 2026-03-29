import type { Metadata } from 'next'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import { StarTheme } from '@/components/theme-context'
import { USE_CASES_BY_SLUG } from '@/app/use-cases/use-cases.data'
import { UseCaseSections } from '@/app/use-cases/components/UseCaseSections'
import { WordPressSiteHero } from '@/app/use-cases/wordpress-site/WordPressSiteHero'

export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

const useCase = USE_CASES_BY_SLUG['wordpress-site']

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

export default function WordPressSiteUseCasePage() {
  return (
    <StarTheme theme="light">
      <div className="relative min-h-screen bg-background">
        <div className="relative z-10">
          <div className="star-theme-dark dark">
            <div className="fixed left-0 right-0 top-0 z-50">
              <PublicHeader />
            </div>
            <div className="overflow-x-hidden">
              <WordPressSiteHero useCase={useCase} />
            </div>
          </div>

          <main className="overflow-x-hidden bg-white text-slate-900">
            <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
              <UseCaseSections useCase={useCase} />
            </div>
          </main>

          <div suppressHydrationWarning className="h-px w-full bg-gradient-to-r from-transparent via-border/70 to-transparent" aria-hidden />
          <PublicFooter fromPath="/use-cases/wordpress-site" showTopDivider={false} />
        </div>
      </div>
    </StarTheme>
  )
}
