import { Suspense } from 'react'
import MarketplacePageClient from './MarketplacePageClient'

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div className="bg-background min-h-[50vh]" />}>
      <MarketplacePageClient />
    </Suspense>
  )
}
