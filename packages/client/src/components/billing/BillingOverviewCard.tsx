'use client'

import { WalletModel } from '@starships/protocol'
import React from 'react'

interface BillingOverviewCardProps {
  wallet?: WalletModel | null
  isLoading?: boolean
  error?: unknown
}

export default function BillingOverviewCard({ wallet, isLoading, error }: BillingOverviewCardProps): React.JSX.Element {
  const hasError = !!error
  const displayAmount = Number(wallet?.balance ?? 0).toFixed(2)

  return (
    <div className="rounded-2xl border border-border/40 bg-background p-6 shadow-sm max-w-md">
      <h3 className="text-sm font-medium text-muted-foreground">Available balance</h3>
      <div className="mt-4 text-3xl font-semibold">{isLoading ? 'Loading...' : hasError ? '—' : `$${displayAmount} USD`}</div>
      {hasError && <p className="mt-2 text-xs text-destructive">Failed to load wallet. Please retry.</p>}
    </div>
  )
}
