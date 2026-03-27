import type { Metadata } from 'next'
import PricingPageClient from './pricing-page-client'

export const metadata: Metadata = {
  title: 'Pricing | Starships.ai',
  description: 'Compare Starships.ai plans by ship class, limits, and monthly credits.',
}

export const dynamic = 'force-dynamic'

export default function PricingPage() {
  return <PricingPageClient />
}
