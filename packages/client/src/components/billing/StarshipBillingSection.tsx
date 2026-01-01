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
import { useStarship, STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { useSubscribeStarship } from '@/hooks/useSubscribeStarship'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

export interface StarshipBillingSectionProps {
  starshipId?: string
}

const SECTION_CARD_CLASS = 'relative overflow-hidden rounded-lg bg-card border border-border/40 shadow-sm'

export default function StarshipBillingSection({ starshipId }: StarshipBillingSectionProps): React.JSX.Element {
  const enabled = Boolean(starshipId)
  const { data: wallet, isLoading, error } = useWallet(starshipId || '', enabled)
  const { data: starship } = useStarship(starshipId || '', enabled)
  const { data: plans } = useSubscriptionPlans(true)
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const subscribeMutation = useSubscribeStarship()
  const { toast } = useToast()

  // After successful Stripe redirect, refresh wallet balance
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success' && starshipId) {
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) })
    }
  }, [searchParams, queryClient, starshipId])

  const handleSubscribe = async (priceId: string) => {
    if (!starshipId) return
    try {
      const result = await subscribeMutation.mutateAsync({ starshipId, priceId })
      if (result.mode === 'checkout') {
        if (result.checkoutUrl) window.location.href = result.checkoutUrl
        else throw new Error('No checkout URL received')
      } else {
        // Updated immediately (Stripe subscription item updated); refresh starship + wallet UI.
        queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) })
        queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
      }
    } catch (e) {
      toast({
        title: 'Plan Change Failed',
        description: e instanceof Error ? e.message : 'Failed to change plan. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Compact sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Balance + Add credits + Promo (stacked) */}
        <div className="space-y-4">
          <Card className={SECTION_CARD_CLASS}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <BillingOverviewCard wallet={wallet} isLoading={isLoading} error={error} variant="compact" />
            </CardContent>
          </Card>

          {/* Add credits */}
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

        {/* Right column: Ship class (plans) */}
        <div className="space-y-4">
          {/* Ship class / plans */}
          {starship && (
            <Card className={SECTION_CARD_CLASS}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Ship class</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                {/* Plan options (from Stripe Price metadata). Add a new plan in Stripe and it appears here without code changes. */}
                {Array.isArray(plans) && plans.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[...plans]
                      .sort((a, b) => {
                        const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
                        const ar = shipClassOrder[a.shipClass] ?? 999
                        const br = shipClassOrder[b.shipClass] ?? 999
                        if (ar !== br) return ar - br

                        // Tie-breaks to keep deterministic ordering if multiple prices exist per class
                        const au = typeof a.unitAmount === 'number' ? a.unitAmount : Number.MAX_SAFE_INTEGER
                        const bu = typeof b.unitAmount === 'number' ? b.unitAmount : Number.MAX_SAFE_INTEGER
                        if (au !== bu) return au - bu
                        return a.displayName.localeCompare(b.displayName)
                      })
                      .map(plan => {
                        const isCurrent = plan.shipClass === starship.shipClass
                        const priceLabel =
                          plan.unitAmount === null ? '' : plan.unitAmount === 0 ? 'Free' : `$${(plan.unitAmount / 100).toFixed(2)} ${plan.currency.toUpperCase()}/${plan.interval ?? 'mo'}`
                        const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
                        const currentRank = shipClassOrder[starship.shipClass] ?? 0
                        const planRank = shipClassOrder[plan.shipClass] ?? 0
                        const isUpgrade = !isCurrent && planRank > currentRank
                        const isDowngrade = !isCurrent && planRank < currentRank
                        const ctaText = isCurrent
                          ? 'Current plan'
                          : subscribeMutation.isPending
                            ? 'Updating…'
                            : isUpgrade
                              ? `Upgrade to ${plan.displayName}`
                              : isDowngrade
                                ? `Downgrade to ${plan.displayName}`
                                : `Switch to ${plan.displayName}`

                        return (
                          <div
                            key={plan.priceId}
                            className={`
                            relative p-3 rounded-2xl border-2 transition-all duration-200 group text-left h-full w-full
                            ${subscribeMutation.isPending ? 'opacity-70' : ''}
                            ${isCurrent ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50 hover:bg-accent/50'}
                          `}
                          >
                            <div className="h-full flex flex-col">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={`font-medium truncate transition-colors ${isCurrent ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>{plan.displayName}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{priceLabel}</div>
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground mt-2 space-y-0.5 w-full">
                                <div className="grid grid-cols-[1fr_auto] items-center gap-2 w-full">
                                  <span>Max agents</span>
                                  <span className="font-medium text-foreground text-right">{plan.entitlements.maxAgents}</span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-2 w-full">
                                  <span>Parallel conversations</span>
                                  <span className="font-medium text-foreground text-right">{plan.entitlements.maxConcurrentTurns}</span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto] items-center gap-2 w-full">
                                  <span>Monthly credits</span>
                                  <span className="font-medium text-foreground text-right">{plan.entitlements.monthlyCredits}</span>
                                </div>
                              </div>

                              <div className="mt-3 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSubscribe(plan.priceId)}
                                  disabled={subscribeMutation.isPending || isCurrent}
                                  variant={isCurrent ? 'secondary' : 'default'}
                                >
                                  {ctaText}
                                </Button>
                              </div>
                            </div>

                            {/* Selected styling is conveyed via border/bg/shadow; no dot badge. */}
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
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
