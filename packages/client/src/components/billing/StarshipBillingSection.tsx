'use client'

import React, { useEffect, useMemo } from 'react'
import BillingOverviewCard from '@/components/billing/BillingOverviewCard'
import AmountSelector from '@/components/billing/AmountSelector'
import LedgerHistoryTable from '@/components/billing/LedgerHistoryTable'
import PromoRedeemForm from '@/components/billing/PromoRedeemForm'
import { useWallet } from '@/hooks/useWallet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

const SECTION_CARD_CLASS = 'relative overflow-hidden rounded-lg bg-card border border-border/40 shadow-sm'
const CREDITS_PER_USD = 100

function TopupStatusCallout({ starshipId }: { starshipId?: string }): React.JSX.Element | null {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const topup = searchParams.get('topup')
  const topupId = searchParams.get('topupId') ?? undefined
  const amountParam = searchParams.get('amount') ?? undefined
  const reason = searchParams.get('reason') ?? undefined

  const amountUsd = useMemo(() => {
    if (!amountParam) return null
    const parsed = Number(amountParam)
    if (Number.isNaN(parsed)) return null
    return parsed
  }, [amountParam])

  const amountFormatted = useMemo(() => {
    if (amountUsd == null) return null
    return amountUsd.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  }, [amountUsd])

  const creditsFormatted = useMemo(() => {
    if (amountUsd == null) return null
    return Math.round(amountUsd * CREDITS_PER_USD).toLocaleString()
  }, [amountUsd])

  const dismiss = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('topup')
    next.delete('topupId')
    next.delete('amount')
    next.delete('reason')
    next.delete('status')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  useEffect(() => {
    if (topup !== 'success') return
    if (!starshipId) return
    queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
  }, [queryClient, starshipId, topup])

  if (topup !== 'success' && topup !== 'cancelled' && topup !== 'failure') return null

  const isSuccess = topup === 'success'
  const title = isSuccess ? 'Credits added' : 'Top-up not completed'
  const description = isSuccess
    ? amountFormatted && creditsFormatted
      ? `Added ${creditsFormatted} credits (${amountFormatted}).`
      : 'Your purchase completed successfully. Your wallet balance will update shortly.'
    : reason
      ? `Stripe reported: “${reason.replace(/_/g, ' ')}”. No credits were added.`
      : 'Stripe did not complete the transaction. No credits were added.'

  const iconName = isSuccess ? 'check-circle' : 'alert-triangle'
  const borderClass = isSuccess ? 'border-emerald-500/30' : 'border-rose-500/30'
  const bgClass = isSuccess ? 'bg-emerald-500/5' : 'bg-rose-500/5'
  const titleClass = isSuccess ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'

  return (
    <Card className={`${SECTION_CARD_CLASS} ${borderClass} ${bgClass}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Icon name={iconName} className={`h-4 w-4 ${titleClass}`} />
            <CardTitle className={`text-sm ${titleClass}`}>{title}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="text-sm text-muted-foreground">
          <div>{description}</div>
          {topupId ? <div className="mt-2 text-xs">Top-up ID: <span className="font-mono">{topupId}</span></div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)

  return (
    <div className="mt-4 space-y-4">
      <TopupStatusCallout starshipId={starshipId} />

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
