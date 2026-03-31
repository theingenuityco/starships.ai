'use client'

import React, { useEffect, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PROFILE_SECTION_CARD_CLASS } from '@/components/profile/profileCardClasses'
import { landingPrimaryCtaSection, landingPrimaryWhiteFaceCtaSection } from '@/app/components/landing/landingSurface'

import { useStarship, STARSHIP_QUERY_KEYS } from '@/hooks/useStarships'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { useSubscribeStarship } from '@/hooks/useSubscribeStarship'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { useToast } from '@/hooks/useToast'
import { useStarshipSubscriptionStatus, STARSHIP_SUBSCRIPTION_QUERY_KEYS } from '@/hooks/useStarshipSubscriptionStatus'
import { useCancelDowngradeStarship } from '@/hooks/useCancelDowngradeStarship'

export interface StarshipUpgradeSectionProps {
  starshipId: string
  /** Optional class for the outer Card (e.g. onboarding uses bg-transparent) */
  cardClassName?: string
  /** If true, hide the "Change your ship class..." description (e.g. onboarding step 4) */
  hideDescription?: boolean
}

export function StarshipUpgradeSection({ starshipId, cardClassName, hideDescription }: StarshipUpgradeSectionProps): React.JSX.Element | null {
  const enabled = Boolean(starshipId)
  const { data: starship } = useStarship(starshipId, enabled)
  const { data: plans } = useSubscriptionPlans(true)
  const { data: subscriptionStatus } = useStarshipSubscriptionStatus(starshipId, enabled)
  const subscribeMutation = useSubscribeStarship()
  const cancelDowngradeMutation = useCancelDowngradeStarship()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const params = useParams<{ slug?: string }>()
  const routeSlug = params?.slug

  const invalidateBillingState = React.useCallback(async (): Promise<void> => {
    if (!starshipId) return
    const tasks: Array<Promise<unknown>> = []
    tasks.push(queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) }))
    tasks.push(queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) }))
    tasks.push(queryClient.invalidateQueries({ queryKey: STARSHIP_SUBSCRIPTION_QUERY_KEYS.status(starshipId) }))
    if (routeSlug) {
      tasks.push(queryClient.invalidateQueries({ queryKey: [...STARSHIP_QUERY_KEYS.all, 'slug', routeSlug] as const }))
    }
    await Promise.all(tasks)
  }, [queryClient, starshipId, routeSlug])

  // After successful Stripe redirect, refresh starship + wallet UI.
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success' && starshipId) {
      void invalidateBillingState()
    }
  }, [searchParams, starshipId, invalidateBillingState])

  const handleSubscribe = async (priceId: string) => {
    try {
      const result = await subscribeMutation.mutateAsync({ starshipId, priceId })
      if (result.mode === 'checkout') {
        if (result.checkoutUrl) window.location.href = result.checkoutUrl
        else throw new Error('No checkout URL received')
      } else {
        await invalidateBillingState()
      }
    } catch (e) {
      toast({
        title: 'Plan Change Failed',
        description: e instanceof Error ? e.message : 'Failed to change plan. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleCancelDowngrade = async () => {
    try {
      await cancelDowngradeMutation.mutateAsync({ starshipId })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STARSHIP_SUBSCRIPTION_QUERY_KEYS.status(starshipId) }),
        queryClient.invalidateQueries({ queryKey: STARSHIP_QUERY_KEYS.detail(starshipId) }),
      ])
    } catch (e) {
      toast({
        title: 'Cancel Downgrade Failed',
        description: e instanceof Error ? e.message : 'Failed to cancel downgrade. Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (!starship) return null

  const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
  const currentRank = shipClassOrder[starship.shipClass] ?? 0

  const formatPlanDate = (iso: string): string => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d)
  }

  const planCardSurfaceClass = 'border border-slate-200 bg-[#F8F8FA] shadow-[3px_3px_0_0_rgb(226_232_240)]'
  const regularPlanGlowStyle: CSSProperties = {
    background: 'linear-gradient(to bottom, rgba(124, 58, 237, 0.28) 0%, rgba(167, 139, 250, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
  }
  const currentPlanGlowStyle: CSSProperties = {
    background: 'linear-gradient(to bottom, rgba(245, 158, 11, 0.2) 0%, rgba(251, 191, 36, 0.08) 7%, rgba(248, 248, 250, 0) 18%)',
  }

  return (
    <Card className={cn(PROFILE_SECTION_CARD_CLASS, cardClassName)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="layers" className="h-4 w-4 text-primary" />
          Upgrade starship
        </CardTitle>
        {!hideDescription && <CardDescription className="text-sm">Change your ship class and included limits.</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {Array.isArray(plans) && plans.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full min-w-0">
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
                  const cardGlowStyle = isCurrent ? currentPlanGlowStyle : regularPlanGlowStyle

                  const price = plan.unitAmount === null ? null : plan.unitAmount === 0 ? 'Free' : `$${(plan.unitAmount / 100).toFixed(2)}`
                  const cadence = plan.unitAmount === null ? '' : plan.unitAmount === 0 ? '' : `${plan.currency.toUpperCase()}/${plan.interval ?? 'mo'}`
                  const ctaLabel = isCurrent
                    ? 'Current plan'
                    : subscribeMutation.isPending
                      ? 'Updating…'
                      : isUpgrade
                        ? 'Upgrade'
                        : isDowngrade
                          ? `Downgrade to ${plan.displayName}`
                          : `Switch to ${plan.displayName}`

                  return (
                    <div
                      key={plan.priceId}
                      className={cn(
                        'relative isolate overflow-visible rounded-none text-left h-full w-full cursor-default transition-all duration-200',
                        planCardSurfaceClass,
                        subscribeMutation.isPending && 'opacity-70',
                        isCurrent ? 'border-primary/45 ring-2 ring-primary/20' : 'hover:shadow-[4px_4px_0_0_rgb(203_213_225)]'
                      )}
                    >
                      <div className="pointer-events-none absolute inset-0 z-0" style={cardGlowStyle} aria-hidden />
                      {/* Top meta - no upgrade badge, only Current on current plan */}
                      <div className="relative z-10 p-5 pb-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold tracking-tight truncate">{plan.displayName}</div>
                            <div className="mt-3 flex items-baseline gap-2">
                              <div className="text-3xl font-bold tracking-tight">{price ?? '—'}</div>
                              <div className="text-sm text-muted-foreground">{cadence}</div>
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.02em] text-primary shrink-0">
                              <Icon name="check-circle" className="h-3.5 w-3.5" />
                              Current
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 border-t border-border/70 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Included in this plan</div>
                      </div>

                      <div className="relative z-10 flex flex-col">
                        <div className="px-5 pb-5 space-y-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Icon name="users" className="h-4 w-4 text-primary" />
                              Max agents
                            </span>
                            <span className="font-semibold tabular-nums">{plan.entitlements.maxAgents}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Icon name="zap" className="h-4 w-4 text-primary" />
                              Parallel Tasks
                            </span>
                            <span className="font-semibold tabular-nums">{plan.entitlements.maxConcurrentTurns}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Icon name="coins" className="h-4 w-4 text-primary" />
                              Monthly credits
                            </span>
                            <span className="font-semibold tabular-nums">{plan.entitlements.monthlyCredits}</span>
                          </div>
                        </div>

                        <div className="px-5 pb-5 pt-1 border-t border-border/70">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSubscribe(plan.priceId)}
                            disabled={subscribeMutation.isPending || isCurrent}
                            variant="ghost"
                            className={cn(
                              'w-full gap-1.5 h-10',
                              isCurrent ? landingPrimaryCtaSection : landingPrimaryWhiteFaceCtaSection
                            )}
                          >
                            {!isCurrent && isUpgrade && <Icon name="arrow-up" className="h-3.5 w-3.5" />}
                            {ctaLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
            {subscriptionStatus?.renewAt ? (
              <div className="rounded-2xl border bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Subscription status</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {subscriptionStatus.cancelAtPeriodEnd
                        ? `Will be downgraded to Scout from ${formatPlanDate(subscriptionStatus.renewAt)}`
                        : `Plan will renew on ${formatPlanDate(subscriptionStatus.renewAt)}`}
                    </div>
                  </div>
                  {subscriptionStatus.cancelAtPeriodEnd ? (
                    <Button type="button" size="sm" variant="outline" onClick={handleCancelDowngrade} disabled={cancelDowngradeMutation.isPending} className="shrink-0">
                      {cancelDowngradeMutation.isPending ? 'Cancelling…' : 'Cancel downgrade'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No upgrade plans available.</div>
        )}
      </CardContent>
    </Card>
  )
}
