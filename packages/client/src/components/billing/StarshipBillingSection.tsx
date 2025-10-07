'use client'

import React, { useEffect } from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import { useWallet, WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  // After successful Stripe redirect, refresh wallet balance
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success' && starshipId) {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
    }
  }, [searchParams, queryClient, starshipId])

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
