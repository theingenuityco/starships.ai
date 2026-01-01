'use client'

import React from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'
import PromoRedeemForm from '@/components/billing/PromoRedeemForm'
import { useWallet } from '@/hooks/useWallet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

const SECTION_CARD_CLASS = 'relative overflow-hidden rounded-lg bg-card border border-border/40 shadow-sm'

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)

  return (
    <div className="mt-4 space-y-4">
      {/* Balance + Promotion (left) and Add credits (right) */}
      <div className={starshipId ? 'grid gap-4 md:grid-cols-2 md:items-start' : 'grid gap-4'}>
        <div className="space-y-4">
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} variant="compact" />
            </CardContent>
          </Card>

          {starshipId ? (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Promotion</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <PromoRedeemForm starshipId={starshipId} variant="compact" className="border-0 bg-transparent p-0 shadow-none backdrop-blur-0" />
              </CardContent>
            </Card>
          ) : null}
        </div>

        {starshipId ? (
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Add credits</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <AmountSelector starshipId={starshipId} variant="compact" />
            </CardContent>
          </Card>
        ) : null}
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
