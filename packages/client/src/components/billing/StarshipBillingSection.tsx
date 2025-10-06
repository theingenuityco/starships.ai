'use client'

import React from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import { useWallet } from '@/hooks/useWallet'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} />
      {starshipId && (
        <div className="space-y-2">
          <AmountSelector starshipId={starshipId} />
        </div>
      )}
    </div>
  )
}
