import type { Metadata } from 'next'

import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import { StarTheme } from '@/components/theme-context'
import { USE_CASES_BY_SLUG } from '@/app/use-cases/use-cases.data'
import { UseCaseHero } from '@/app/use-cases/components/UseCaseHero'
import { UseCaseSections } from '@/app/use-cases/components/UseCaseSections'

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
      <div className="min-h-[100dvh] bg-background relative">
        <div className="relative z-10">
          <PublicHeader />

          <main className="pb-12 sm:pb-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
              <UseCaseHero useCase={useCase} />
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

