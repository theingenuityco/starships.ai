'use client'

import React from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import { useWallet } from '@/hooks/useWallet'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)

  return (
    <>
      <h3 id="billing-section" className="text-lg font-semibold">
        Billing
      </h3>
      <div className="mt-4 space-y-4">
        <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} />
      </div>
    </>
  )
}
