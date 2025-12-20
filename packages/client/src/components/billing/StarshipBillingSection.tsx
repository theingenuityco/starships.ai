'use client'


import React, { useEffect } from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'
import PromoRedeemForm from '@/components/billing/PromoRedeemForm'
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
      {/* Left: Overview + Promo (stacked) */}
      <div className="space-y-4 flex flex-col justify-center">
        <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} />
        {starshipId && <PromoRedeemForm starshipId={starshipId} />}
      </div>

      {/* Right: Top-up amounts */}
      {starshipId && (
        <div className="space-y-4">
          <AmountSelector starshipId={starshipId} />
        </div>
      )}

      {/* Full-width: Ledger */}
      {wallet?.id && (
        <div className="lg:col-span-2">
          <LedgerHistoryTable walletId={wallet.id} view="full" title="Credit ledger" />
        </div>
      )}
    </div>
  )
}
