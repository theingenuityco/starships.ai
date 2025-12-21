'use client'


import React, { useEffect } from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'
import PromoRedeemForm from '@/components/billing/PromoRedeemForm'
import { useWallet, WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

const SECTION_CARD_CLASS =
  'relative overflow-hidden rounded-lg bg-card border border-border/40 shadow-sm'

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
    <div className="mt-4 space-y-4">
      {/* Compact sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Balance + Promo (stacked) */}
        <div className="space-y-4">
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} variant="compact" />
            </CardContent>
          </Card>

          {starshipId && (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Promo</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <PromoRedeemForm starshipId={starshipId} variant="compact" className="border-0 bg-transparent p-0 shadow-none backdrop-blur-0" />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Add credits */}
        {starshipId && (
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Add credits</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <AmountSelector starshipId={starshipId} variant="compact" />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ledger */}
      {wallet?.id && (
        <Card className={SECTION_CARD_CLASS}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <LedgerHistoryTable walletId={wallet.id} view="full" title="Transactions" variant="bare" showTitle={false} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
