'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'
import FAQ, { type FAQItem } from '@/app/components/FAQ'
import TestimonialsSection from '@/app/components/TestimonialsSection'
import { landingPrimaryCtaSection, landingPrimaryWhiteFaceCtaSection, landingWhiteCtaOnGradientLg } from '@/app/components/landing/landingSurface'
import Icon from '@/components/primitives/Icon'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { cn } from '@/lib/utils'

type PlanPriceLine = { mode: 'plain'; text: string } | { mode: 'withInterval'; amount: string; intervalTail: string }

function getPlanPriceLine(unitAmount: number | null, currency: string, interval: string | null): PlanPriceLine {
  if (unitAmount === null) return { mode: 'plain', text: 'Custom' }
  if (unitAmount === 0) return { mode: 'plain', text: 'Free' }

  const amount = unitAmount / 100
  const intervalTail = interval === 'month' ? 'mo' : interval === 'year' ? 'yr' : interval ? interval.replace(/^\//, '') : 'mo'

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
    currencyDisplay: 'narrowSymbol',
  }).format(amount)

  return { mode: 'withInterval', amount: formattedAmount, intervalTail }
}

export default function PricingPageClient(): React.JSX.Element {
  const { isAuthenticated } = useAuth()
  const { data: plans = [], isLoading, isError } = useSubscriptionPlans(true, { publicAccess: !isAuthenticated })

  const shipClassOrder: Record<string, number> = { scout: 0, frigate: 1, cruiser: 2 }
  /** Same flat fill and hard-offset depth as landing `shellMuted` / Security cards. */
  const planCardSurfaceClass = 'border border-slate-200 bg-[#F8F8FA] shadow-[3px_3px_0_0_rgb(226_232_240)]'
  /**
   * Top → bottom wash (inline gradient so opacity reads on `#F8F8FA`; Tailwind-only stops were too faint).
   * Subtle under plan title/price; fades out by ~18% height from the top.
   */
  const planCardGlowStyleByClass: Record<string, CSSProperties> = {
    scout: {
      background: 'linear-gradient(to bottom, rgba(124, 58, 237, 0.28) 0%, rgba(167, 139, 250, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
    },
    frigate: {
      background: 'linear-gradient(to bottom, rgba(217, 119, 6, 0.3) 0%, rgba(251, 191, 36, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
    },
    cruiser: {
      background: 'linear-gradient(to bottom, rgba(124, 58, 237, 0.28) 0%, rgba(167, 139, 250, 0.14) 7%, rgba(248, 248, 250, 0) 18%)',
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
  const getPlanColumnStyle = (shipClass: string): CSSProperties => {
    if (shipClass === 'frigate') return { backgroundColor: '#FFF1CC' }
    if (shipClass === 'scout' || shipClass === 'cruiser') return { backgroundColor: '#FEF6FD' }
    return {}
  }

  type ComparisonRow =
    | {
        type: 'check'
        label: string
        help: string
        includes: (planIndex: number) => boolean
      }
    | {
        type: 'value'
        label: string
        help: string
        getValue: (plan: (typeof sortedPlans)[number]) => string
      }

  const comparisonRows: ComparisonRow[] = [
    {
      type: 'check',
      label: 'Specialist agents for recurring operations',
      help: 'Build role-specific agents that repeatedly handle operational work.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Connectors for tool actions across your stack',
      help: 'Let agents take actions through connected tools and external apps.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Scheduled recurring automations',
      help: 'Set recurring schedules so agents run automatically on defined intervals.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Live run visibility and execution trace',
      help: 'Track execution progress and review run-level history for each workflow.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Tool approvals and control (allow / ask / deny)',
      help: 'Control agent tool behavior with explicit approval and policy settings.',
      includes: planIndex => planIndex >= 0,
    },
    {
      type: 'check',
      label: 'Multi-agent delegation in one flow',
      help: 'Route work across specialist agents inside the same operational flow.',
      includes: planIndex => planIndex >= 1,
    },
    {
      type: 'check',
      label: 'Higher parallel task capacity',
      help: 'Run more agent tasks concurrently for higher throughput.',
      includes: planIndex => planIndex >= 1,
    },
    {
      type: 'value',
      label: 'Monthly credits included',
      help: 'Credits included in each billing cycle for model and automation usage.',
      getValue: plan => `${plan.entitlements.monthlyCredits.toLocaleString()} credits`,
    },
    {
      type: 'check',
      label: 'Custom limits for volume and operating model',
      help: 'Adjust plan limits for larger usage and operational requirements.',
      includes: planIndex => planIndex >= 2,
    },
    {
      type: 'check',
      label: 'Direct high-touch support channel',
      help: 'Access a direct support path for faster issue handling.',
      includes: planIndex => planIndex >= 2,
    },
    {
      type: 'check',
      label: 'Fast email support (business days)',
      help: 'Business-day support with quick email turnaround.',
      includes: planIndex => planIndex === 0,
    },
    {
      type: 'check',
      label: 'Priority email support (faster responses)',
      help: 'Accelerated support response times for active production teams.',
      includes: planIndex => planIndex === 1,
    },
    {
      type: 'check',
      label: 'Dedicated enterprise support with rapid response',
      help: 'High-touch enterprise support for complex deployments.',
      includes: planIndex => planIndex === 2,
    },
  ]
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
      a: 'Yes. Use the Contact us section on this page to email us with what you need.',
    },
    {
      q: 'Where do I manage billing and plan changes?',
      a: 'Once logged in, go to your starship settings under Upgrade/Billing to manage plans and subscription status.',
    },
  ]

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PublicHeader />

      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-8 px-4 pt-12 pb-10 sm:gap-10 sm:px-8 sm:pt-20 sm:pb-16 min-h-[calc(100svh-9rem)] md:min-h-[calc(100svh-9.5rem)]">
          <section className="shrink-0 text-center">
            <h1 className="text-balance text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              Simple plans that <span className="text-primary">scale with your automation</span>
            </h1>
            <p className="mx-auto mt-4 max-w-3xl text-pretty text-sm text-muted-foreground sm:text-base">Every plan lists your agent limit, parallel-task cap, and monthly credits.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground sm:gap-x-2.5 sm:text-sm">
              <span className="inline-flex items-center gap-1.5 sm:gap-2">
                <Icon name="shield-check" className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="whitespace-nowrap">No hidden fees.</span>
              </span>
              <span className="select-none px-0.5 text-muted-foreground/40 sm:px-1" aria-hidden></span>
              <span className="inline-flex items-center gap-1.5 sm:gap-2">
                <Icon name="arrows-down-up" className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>Upgrade or downgrade anytime.</span>
              </span>
            </div>
          </section>

          <section className="w-full shrink-0 pb-2">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[0, 1, 2].map(idx => (
                  <Card key={idx} className="h-72 animate-pulse rounded-none" />
                ))}
              </div>
            ) : isError ? (
              <Card className="mx-auto max-w-2xl rounded-none border-destructive/30">
                <CardHeader>
                  <CardTitle>Couldn&apos;t load plans right now</CardTitle>
                  <CardDescription>Our pricing catalog is temporarily unavailable. Please refresh in a moment.</CardDescription>
                </CardHeader>
              </Card>
            ) : sortedPlans.length === 0 ? (
              <Card className="mx-auto max-w-2xl rounded-none">
                <CardHeader>
                  <CardTitle>No plans available</CardTitle>
                  <CardDescription>There are no active plan entries in the catalog at the moment.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {sortedPlans.map((plan, idx) => {
                  const cardGlowStyle = planCardGlowStyleByClass[plan.shipClass] ?? planCardGlowStyleByClass.scout
                  const isRecommended = idx === recommendedIndex
                  const priceLine = getPlanPriceLine(plan.unitAmount, plan.currency, plan.interval)

                  return (
                    <div
                      key={plan.priceId}
                      className={cn(
                        /* overflow visible so CTA box-shadow (3D lip) is not clipped */
                        'relative isolate overflow-visible rounded-none text-left h-full w-full transition-all duration-200',
                        planCardSurfaceClass,
                        isRecommended
                          ? 'border-primary/45 ring-2 ring-primary/20 ring-offset-0'
                          : /* Avoid hover translate — it exposes a subpixel “white line” at the top vs Frigate (no lift). */
                            'hover:shadow-[4px_4px_0_0_rgb(203_213_225)]'
                      )}
                    >
                      <div className="pointer-events-none absolute inset-0 z-0" style={cardGlowStyle} aria-hidden />
                      {isRecommended ? (
                        <div
                          className="pointer-events-none absolute inset-0 z-0"
                          style={{
                            background: 'linear-gradient(to bottom, rgba(245, 158, 11, 0.2) 0%, rgba(251, 191, 36, 0.08) 7%, rgba(248, 248, 250, 0) 18%)',
                          }}
                          aria-hidden
                        />
                      ) : null}
                      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
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
                            <div className="mt-3 flex flex-wrap items-baseline gap-0 font-bold tracking-tight">
                              {priceLine.mode === 'plain' ? (
                                <span className="text-3xl">{priceLine.text}</span>
                              ) : (
                                <>
                                  <span className="text-3xl tabular-nums leading-none">{priceLine.amount}</span>
                                  <span className="text-sm sm:text-base font-bold tabular-nums leading-none">/{priceLine.intervalTail}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 border-t border-border/70 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Included in this plan</div>
                        </div>

                        <div className="mt-auto px-5 pb-5 space-y-3">
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

                          <div className="border-t border-border/70 pt-4 pb-1.5">
                            <Link
                              href={getPlanCtaHref(plan.priceId)}
                              className={cn(isRecommended ? landingPrimaryCtaSection : landingPrimaryWhiteFaceCtaSection, 'relative z-10 w-full justify-center')}
                            >
                              {!isAuthenticated && plan.unitAmount === 0 ? 'Get Started Free' : 'Choose plan'}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {!isLoading && !isError && sortedPlans.length > 0 ? (
            <section className="w-full shrink-0">
              <div className="overflow-hidden rounded-none border border-slate-200 bg-[#F8F8FA] shadow-[3px_3px_0_0_rgb(226_232_240)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] table-fixed border-collapse text-left">
                    <colgroup>
                      <col className="w-[40%]" />
                      <col className="w-[20%]" />
                      <col className="w-[20%]" />
                      <col className="w-[20%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border/70 bg-white">
                        <th className="px-5 py-4 sm:px-6" />
                        {sortedPlans.map((plan, idx) => {
                          const isRecommended = idx === recommendedIndex
                          const priceLine = getPlanPriceLine(plan.unitAmount, plan.currency, plan.interval)
                          return (
                            <th key={`comparison-header-${plan.priceId}`} className="px-4 py-4 text-center align-top sm:px-5" style={getPlanColumnStyle(plan.shipClass)}>
                              <div
                                className={cn(
                                  'mx-auto flex h-[200px] w-full max-w-[260px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm',
                                  isRecommended && 'border-fuchsia-300 shadow-[0_0_0_1px_rgba(217,70,239,0.15)]'
                                )}
                              >
                                <div className={cn('py-1 text-[10px] font-semibold uppercase tracking-wide', isRecommended ? 'bg-fuchsia-500 text-white' : 'bg-transparent text-transparent')}>
                                  Most Popular
                                </div>
                                <div className="flex flex-1 flex-col justify-between px-6 py-5">
                                  <div className="space-y-2">
                                    <div className="text-[28px] leading-none font-semibold tracking-tight text-foreground">{plan.displayName}</div>
                                    <div className="flex items-baseline justify-center gap-0.5 font-bold text-foreground">
                                    {priceLine.mode === 'plain' ? (
                                      <span className="text-[2rem] leading-none">{priceLine.text}</span>
                                    ) : (
                                      <>
                                        <span className="text-[2rem] tabular-nums leading-none">{priceLine.amount}</span>
                                        <span className="text-xs font-semibold text-muted-foreground">/{priceLine.intervalTail}</span>
                                      </>
                                    )}
                                  </div>
                                  </div>
                                  <Link
                                    href={getPlanCtaHref(plan.priceId)}
                                    className={cn(
                                      isRecommended ? landingPrimaryCtaSection : landingPrimaryWhiteFaceCtaSection,
                                      'relative z-10 w-full justify-center px-3 py-2 text-sm'
                                    )}
                                  >
                                    {!isAuthenticated && plan.unitAmount === 0 ? 'Get Started Free' : 'Choose plan'}
                                  </Link>
                                </div>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row, idx) => (
                        <tr key={row.label} className="border-b border-border/60 bg-white">
                          <td className="px-5 py-3 text-[15px] text-foreground sm:px-6">
                            <div className="flex items-center gap-2">
                              <span className="leading-snug">{row.label}</span>
                              <span
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white text-[10px] font-semibold text-muted-foreground cursor-help"
                                title={row.help}
                                aria-label={`About ${row.label}`}
                              >
                                i
                              </span>
                            </div>
                          </td>
                          {sortedPlans.map((plan, planIdx) => {
                            if (row.type === 'value') {
                              return (
                                <td key={`${row.label}-${plan.priceId}`} className="px-4 py-3 text-center sm:px-5" style={getPlanColumnStyle(plan.shipClass)}>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="text-[15px] font-semibold tabular-nums text-foreground">{row.getValue(plan)}</span>
                                    <span className="text-[11px] text-muted-foreground">included / month</span>
                                  </div>
                                </td>
                              )
                            }
                            const included = row.includes(planIdx)
                            return (
                              <td key={`${row.label}-${plan.priceId}`} className="px-4 py-3 text-center sm:px-5" style={getPlanColumnStyle(plan.shipClass)}>
                                <span
                                  className={cn(
                                    'inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[11px] font-bold transition-colors',
                                    included ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-300'
                                  )}
                                  aria-label={included ? 'Included' : 'Not included'}
                                >
                                  {included ? '✓' : ''}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8">
          <div className="group relative w-full">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="absolute -inset-[2px] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 opacity-50 blur-md transition-opacity duration-500 group-hover:opacity-80" />
            </div>
            <div className="relative flex w-full flex-col items-stretch gap-6 overflow-hidden !rounded-none border-0 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 px-6 py-8 text-white shadow-lg sm:px-8 sm:py-9 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1 text-left">
                <h3 className="text-2xl font-semibold text-white md:text-3xl">Request a custom quote</h3>
                <p className="mt-2 max-w-2xl text-sm text-white/90">Looking for enterprise solutions? Email us what you need.</p>
              </div>
              <a href="mailto:tech@theingenuity.co" className={`${landingWhiteCtaOnGradientLg} shrink-0 self-center md:self-center`}>
                Contact us
              </a>
            </div>
          </div>
        </section>

        <TestimonialsSection />

        <FAQ items={pricingFaqItems} title="Pricing FAQs" sectionTone="white" />
      </main>

      <PublicFooter fromPath="/pricing" showTopDivider={true} topDividerVariant="theme" />
    </div>
  )
}
