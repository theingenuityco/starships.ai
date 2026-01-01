'use client'

import React, { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PROFILE_SECTION_CARD_CLASS } from '@/components/profile/profileCardClasses'

import { useStarship, STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { useSubscribeStarship } from '@/hooks/useSubscribeStarship'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { useToast } from '@/hooks/useToast'

export interface StarshipUpgradeSectionProps {
  starshipId: string
}

export function StarshipUpgradeSection({ starshipId }: StarshipUpgradeSectionProps): React.JSX.Element | null {
  const enabled = Boolean(starshipId)
  const { data: starship } = useStarship(starshipId, enabled)
  const { data: plans } = useSubscriptionPlans(true)
  const subscribeMutation = useSubscribeStarship()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  // After successful Stripe redirect, refresh starship + wallet UI.
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success' && starshipId) {
      queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) })
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
    }
  }, [searchParams, queryClient, starshipId])

  const handleSubscribe = async (priceId: string) => {
    try {
      const result = await subscribeMutation.mutateAsync({ starshipId, priceId })
      if (result.mode === 'checkout') {
        if (result.checkoutUrl) window.location.href = result.checkoutUrl
        else throw new Error('No checkout URL received')
      } else {
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

  if (!starship) return null

  const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
  const currentRank = shipClassOrder[starship.shipClass] ?? 0

  const accentByClass: Record<string, { ring: string; stripe: string; badge: string }> = {
    scout: {
      ring: 'ring-amber-500/20',
      stripe: 'from-amber-500/35 via-amber-500/10 to-transparent',
      badge: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    },
    frigate: {
      ring: 'ring-violet-500/20',
      stripe: 'from-violet-500/30 via-violet-500/10 to-transparent',
      badge: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
    cruiser: {
      ring: 'ring-neutral-900/20 dark:ring-neutral-100/20',
      stripe: 'from-neutral-900/20 via-neutral-900/10 to-transparent dark:from-neutral-50/10 dark:via-neutral-50/5',
      badge: 'border-neutral-900/30 bg-neutral-900/10 text-neutral-900 dark:border-neutral-100/20 dark:bg-neutral-50/10 dark:text-neutral-100',
    },
  }

  return (
    <Card className={PROFILE_SECTION_CARD_CLASS}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="layers" className="h-4 w-4 text-primary" />
          Upgrade starship
        </CardTitle>
        <CardDescription className="text-sm">Change your ship class and included limits.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {Array.isArray(plans) && plans.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[...plans]
                .sort((a, b) => {
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
                const planRank = shipClassOrder[plan.shipClass] ?? 0
                const isUpgrade = !isCurrent && planRank > currentRank
                const isDowngrade = !isCurrent && planRank < currentRank
                const accent = accentByClass[plan.shipClass] ?? accentByClass.scout

                const price =
                  plan.unitAmount === null ? null : plan.unitAmount === 0 ? 'Free' : `$${(plan.unitAmount / 100).toFixed(2)}`
                const cadence =
                  plan.unitAmount === null ? '' : plan.unitAmount === 0 ? '' : `${plan.currency.toUpperCase()}/${plan.interval ?? 'mo'}`
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
                      relative overflow-hidden rounded-2xl border text-left h-full w-full cursor-default transition-all duration-200
                      ${subscribeMutation.isPending ? 'opacity-70' : ''}
                      ${isCurrent ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10 ring-1 ring-primary/20' : `border-border bg-card hover:border-primary/40 hover:shadow-md ${accent.ring}`}
                    `}
                  >
                    <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accent.stripe}`} />

                    {/* Top meta */}
                    <div className="relative p-4 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold tracking-tight truncate">{plan.displayName}</div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <div className="text-2xl font-bold tracking-tight">{price ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{cadence}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              <Icon name="check-circle" className="h-3.5 w-3.5" />
                              Current
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${accent.badge}`}>
                              <Icon name={isUpgrade ? 'arrow-up' : isDowngrade ? 'arrow-down' : 'repeat'} className="h-3.5 w-3.5" />
                              {isUpgrade ? 'Upgrade' : isDowngrade ? 'Downgrade' : 'Switch'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-muted-foreground">
                        Built-in limits for this class:
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <div className="px-4 pb-4 space-y-2">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Icon name="users" className="h-3.5 w-3.5" />
                            Max agents
                          </span>
                          <span className="font-semibold tabular-nums">{plan.entitlements.maxAgents}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Icon name="zap" className="h-3.5 w-3.5" />
                            Parallel conversations
                          </span>
                          <span className="font-semibold tabular-nums">{plan.entitlements.maxConcurrentTurns}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Icon name="coins" className="h-3.5 w-3.5" />
                            Monthly credits
                          </span>
                          <span className="font-semibold tabular-nums">{plan.entitlements.monthlyCredits}</span>
                        </div>
                      </div>

                      <div className="px-4 pb-4 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSubscribe(plan.priceId)}
                          disabled={subscribeMutation.isPending || isCurrent}
                          variant={isCurrent ? 'secondary' : 'default'}
                          className="w-full"
                        >
                          {ctaText}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
                })}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="external-link" className="h-3.5 w-3.5" />
              You will be redirected to Stripe to complete your payment.
            </p>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No upgrade plans available.</div>
        )}
      </CardContent>
    </Card>
  )
}


