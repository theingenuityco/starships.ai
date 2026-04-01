import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import ComparisonPageClient from './comparison-page-client'
import { getComparisonContent } from '@/app/compare/comparison-content'

type PageProps = {
  params: Promise<{ competitor: string }>
}

export const dynamic = 'force-static'
export const revalidate = 3600

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const content = getComparisonContent(params.competitor)

  if (!content) {
    return {
      title: 'Compare | Starships.ai',
      description: 'Compare Starships.ai against other workflow platforms.',
    }
  }

  return {
    title: content.seo.title,
    description: content.seo.description,
    alternates: {
      canonical: `https://starships.ai${content.seo.canonicalPath}`,
    },
    openGraph: {
      type: 'website',
      siteName: 'Starships.ai',
      title: content.seo.title,
      description: content.seo.description,
      url: `https://starships.ai${content.seo.canonicalPath}`,
      locale: 'en_US',
      images: [
        {
          url: '/static-assets/og.jpg',
          width: 1200,
          height: 630,
          alt: content.seo.ogAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.seo.title,
      description: content.seo.description,
      images: ['/static-assets/og.jpg'],
    },
  }
}

export async function generateStaticParams(): Promise<Array<{ competitor: string }>> {
  return [{ competitor: 'motion' }]
}

export default async function CompareCompetitorPage(props: PageProps) {
  const params = await props.params
  const content = getComparisonContent(params.competitor)

  if (!content) notFound()

  return <ComparisonPageClient content={content} />
}
