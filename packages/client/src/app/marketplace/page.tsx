import { Suspense } from 'react'
import type { Metadata } from 'next'
import MarketplacePageClient from './MarketplacePageClient'
import PublicHeader from '@/components/navigation/PublicHeader'

export const metadata: Metadata = {
  title: 'Marketplace | Starships.ai',
  description: 'Discover and deploy pre-built AI agents and tools from the Starships.ai community. Browse templates for customer support, automation, research, and more.',
  alternates: {
    canonical: 'https://starships.ai/marketplace',
  },
  keywords: [
    'AI agents marketplace',
    'agent templates',
    'AI tools',
    'automation templates',
    'pre-built agents',
    'AI marketplace',
    'agent library',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Marketplace | Starships.ai',
    description: 'Discover and deploy pre-built AI agents and tools from the Starships.ai community. Browse templates for customer support, automation, research, and more.',
    url: 'https://starships.ai/marketplace',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai Marketplace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marketplace | Starships.ai',
    description: 'Discover and deploy pre-built AI agents and tools from the Starships.ai community. Browse templates for customer support, automation, research, and more.',
    images: ['/static-assets/og.jpg'],
  },
}

export default function MarketplacePage() {
  return (
    <>
      <Suspense fallback={<div className="bg-background min-h-[50vh]" />}>
        <MarketplacePageClient />
      </Suspense>
    </>
  )
}
