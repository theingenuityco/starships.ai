'use client'

import React from 'react'
import { useWallet } from '@/hooks/useWallet'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'

export default function CreditLedgerSection({ starshipId }: { starshipId?: string }) {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)

  if (!starshipId) {
    return <div className="text-sm text-muted-foreground">Select a starship to view its credit ledger.</div>
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading wallet…</div>
  }

  if (error) {
    return <div className="text-sm text-red-600 dark:text-red-400">Unable to load wallet.</div>
  }

  if (!wallet?.id) {
    return <div className="text-sm text-muted-foreground">No wallet found.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Credit ledger</h2>
        <p className="text-sm text-muted-foreground">All credit activity for this starship, including usage debits.</p>
      </div>
      <LedgerHistoryTable walletId={wallet.id} view="full" title="Credit ledger entries" />
    </div>
  )
}


