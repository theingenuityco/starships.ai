import { Suspense } from 'react'
import MarketplacePageClient from './MarketplacePageClient'
import PublicHeader from '@/components/navigation/PublicHeader'

export default function MarketplacePage() {
  return (
    <>
      <PublicHeader />
      <Suspense fallback={<div className="bg-background min-h-[50vh]" />}>
        <div className="pt-16 sm:pt-20">
          <MarketplacePageClient />
        </div>
      </Suspense>
    </>
  )
}
