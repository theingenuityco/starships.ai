'use client'

import Link from 'next/link'
import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import FAQ, { type FAQItem } from '@/app/components/FAQ'
import TestimonialsSection from '@/app/components/TestimonialsSection'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'

function formatPlanPrice(unitAmount: number | null, currency: string, interval: string | null): string {
  if (unitAmount === null) return 'Custom'
  if (unitAmount === 0) return 'Free'

  const amount = unitAmount / 100
  const intervalLabel = interval === 'month' ? '/mo' : interval === 'year' ? '/yr' : interval ? `/${interval}` : '/mo'

  return `${new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount)}${intervalLabel}`
}

export default function PricingPageClient(): React.JSX.Element {
  const { isAuthenticated } = useAuth()
  const { data: plans = [], isLoading, isError } = useSubscriptionPlans(true, { publicAccess: !isAuthenticated })

  const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
  const accentByClass: Record<string, { ring: string; cardBg: string; stripe: string }> = {
    scout: {
      ring: 'ring-primary/20',
      cardBg: 'bg-gradient-to-b from-amber-50/80 via-card to-card dark:from-amber-950/25 dark:via-card dark:to-card',
      stripe: 'from-amber-400/30 via-amber-300/12 to-transparent dark:from-amber-300/22 dark:via-amber-300/8 dark:to-transparent',
    },
    frigate: {
      ring: 'ring-violet-500/20 dark:ring-violet-400/12',
      cardBg: 'bg-gradient-to-b from-violet-50/80 via-card to-card dark:from-violet-950/28 dark:via-card dark:to-card',
      stripe: 'from-violet-400/34 via-violet-300/16 to-transparent dark:from-violet-300/24 dark:via-violet-300/10 dark:to-transparent',
    },
    cruiser: {
      ring: 'ring-slate-400/20 dark:ring-slate-300/12',
      cardBg: 'bg-gradient-to-b from-slate-100/80 via-card to-card dark:from-slate-900/35 dark:via-card dark:to-card',
      stripe: 'from-slate-400/30 via-slate-300/14 to-transparent dark:from-slate-300/22 dark:via-slate-200/10 dark:to-transparent',
    },
  }

  const sortedPlans = [...plans].sort((a, b) => {
    const ar = shipClassOrder[a.shipClass] ?? 999
    const br = shipClassOrder[b.shipClass] ?? 999
    if (ar !== br) return ar - br
    const au = typeof a.unitAmount === 'number' ? a.unitAmount : Number.MAX_SAFE_INTEGER
    const bu = typeof b.unitAmount === 'number' ? b.unitAmount : Number.MAX_SAFE_INTEGER
    if (au !== bu) return au - bu
    return a.displayName.localeCompare(b.displayName)
  })

  const recommendedIndex = sortedPlans.length >= 3 ? 1 : sortedPlans.length === 2 ? 1 : 0
  const getPlanCtaHref = (_priceId: string): string => {
    if (!isAuthenticated) return '/login?returnUrl=%2Fupgrade'
    return '/upgrade'
  }

  const pricingFaqItems: FAQItem[] = [
    {
      q: 'How do I choose the right plan?',
      a: 'Start with the class that fits your current workload. You can upgrade anytime as your agent count and parallel task needs grow.',
    },
    {
      q: 'Can I switch plans later?',
      a: 'Yes. You can change plans from billing settings. Upgrades are immediate and downgrades can be scheduled.',
    },
    {
      q: 'What happens to my data if I downgrade?',
      a: 'Your workspace data stays intact. If your active usage exceeds lower-tier limits, you may need to reduce usage before downgrade applies.',
    },
    {
      q: 'How are monthly credits granted?',
      a: 'Monthly credits are granted through your subscription billing cycle and added to your starship wallet.',
    },
    {
      q: 'Do you offer a custom enterprise plan?',
      a: 'Yes. Use the Custom section on this page to contact us for tailored limits, rollout support, and account-specific requirements.',
    },
    {
      q: 'Where do I manage billing and plan changes?',
      a: 'Once logged in, go to your starship settings under Upgrade/Billing to manage plans and subscription status.',
    },
  ]

  return (
    <div className="min-h-[100dvh] bg-background">
      <PublicHeader />

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-8 text-center sm:px-8 sm:pt-14">
          <Badge variant="secondary" className="mb-4">
            Pricing
          </Badge>
          <h1 className="text-balance text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Simple plans that <span className="text-primary">scale with your automation</span>
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-pretty text-sm text-muted-foreground sm:text-base">
            Pick the ship class that matches your workload. Each plan includes limits for deployed agents, parallel tasks, and monthly credits with transparent billing.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <Icon name="shield-check" className="h-4 w-4 text-primary" />
            <span>No hidden fees.</span>
            <span className="text-border">•</span>
            <span>Upgrade or downgrade anytime.</span>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-8">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[0, 1, 2].map(idx => (
                <Card key={idx} className="h-72 animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <Card className="mx-auto max-w-2xl border-destructive/30">
              <CardHeader>
                <CardTitle>Couldn&apos;t load plans right now</CardTitle>
                <CardDescription>Our pricing catalog is temporarily unavailable. Please refresh in a moment.</CardDescription>
              </CardHeader>
            </Card>
          ) : sortedPlans.length === 0 ? (
            <Card className="mx-auto max-w-2xl">
              <CardHeader>
                <CardTitle>No plans available</CardTitle>
                <CardDescription>There are no active plan entries in the catalog at the moment.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {sortedPlans.map((plan, idx) => {
                const accent = accentByClass[plan.shipClass] ?? accentByClass.scout
                const isRecommended = idx === recommendedIndex

                return (
                  <div
                    key={plan.priceId}
                    className={`
                      relative overflow-hidden rounded-2xl border text-left h-full w-full transition-all duration-200
                      ${accent.cardBg}
                      ${isRecommended ? 'border-primary/50 shadow-lg ring-2 ring-primary/20 md:-translate-y-1' : 'border-border hover:border-muted-foreground/40 hover:shadow-sm'}
                    `}
                  >
                    <div className={`pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b ${accent.stripe}`} />
                    {isRecommended ? (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.08] via-transparent to-transparent" />
                    ) : null}
                    <div className="relative p-5 pb-4">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold tracking-tight truncate">{plan.displayName}</div>
                          {isRecommended ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.02em] text-primary">
                              <Icon name="sparkles" className="h-3 w-3" />
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-baseline gap-1.5">
                          <div className="text-3xl font-bold tracking-tight">{formatPlanPrice(plan.unitAmount, plan.currency, plan.interval)}</div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">{plan.description || `Built for ${plan.displayName.toLowerCase()} teams`}</div>
                      </div>
                      <div className="mt-4 border-t border-border/70 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Included in this plan</div>
                    </div>

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

                      <div className="border-t border-border/70 pt-4">
                        <Button asChild type="button" size="sm" variant={isRecommended ? 'default' : 'secondary'} className="w-full gap-1.5 h-10">
                          <Link href={getPlanCtaHref(plan.priceId)}>
                            {!isAuthenticated && plan.unitAmount === 0 ? 'Get Started Free' : 'Choose plan'}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-8">
          <div className="relative group">
            <div className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
            <Card className="relative overflow-hidden px-6 sm:px-8 py-8 sm:py-9 border-0 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500">
              <div className="max-w-2xl text-left">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-black/10 px-2.5 py-1 text-[11px] font-medium text-white">
                    <Icon name="shield-check" className="h-3.5 w-3.5 text-white" />
                    SLA-ready
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-black/10 px-2.5 py-1 text-[11px] font-medium text-white">
                    <Icon name="sparkles" className="h-3.5 w-3.5 text-white" />
                    Custom limits
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-black/10 px-2.5 py-1 text-[11px] font-medium text-white">
                    <Icon name="users" className="h-3.5 w-3.5 text-white" />
                    Team rollout support
                  </span>
                </div>
                <div className="text-xs uppercase tracking-wide text-white/90">Custom</div>
                <h3 className="mt-1 text-2xl md:text-3xl font-semibold text-white">Perfect for scale</h3>
                <p className="mt-2 text-sm text-white" style={{ color: '#fff' }}>
                  Need higher limits, dedicated support, or enterprise rollout planning? Let&apos;s tailor a plan for your workload and team.
                </p>
              </div>
              <a
                href="mailto:tech@theingenuity.co"
                className="relative inline-flex h-14 px-8 items-center justify-center text-base sm:text-lg leading-none overflow-hidden rounded-full whitespace-nowrap text-center text-slate-900 bg-gradient-to-b from-white via-white to-slate-100 shadow-[0_6px_0_0_rgba(15,23,42,0.18)] hover:shadow-[0_4px_0_0_rgba(15,23,42,0.22)] hover:-translate-y-[1px] active:shadow-[0_0px_0_0_rgba(15,23,42,0.22)] active:translate-y-[2px] transition self-center"
              >
                Contact us
              </a>
            </Card>
          </div>
        </section>

        <TestimonialsSection />

        <FAQ items={pricingFaqItems} title="Pricing FAQs" />
      </main>

      <PublicFooter fromPath="/pricing" showTopDivider={false} />
    </div>
  )
}
